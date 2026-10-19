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
 *
 * The page opens with Running now (liveWork): the sessions at work this minute,
 * read off the floor, so the Work page shows what is actually being worked on,
 * not only what the projects' steps say.
 *
 * The eight boxes: an order in a project moves New, Build, Review, Verify, Ready,
 * Approved, CI/CD, Shipped (STAGES). `todo`, `doing` and `done` still work and mean
 * New, Build and Shipped. Each step also keeps its plain lane (todo, doing, done) for
 * the course view and the command line.
 *
 * Told truthfully (truth): an order in Build is Running only while a live session
 * (working or waiting) is in its project; otherwise it is Staged, waiting to start.
 * One nobody has been on for STALE_MS goes back to the queue as New. There is no
 * stalled state and no restart: you start it again like any new order.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,60}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,40}$/;
const STATES = ['todo', 'doing', 'done'];
const STAGES = ['new', 'build', 'review', 'verify', 'ready', 'approved', 'cicd', 'shipped'];
const STAGE_LABEL = { new: 'New', build: 'Build', review: 'Review', verify: 'Verify', ready: 'Ready', approved: 'Approved', cicd: 'CI/CD', shipped: 'Shipped' };
const ALIAS = { todo: 'new', doing: 'build', done: 'shipped' };
const STALE_MS = 3 * 3600 * 1000;   // Build with nobody on it this long: back to the queue
const PEEK = 3;

/** A stage from any spelling ("CI/CD", "doing", "Ready"), or null. */
function stageOf(v) {
  const s = String(v || '').toLowerCase().replace(/[^a-z]/g, '');
  return STAGES.includes(s) ? s : ALIAS[s] || null;
}
const laneOf = (stage) => (stage === 'new' ? 'todo' : stage === 'shipped' ? 'done' : 'doing');
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

/** Where projects are read from: projects/, work_folders, and the office's own care project (care.js) when home is given. */
function folders(home) {
  const own = path.join(config.ROOT, 'projects');
  const care = home ? [path.join(home, 'care', 'projects')] : [];
  return [own].concat(config.load().work_folders || [], care);
}

function readText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; }
}

function progressFile(home) { return path.join(home, 'work', 'progress.json'); }

function readProgress(home) {
  try { return JSON.parse(fs.readFileSync(progressFile(home), 'utf8')) || {}; } catch (_) { return {}; }
}

/** Every project folder: [{key, dir, meta, body}], first folder wins on a repeated key. */
function projects(home) {
  const out = [];
  const seen = new Set();
  for (const root of folders(home)) {
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
    const file = path.join(p.dir, 'steps', f);
    const text = readText(file);
    if (text === null) continue;
    const { meta, body } = parse(text);
    const id = p.private ? `P${out.length + 1}`
      : ID_RE.test(String(meta.id || '')) ? String(meta.id) : f.replace(/\.md$/i, '');
    if (out.some((s) => s.id === id)) continue;
    const own = stageOf(meta.status) || 'new';
    const m = marks[id];
    const marked = m ? stageOf(m.stage) || stageOf(m.status) : null;
    const stage = marked || own;
    let since = marked ? m.at || null : null;
    if (!since) { try { since = fs.statSync(file).mtimeMs; } catch (_) { since = null; } }
    out.push({
      id,
      title: p.private ? null : String(meta.title || id),
      minutes: typeof meta.minutes === 'number' ? meta.minutes : null,
      who: p.private ? null : (meta.who ? String(meta.who) : null),
      stage,
      status: laneOf(stage),
      since,
      marked_at: marked ? m.at || null : null,
      body: p.private ? null : body,
    });
  }
  return out;
}

const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** The live sessions (working or waiting) in a project: their repo or room is the project's folder or name. */
function liveOn(p, sessions) {
  const keys = new Set([norm(p.key), norm(p.meta && p.meta.name), norm(path.basename(p.dir))].filter(Boolean));
  return (sessions || []).filter((s) => (s.state === 'working' || s.state === 'waiting')
    && [s.repo, s.room].some((r) => r && keys.has(norm(r))));
}

/**
 * The truth rules, for a project's orders (not a course's lessons). Build with a live session in its project is
 * Running; Build with nobody on it is Staged (waiting to start); Build nobody has been on for STALE_MS is New again,
 * back in the queue. Without the floor (sessions undefined: the command line) steps stay as marked.
 */
function truth(p, list, sessions, now) {
  if (!Array.isArray(sessions) || p.meta.kind === 'course') return list;
  const live = liveOn(p, sessions);
  const who = live.length ? ((live[0].display && live[0].display.name) || live[0].name || null) : null;
  return list.map((s) => {
    if (s.stage !== 'build') return s;
    if (live.length) return Object.assign({}, s, { truth: 'running', live_name: p.private ? null : who });
    if (s.since && now - s.since > STALE_MS) return Object.assign({}, s, { stage: 'new', status: 'todo', truth: 'requeued' });
    return Object.assign({}, s, { truth: 'staged' });
  });
}

const pctOf = (done, total) => (total > 0 ? Math.round((done / total) * 100) : null);
const label = (s) => (s.title ? s.title : /^P\d+$/.test(s.id) ? `Step ${s.id.slice(1)}` : `Step ${s.id}`);
const card = (s) => ({
  id: s.id, label: label(s), minutes: s.minutes, who: s.who,
  stage: s.stage, stage_label: STAGE_LABEL[s.stage], truth: s.truth || null, live_name: s.live_name || null,
});

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

/** How many steps sit in each of the eight boxes, and how many are running, staged or back in the queue. */
function boxesOf(list) {
  const b = Object.fromEntries(STAGES.map((k) => [k, 0]));
  const t = { running: 0, staged: 0, requeued: 0 };
  for (const s of list) { b[s.stage] += 1; if (s.truth) t[s.truth] += 1; }
  return Object.assign(b, t);
}

/** GET /api/work. sessions: the floor's sessions now (the truth rules); left out, steps stay as marked. */
function list(home, now, sessions) {
  const progress = readProgress(home);
  const out = projects(home).map((p) => {
    const all = truth(p, steps(p, progress), sessions, now);
    const c = countsOf(all);
    const next = all.find((s) => s.status === 'doing') || all.find((s) => s.status === 'todo') || null;
    return Object.assign(head(p), {
      counts: c,
      boxes: boxesOf(all),
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

function find(key, home) {
  const want = String(key || '').toLowerCase();
  return projects(home).find((p) => p.key.toLowerCase() === want) || null;
}

/** GET /api/work/<project> */
function project(home, key, now, sessions) {
  const p = find(key, home);
  if (!p) return { ok: false, asOf: now, error: `There is no project called ${key}.` };
  const all = truth(p, steps(p, readProgress(home)), sessions, now);
  const c = countsOf(all);
  return {
    ok: true,
    asOf: now,
    project: Object.assign(head(p), { body: p.private ? null : p.body }),
    counts: c,
    boxes: boxesOf(all),
    pct: pctOf(c.done, c.total),
    steps: all.map((s) => Object.assign(card(s), { status: s.status })),
  };
}

/** GET /api/step/<project>/<id> */
function step(home, key, id, now, sessions) {
  const p = find(key, home);
  if (!p) return { ok: false, asOf: now, error: `There is no project called ${key}.` };
  const all = truth(p, steps(p, readProgress(home)), sessions, now);
  const i = all.findIndex((s) => s.id.toLowerCase() === String(id || '').toLowerCase());
  if (i < 0) return { ok: false, asOf: now, error: `${head(p).name} has no step ${id}.` };
  const s = all[i];
  return {
    ok: true,
    asOf: now,
    project: head(p),
    id: s.id, title: label(s), minutes: s.minutes, who: s.who, status: s.status, marked_at: s.marked_at,
    stage: s.stage, stage_label: STAGE_LABEL[s.stage], truth: s.truth || null, live_name: s.live_name || null,
    body: s.body,
    notice: p.private ? 'This is private work, so its text stays off the office. Open it in your editor on this computer.' : null,
    prev: i > 0 ? card(all[i - 1]) : null,
    next: i < all.length - 1 ? card(all[i + 1]) : null,
    position: { at: i + 1, of: all.length },
  };
}

const LIVE_RECENT_MS = 15 * 60000;   // a quiet session that did something this recently still shows in Running now

/**
 * Running now: what is being worked on right now, read off the floor itself (the sessions of the
 * office's last frame). Every session that is working, waiting, has helpers out, or did something in
 * the last 15 minutes, grouped by the repo or room it is in, busiest group first. Private work shows
 * as private work only: no title, no helper tasks, no repo or branch.
 */
function liveWork(sessions, at) {
  const groups = new Map();
  for (const s of sessions || []) {
    const busy = s.state === 'working' || s.state === 'waiting' || (s.helpers || []).length > 0;
    if (!busy && !(s.last_at && at - s.last_at < LIVE_RECENT_MS)) continue;
    const priv = !!s.client_work;
    const project = priv ? 'Private work' : s.repo || s.room || 'Unfiled';
    if (!groups.has(project)) groups.set(project, []);
    groups.get(project).push({
      key: `${s.machine}:${s.id}`, machine: s.machine,
      name: (s.display && (s.display.title ? s.display.name : s.display.label)) || s.name || 'A session',
      title: priv ? null : s.name || null,
      avatar: s.avatar || null, family: s.family || 'unknown', state: s.state,
      now: s.now || null, before: priv ? [] : (s.before || []).slice(0, 2), waiting: s.waiting || null,
      helpers: (s.helpers || []).map((h) => ({ task: priv ? null : h.task || null, type: h.type || 'helper', now: h.now || null })),
      repo: priv ? null : s.repo || null, branch: priv ? null : s.branch || null,
      started_at: s.started_at || null, last_at: s.last_at || null,
    });
  }
  const rank = { working: 0, waiting: 1, idle: 2 };
  return [...groups.entries()]
    .map(([project, list]) => ({
      project,
      working: list.filter((x) => x.state === 'working').length,
      sessions: list.sort((a, b) => (rank[a.state] ?? 3) - (rank[b.state] ?? 3) || (b.last_at || 0) - (a.last_at || 0)),
    }))
    .sort((a, b) => b.working - a.working || b.sessions.length - a.sessions.length || a.project.localeCompare(b.project));
}

/** Mark a step To do, Doing or Done (the page's buttons and bin/work.js). */
function mark(home, key, id, status, now) {
  const stage = stageOf(status);
  if (!stage) return { ok: false, error: `The status must be todo, doing or done, or one of the eight boxes: ${STAGES.join(', ')}.` };
  const p = find(key, home);
  if (!p) return { ok: false, error: `There is no project called ${key}.` };
  const s = steps(p, {}).find((x) => x.id.toLowerCase() === String(id || '').toLowerCase());
  if (!s) return { ok: false, error: `${head(p).name} has no step ${id}.` };
  const all = readProgress(home);
  all[p.key] = all[p.key] || {};
  all[p.key][s.id] = { status: laneOf(stage), stage, at: now || Date.now() };
  fs.mkdirSync(path.dirname(progressFile(home)), { recursive: true });
  const tmp = `${progressFile(home)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2), 'utf8');
  fs.renameSync(tmp, progressFile(home));
  return { ok: true, project: p.key, id: s.id, status: laneOf(stage), stage };
}

module.exports = { parse, list, project, step, mark, folders, liveWork, truth, stageOf, STATES, STAGES, STAGE_LABEL, STALE_MS };
