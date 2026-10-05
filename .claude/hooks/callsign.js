'use strict';

/**
 * callsign.js — one name per session that the owner can say out loud.
 *
 * Each machine has its own pool (config/callsigns.json: trees, stars or rivers,
 * chosen per machine in workspace.config.json), so the name says where the
 * session is and no cross-machine lock is needed. The book is <office home>/callsigns.json:
 *
 *   { <session_id>: { name, machine, seat, at, released_at, transcript } }
 *
 * A name is held from SessionStart until SessionEnd, or until its transcript
 * has not moved for stale_release_ms (a session that died without SessionEnd),
 * and is not handed to another session for hold_ms after that. A resumed
 * session keeps its name. When every pool name is held, the next round is
 * "Vega 2", "Rigel 2", ... so a busy day never repeats a live or recent name.
 *
 * Called from office-hook.js, which must never fail or block the session: every
 * entry point here swallows its own errors, and the lock wait is bounded.
 */

const fs = require('fs');
const path = require('path');

const DAY = 24 * 3600 * 1000;
const POOLS_PATH = path.join(__dirname, '..', '..', 'config', 'callsigns.json');
const LOCK_WAIT_MS = 150;
const LOCK_STALE_MS = 2000;
const PRUNE_AFTER_MS = 7 * DAY;

function loadConfig(p) {
  try {
    const o = JSON.parse(fs.readFileSync(p || POOLS_PATH, 'utf8'));
    return {
      pools: o.pools || {},
      hold_ms: Number(o.hold_ms) > 0 ? Number(o.hold_ms) : DAY,
      stale_release_ms: Number(o.stale_release_ms) > 0 ? Number(o.stale_release_ms) : DAY,
    };
  } catch (_) {
    return { pools: {}, hold_ms: DAY, stale_release_ms: DAY };
  }
}

function readBook(file) {
  try {
    const o = JSON.parse(fs.readFileSync(file, 'utf8'));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch (_) {
    return {};
  }
}

/** Last time a session showed life: its transcript's mtime, else when it got its name. */
function transcriptActivity(rec) {
  try {
    if (rec.transcript) return fs.statSync(rec.transcript).mtimeMs;
  } catch (_) { /* a deleted transcript falls back to the assignment time */ }
  return Date.parse(rec.at) || null;
}

/**
 * Pure: give `sid` a name in `book` (mutated and returned).
 * opts: { now, machine, pool, seat, transcript, hold_ms, stale_release_ms, lastActive(rec) }
 */
function allocate(book, sid, opts) {
  const now = opts.now;
  const hold = opts.hold_ms || DAY;
  const staleAfter = opts.stale_release_ms || DAY;
  const lastActive = opts.lastActive || transcriptActivity;

  // Release names whose session went quiet without a SessionEnd, and drop
  // records long past their hold so the book stays small.
  for (const [id, rec] of Object.entries(book)) {
    if (!rec || typeof rec !== 'object') { delete book[id]; continue; }
    if (id !== sid && !rec.released_at) {
      // Quiet since the later of its transcript and the moment it got its name.
      const last = Math.max(lastActive(rec) || 0, Date.parse(rec.at) || 0) || null;
      if (last != null && now - last >= staleAfter) rec.released_at = new Date(last + staleAfter).toISOString();
    }
    const rel = Date.parse(rec.released_at);
    if (id !== sid && rel && now - rel > PRUNE_AFTER_MS) delete book[id];
  }

  const held = new Set();
  for (const [id, rec] of Object.entries(book)) {
    if (id === sid) continue;
    const rel = Date.parse(rec.released_at);
    if (!rel || now - rel < hold) held.add(rec.name);
  }

  const mine = book[sid];
  if (mine && mine.name && !held.has(mine.name)) {
    mine.released_at = null;
    if (opts.transcript) mine.transcript = opts.transcript;
    if (opts.seat) mine.seat = opts.seat;
    return { book, name: mine.name, fresh: false };
  }

  const pool = opts.pool || [];
  if (!pool.length) return { book, name: null, fresh: false };
  let name = null;
  for (let round = 1; !name && round < 1000; round += 1) {
    for (const base of pool) {
      const n = round === 1 ? base : `${base} ${round}`;
      if (!held.has(n)) { name = n; break; }
    }
  }
  book[sid] = {
    name, machine: opts.machine, seat: opts.seat || null,
    at: new Date(now).toISOString(), released_at: null, transcript: opts.transcript || null,
  };
  return { book, name, fresh: true };
}

/** Pure: mark `sid`'s name released at `now`. */
function release(book, sid, now) {
  if (book[sid] && !book[sid].released_at) book[sid].released_at = new Date(now).toISOString();
  return book;
}

function sleep(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (_) { /* no wait */ }
}

/**
 * Read-modify-write the book under a bounded lock file. If the lock cannot be
 * had within LOCK_WAIT_MS the update runs anyway: a session must never wait on
 * another one's hook.
 */
function update(file, fn) {
  const lock = `${file}.lock`;
  let fd = null;
  const until = Date.now() + LOCK_WAIT_MS;
  while (fd === null) {
    try {
      fd = fs.openSync(lock, 'wx');
    } catch (e) {
      if (e.code !== 'EEXIST') break;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS) { fs.unlinkSync(lock); continue; }
      } catch (_) { continue; }
      if (Date.now() > until) break;
      sleep(10);
    }
  }
  try {
    const book = readBook(file);
    const out = fn(book);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(book, null, 1), 'utf8');
    fs.renameSync(tmp, file);
    return out;
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch (_) {}
      try { fs.unlinkSync(lock); } catch (_) {}
    }
  }
}

/**
 * The seat a session was launched into, from its environment only:
 * WORKSPACE_SEAT=cto-james (an org agent), or WORKSPACE_SEAT=gate.
 */
function seatFromEnv(env) {
  const seat = String(env.WORKSPACE_SEAT || '').trim();
  return seat ? seat.slice(0, 40) : null;
}

/** The line the session is told at SessionStart. */
function contextLine(name, machine) {
  return `Your office callsign is ${name} (${machine}). Sign comms posts and group-chat messages as ${name}. ` +
    `If the owner asks, the chat tab can be renamed with /rename ${renameOf(name, machine)}.`;
}

function renameOf(name, machine) {
  return `${String(name).replace(/\s+/g, '')}-${machine}`;
}

/** SessionStart: assign (or keep) this session's name. Returns the name or null. */
function onSessionStart(home, payload, machine, env, cfgPath) {
  try {
    const sid = payload && payload.session_id;
    if (!sid) return null;
    const cfg = loadConfig(cfgPath);
    const pool = cfg.pools[require('../../src/server/config').poolOf(machine)];
    if (!Array.isArray(pool) || !pool.length) return null;
    fs.mkdirSync(home, { recursive: true });
    return update(path.join(home, 'callsigns.json'), (book) => allocate(book, sid, {
      now: Date.now(), machine, pool, seat: seatFromEnv(env || {}),
      transcript: typeof payload.transcript_path === 'string' ? payload.transcript_path : null,
      hold_ms: cfg.hold_ms, stale_release_ms: cfg.stale_release_ms,
    }).name);
  } catch (_) {
    return null;
  }
}

/** SessionEnd: release this session's name. */
function onSessionEnd(home, payload) {
  try {
    const sid = payload && payload.session_id;
    const file = path.join(home, 'callsigns.json');
    if (!sid || !fs.existsSync(file)) return;
    update(file, (book) => release(book, sid, Date.now()));
  } catch (_) { /* never fails the session */ }
}

module.exports = {
  allocate, release, readBook, loadConfig, seatFromEnv, contextLine, renameOf,
  onSessionStart, onSessionEnd, DAY,
};
