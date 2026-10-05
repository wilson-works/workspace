'use strict';

/**
 * work.js — the Work page: projects read from folders on this machine.
 *
 * A project is a folder holding a PROJECT.md and a steps/ folder of numbered
 * Markdown files (projects/README.md has the format). The WorkSpace ships two in
 * projects/: the Get started course and a demo app. workspace.config.json
 * `work_folders` adds more folders that hold project folders, so private work can
 * live outside this repo.
 *
 * Where a step stands: its own `status:` line, else To do. A mark made on the
 * page or with `node bin/work.js mark` wins, and is kept in
 * <office home>/work/progress.json - the office never writes into a project.
 *
 * Private work: a project whose folder matches `privacy.private_work` is listed
 * as "Private project" under an opaque key, its steps as Step 1, Step 2 ... with
 * ids P1, P2 ..., and its steps' text is not served: a folder, a file name or a
 * step id can each be a client's name. Open it in your editor.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,60}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,40}$/;
const STATES = ['todo', 'doing', 'done'];
const PEEK = 3;
// Read as numbers; everything else (an id like 007 included) stays text.
const NUMERIC = new Set(['minutes', 'order']);

/** `---` front matter -> {meta, body}. Values are text or numbers; a trailing ` # note` is dropped. */
function parse(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  const meta = {};
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
      if (!kv) continue;
      let v = kv[2].replace(/\s+#\s.*$/, '').trim();
      if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
      const key = kv[1].toLowerCase();
      meta[key] = NUMERIC.has(key) && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
    }
  }
  return { meta, body: m ? src.slice(m[0].length) : src };
}

function folders() {
  const own = path.join(config.ROOT, 'projects');
  return [own].concat(config.load().work_folders || []);
}

function readText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; }
}

function progressFile(home) { return path.join(home, 'work', 'progress.json'); }

function readProgress(home) {
  try { return JSON.parse(fs.readFileSync(progressFile(home), 'utf8')) || {}; } catch (_) { return {}; }
}

/** Every project folder: [{key, dir, meta, body}], first folder wins on a repeated key. */
function projects() {
  const out = [];
  const seen = new Set();
  for (const root of folders()) {
    let names = [];
    try { names = fs.readdirSync(root); } catch (_) { continue; }
    for (const name of names.sort()) {
      if (!KEY_RE.test(name) || seen.has(name.toLowerCase())) continue;
      const dir = path.join(root, name);
      const text = readText(path.join(dir, 'PROJECT.md'));
      if (text === null) continue;
      seen.add(name.toLowerCase());
      const { meta, body } = parse(text);
      const priv = config.isPrivate(dir);
      const key = priv ? `private-${crypto.createHash('sha1').update(dir.toLowerCase()).digest('hex').slice(0, 8)}` : name;
      out.push({ key, dir, meta, body, private: priv });
    }
  }
  return out;
}

/** A project's steps, in file-name order, with where each stands. */
function steps(p, progress) {
  let files = [];
  try { files = fs.readdirSync(path.join(p.dir, 'steps')).filter((f) => /\.md$/i.test(f)).sort(); } catch (_) { return []; }
  const marks = (progress && progress[p.key]) || {};
  const out = [];
  for (const f of files) {
    const text = readText(path.join(p.dir, 'steps', f));
    if (text === null) continue;
    const { meta, body } = parse(text);
    const id = p.private ? `P${out.length + 1}`
      : ID_RE.test(String(meta.id || '')) ? String(meta.id) : f.replace(/\.md$/i, '');
    if (out.some((s) => s.id === id)) continue;
    const own = STATES.includes(String(meta.status || '').toLowerCase()) ? String(meta.status).toLowerCase() : 'todo';
    const mark = marks[id] && STATES.includes(marks[id].status) ? marks[id] : null;
    out.push({
      id,
      title: p.private ? null : String(meta.title || id),
      minutes: typeof meta.minutes === 'number' ? meta.minutes : null,
      who: p.private ? null : (meta.who ? String(meta.who) : null),
      status: mark ? mark.status : own,
      marked_at: mark ? mark.at || null : null,
      body: p.private ? null : body,
    });
  }
  return out;
}

const pctOf = (done, total) => (total > 0 ? Math.round((done / total) * 100) : null);
const label = (s) => (s.title ? s.title : /^P\d+$/.test(s.id) ? `Step ${s.id.slice(1)}` : `Step ${s.id}`);
const card = (s) => ({ id: s.id, label: label(s), minutes: s.minutes, who: s.who });

function head(p) {
  const kind = p.meta.kind === 'course' ? 'course' : 'project';
  return {
    key: p.key,
    name: p.private ? 'Private project' : String(p.meta.name || p.key),
    summary: p.private ? 'Private work' : (p.meta.summary ? String(p.meta.summary) : null),
    kind,
    order: typeof p.meta.order === 'number' ? p.meta.order : 100,
    private: p.private,
  };
}

function countsOf(list) {
  const c = { todo: 0, doing: 0, done: 0, total: list.length };
  for (const s of list) c[s.status] += 1;
  return c;
}

/** GET /api/work */
function list(home, now) {
  const progress = readProgress(home);
  const out = projects().map((p) => {
    const all = steps(p, progress);
    const c = countsOf(all);
    const next = all.find((s) => s.status === 'doing') || all.find((s) => s.status === 'todo') || null;
    return Object.assign(head(p), {
      counts: c,
      pct: pctOf(c.done, c.total),
      next: next ? card(next) : null,
      kanban: Object.fromEntries(STATES.map((st) => {
        const xs = all.filter((s) => s.status === st);
        return [st, { count: xs.length, cards: (st === 'done' ? xs.slice(-PEEK).reverse() : xs.slice(0, PEEK)).map(card) }];
      })),
    });
  });
  out.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  return { ok: true, asOf: now, projects: out };
}

function find(key) {
  const want = String(key || '').toLowerCase();
  return projects().find((p) => p.key.toLowerCase() === want) || null;
}

/** GET /api/work/<project> */
function project(home, key, now) {
  const p = find(key);
  if (!p) return { ok: false, asOf: now, error: `There is no project called ${key}.` };
  const all = steps(p, readProgress(home));
  const c = countsOf(all);
  return {
    ok: true,
    asOf: now,
    project: Object.assign(head(p), { body: p.private ? null : p.body }),
    counts: c,
    pct: pctOf(c.done, c.total),
    steps: all.map((s) => Object.assign(card(s), { status: s.status })),
  };
}

/** GET /api/step/<project>/<id> */
function step(home, key, id, now) {
  const p = find(key);
  if (!p) return { ok: false, asOf: now, error: `There is no project called ${key}.` };
  const all = steps(p, readProgress(home));
  const i = all.findIndex((s) => s.id.toLowerCase() === String(id || '').toLowerCase());
  if (i < 0) return { ok: false, asOf: now, error: `${head(p).name} has no step ${id}.` };
  const s = all[i];
  return {
    ok: true,
    asOf: now,
    project: head(p),
    id: s.id, title: label(s), minutes: s.minutes, who: s.who, status: s.status, marked_at: s.marked_at,
    body: s.body,
    notice: p.private ? 'This is private work, so its text stays off the office. Open it in your editor on this computer.' : null,
    prev: i > 0 ? card(all[i - 1]) : null,
    next: i < all.length - 1 ? card(all[i + 1]) : null,
    position: { at: i + 1, of: all.length },
  };
}

/** Mark a step To do, Doing or Done (the page's buttons and bin/work.js). */
function mark(home, key, id, status, now) {
  const st = String(status || '').toLowerCase();
  if (!STATES.includes(st)) return { ok: false, error: 'The status must be todo, doing or done.' };
  const p = find(key);
  if (!p) return { ok: false, error: `There is no project called ${key}.` };
  const s = steps(p, {}).find((x) => x.id.toLowerCase() === String(id || '').toLowerCase());
  if (!s) return { ok: false, error: `${head(p).name} has no step ${id}.` };
  const all = readProgress(home);
  all[p.key] = all[p.key] || {};
  all[p.key][s.id] = { status: st, at: now || Date.now() };
  fs.mkdirSync(path.dirname(progressFile(home)), { recursive: true });
  const tmp = `${progressFile(home)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2), 'utf8');
  fs.renameSync(tmp, progressFile(home));
  return { ok: true, project: p.key, id: s.id, status: st };
}

module.exports = { parse, list, project, step, mark, folders, STATES };
