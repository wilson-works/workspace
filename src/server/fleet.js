'use strict';

/**
 * fleet.js — the office's read of the fleet repo: the private git repo every computer of one person
 * shares (fleet/README.md, docs/ARCHITECTURE.md "The fleet repo").
 *
 *   fleetView(repoDir, self)     what the Fleet page shows: the computers and their heartbeats, the
 *                                board (counts and up to 10 titles per column), the open and taken
 *                                handoffs, and the latest 30 comms notes from every computer.
 *   registeredMachines(repoDir)  machines/<NAME>.json, for config.machines() and the CLI.
 *   readItems(repoDir, kind, status, limit)   the work orders or handoffs in one folder.
 *   selfIn(repoDir, fallback, computer)       this computer's name in the fleet.
 *
 * Bounded by design. It reads only inside repoDir: a file that resolves outside it (a link) is
 * skipped. It lists at most MAX_LIST names in any folder, reads no file over 64 KB (of a comms
 * file, which only ever grows, it reads the last 64 KB), and never walks below the fleet's own
 * folders. It never writes, never runs git, and never throws for a missing or half-made repo: what
 * it cannot read it leaves out. It hands back no absolute path, so the view is safe to serve to the
 * phone.
 */

const fs = require('fs');
const path = require('path');

const MAX_BYTES = 64 * 1024;
const MAX_LIST = 500;
const TITLES_PER_COLUMN = 10;
const COMMS_SHOWN = 30;
const COMMS_TEXT_CHARS = 600;
// The sync runs daily; a heartbeat older than a day and a bit means a day was missed.
const STALE_MS = 26 * 3600 * 1000;

const BOARD = ['backlog', 'doing', 'done', 'archive'];
const HANDOFFS = ['open', 'taken', 'done'];

function isFleet(dir) {
  if (!dir) return false;
  try { return fs.statSync(path.join(dir, 'fleet.json')).isFile(); } catch (_) { return false; }
}

function realOf(p) { try { return fs.realpathSync(p); } catch (_) { return null; } }

/** True when file, links resolved, sits inside dir. */
function inside(dirReal, file) {
  const r = realOf(file);
  if (!r || !dirReal) return false;
  const rel = path.relative(dirReal, r);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** A file's text when it is inside the repo and at most 64 KB; else null. */
function readSmall(dirReal, file) {
  try {
    if (!inside(dirReal, file)) return null;
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > MAX_BYTES) return null;
    return fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  } catch (_) { return null; }
}

/** The last 64 KB of a file inside the repo, starting at a whole line; else null. */
function readTail(dirReal, file) {
  let fd = null;
  try {
    if (!inside(dirReal, file)) return null;
    const st = fs.statSync(file);
    if (!st.isFile()) return null;
    const n = Math.min(st.size, MAX_BYTES);
    const buf = Buffer.alloc(n);
    fd = fs.openSync(file, 'r');
    fs.readSync(fd, buf, 0, n, st.size - n);
    let text = buf.toString('utf8');
    if (st.size > n) text = text.slice(text.indexOf('\n') + 1);
    return text.replace(/^﻿/, '');
  } catch (_) { return null; } finally {
    if (fd !== null) try { fs.closeSync(fd); } catch (_) { /* closed */ }
  }
}

/** File names with this extension directly in a folder, sorted, at most MAX_LIST. */
function listNames(folder, ext) {
  try {
    return fs.readdirSync(folder, { withFileTypes: true })
      .filter((e) => (e.isFile() || e.isSymbolicLink()) && e.name.endsWith(ext) && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort()
      .slice(0, MAX_LIST);
  } catch (_) { return []; }
}

function readJson(dirReal, file) {
  const t = readSmall(dirReal, file);
  if (t == null) return null;
  try { return JSON.parse(t); } catch (_) { return null; }
}

/** The `key: value` lines between the opening `---` lines of a markdown file, and what follows. */
function parseFront(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(String(text || ''));
  const front = {};
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const k = /^([A-Za-z_][\w-]*):[ \t]?(.*)$/.exec(line);
      if (!k) continue;
      let v = k[2].trim();
      if (/^".*"$/.test(v)) { try { v = JSON.parse(v); } catch (_) { /* keep it as written */ } }
      front[k[1]] = v;
    }
  }
  return { front, body: m ? String(text).slice(m[0].length) : String(text || '') };
}

/** A markdown file's title: its `title:` line, else its first `# ` heading, else null. */
function titleOf(front, body) {
  if (front.title) return String(front.title).slice(0, 200);
  const h = /^#[ \t]+(.+)$/m.exec(body || '');
  return h ? h[1].trim().slice(0, 200) : null;
}

const str = (v) => (v == null || v === '' ? null : String(v).slice(0, 120));

/** The computers registered in the fleet: machines/<NAME>.json. Never throws. */
function registeredMachines(repoDir) {
  if (!isFleet(repoDir)) return [];
  const dirReal = realOf(repoDir);
  const out = [];
  for (const f of listNames(path.join(repoDir, 'machines'), '.json')) {
    const m = readJson(dirReal, path.join(repoDir, 'machines', f));
    if (!m || typeof m !== 'object' || !m.name) continue;
    out.push({
      name: String(m.name).slice(0, 24),
      role: str(m.role),
      computer: str(m.computer),
      os: str(m.os),
      code_zone: str(m.code_zone),
      office_hub: m.office_hub === true,
      joined: str(m.joined),
      status: m.status === 'left' ? 'left' : 'active',
      left: str(m.left),
    });
  }
  return out;
}

/** This computer's name in the fleet: the machine whose `computer` is this one, else the fallback. */
function selfIn(repoDir, fallback, computer) {
  const c = String(computer || '').toUpperCase();
  const mine = c ? registeredMachines(repoDir).find((m) => String(m.computer || '').toUpperCase() === c && m.status !== 'left') : null;
  return mine ? mine.name : fallback;
}

function heartbeatOf(dirReal, repoDir, name, now) {
  const hb = readJson(dirReal, path.join(repoDir, 'heartbeats', `${name}.json`));
  if (!hb || typeof hb !== 'object') return null;
  const at = Date.parse(hb.at);
  const age = Number.isFinite(at) ? Math.max(0, now - at) : null;
  const n = (v) => (Number.isFinite(v) ? v : null);
  const board = {};
  for (const s of BOARD) board[s] = n(hb.board && hb.board[s]);
  return {
    at: Number.isFinite(at) ? at : null,
    age_ms: age,
    ok: age != null && age < STALE_MS,
    local: str(hb.local),
    // How the sync before this one went: ok, dirty, conflict or failed.
    previous: str(hb.last_sync && hb.last_sync.result),
    handoffs_waiting: n(hb.handoffs_waiting),
    handoffs_open: n(hb.handoffs_open),
    board,
    office: ['up', 'down'].includes(hb.office) ? hb.office : null,
  };
}

/**
 * The work orders (kind 'board') or handoffs (kind 'handoffs') in one status folder:
 * { count, items } with at most `limit` items read. Backlog, doing and open read oldest first;
 * done, archive and taken newest first.
 */
function readItems(repoDir, kind, status, limit) {
  const dirReal = realOf(repoDir);
  const folder = path.join(repoDir, kind, status);
  let names = listNames(folder, '.md');
  const count = names.length;
  if (['done', 'archive', 'taken'].includes(status)) names = names.slice().reverse();
  const items = [];
  for (const f of names.slice(0, limit == null ? MAX_LIST : limit)) {
    const id = f.replace(/\.md$/, '');
    const text = readSmall(dirReal, path.join(folder, f));
    const { front, body } = parseFront(text || '');
    const base = { id, title: titleOf(front, body) || id, created: str(front.created) };
    if (kind === 'handoffs') {
      items.push(Object.assign(base, {
        from: str(front.from), to: str(front.to), repo: str(front.repo), branch: str(front.branch),
        taken_by: str(front.taken_by), taken_at: str(front.taken_at), done_at: str(front.done_at),
      }));
    } else {
      items.push(Object.assign(base, {
        for: str(front.for), filed_by: str(front.filed_by), claimed_by: str(front.claimed_by), branch: str(front.branch),
      }));
    }
  }
  return { count, items };
}

/** "2026-10-05 14:30 CDT" (a comms heading) -> ms, read as this computer's local time. */
function headingTime(h) {
  const m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/.exec(String(h || ''));
  if (!m) return null;
  const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
  return Number.isFinite(t) ? t : null;
}

/** The latest notes across every computer's comms file, newest first. */
function readComms(repoDir, limit) {
  const dirReal = realOf(repoDir);
  const all = [];
  for (const f of listNames(path.join(repoDir, 'comms'), '.md')) {
    const machine = f.replace(/\.md$/, '');
    const text = readTail(dirReal, path.join(repoDir, 'comms', f));
    if (!text) continue;
    const parts = text.replace(/<!--[\s\S]*?-->/g, '').split(/^##[ \t]+/m).slice(1);
    parts.forEach((p, i) => {
      const nl = p.indexOf('\n');
      const when = (nl < 0 ? p : p.slice(0, nl)).trim().slice(0, 60);
      const body = (nl < 0 ? '' : p.slice(nl + 1)).trim();
      if (!when) return;
      all.push({ machine, when, at: headingTime(when), order: i, text: body.slice(0, COMMS_TEXT_CHARS) + (body.length > COMMS_TEXT_CHARS ? '…' : '') });
    });
  }
  all.sort((a, b) => ((b.at || 0) - (a.at || 0)) || (b.order - a.order));
  return all.slice(0, limit).map((e) => ({ machine: e.machine, when: e.when, at: e.at, text: e.text }));
}

/** This clone's own last sync (.sync/last.json): when, and how it went. */
function lastSync(repoDir) {
  const dirReal = realOf(repoDir);
  const j = readJson(dirReal, path.join(repoDir, '.sync', 'last.json'));
  if (!j || typeof j !== 'object') return null;
  const at = Date.parse(j.at);
  return {
    at: Number.isFinite(at) ? at : null, local: str(j.local), result: str(j.result),
    note: j.note ? String(j.note).slice(0, 300) : null,
  };
}

/**
 * Everything the Fleet page shows, for the computer called `self`. { configured: false } when
 * repoDir is not a fleet clone.
 */
function fleetView(repoDir, self, opts) {
  const o = opts || {};
  if (!isFleet(repoDir)) return { configured: false };
  const now = o.now || Date.now();
  const dirReal = realOf(repoDir);
  const board = {};
  for (const s of BOARD) board[s] = readItems(repoDir, 'board', s, TITLES_PER_COLUMN);
  const handoffs = {
    open: readItems(repoDir, 'handoffs', 'open', 50).items,
    taken: readItems(repoDir, 'handoffs', 'taken', 50).items,
    done_count: listNames(path.join(repoDir, 'handoffs', 'done'), '.md').length,
  };
  const machines = registeredMachines(repoDir).map((m) => ({
    name: m.name, role: m.role, os: m.os, code_zone: m.code_zone, office_hub: m.office_hub,
    joined: m.joined, status: m.status, self: m.name === self,
    heartbeat: heartbeatOf(dirReal, repoDir, m.name, now),
    waiting: handoffs.open.filter((h) => h.to === m.name).length,
  }));
  const fleet = readJson(dirReal, path.join(repoDir, 'fleet.json')) || {};
  return {
    configured: true,
    asOf: now,
    self: self || null,
    created: str(fleet.created),
    machines,
    board,
    handoffs,
    comms: readComms(repoDir, COMMS_SHOWN),
    last_sync: lastSync(repoDir),
  };
}

module.exports = {
  MAX_BYTES, STALE_MS, BOARD, HANDOFFS,
  isFleet, parseFront, titleOf, registeredMachines, selfIn, readItems, readComms, lastSync, fleetView,
};
