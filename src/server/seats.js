'use strict';

/**
 * seats.js — taking a seat off the floor.
 *
 * A quiet session keeps its desk for as long as its window is open, and a headless agent can leave a new
 * one behind for every turn. Clearing a seat hides that session from the floor and the Work page. It
 * stops nothing and deletes nothing: the session itself is untouched, and the seat comes back by itself
 * the moment the session does anything new. Only an idle seat can be cleared; a working or waiting one
 * is still busy. A session with a question open for you always keeps its seat.
 *
 * State: <office home>/seats-cleared.json { "<machine>:<session id>": <cleared at, ms> }, pruned after a week.
 */

const fs = require('fs');
const path = require('path');

const FILE = 'seats-cleared.json';
const KEEP_MS = 7 * 24 * 3600 * 1000;
const KEY_RE = /^[A-Za-z0-9_-]{1,40}:[A-Za-z0-9_-]{1,80}$/;

const keyOf = (s) => `${s.machine}:${s.id}`;

function read(home) {
  try {
    const o = JSON.parse(fs.readFileSync(path.join(home, FILE), 'utf8'));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch (_) { return {}; }
}

/** Is this seat cleared? Only until the session's next event: anything new brings it back. */
function isCleared(cleared, s) {
  const at = cleared[keyOf(s)];
  return typeof at === 'number' && s.state === 'idle' && (s.last_at || 0) <= at;
}

/** The sessions still on the floor. `asking`: keys of sessions with a question open for you; they always stay. */
function visible(home, sessions, asking) {
  const cleared = read(home);
  if (!Object.keys(cleared).length) return sessions;
  return sessions.filter((s) => !(isCleared(cleared, s) && !(asking && asking.has(keyOf(s)))));
}

/**
 * Clear seats. `req.keys` names them ("<machine>:<id>"); `req.idle: true` means every idle seat in
 * `sessions`. Only idle seats are cleared. Returns { ok, cleared, busy }: busy counts the named seats
 * left alone because they were working or waiting.
 */
function clear(home, sessions, req, now) {
  const at = typeof now === 'number' ? now : Date.now();
  const byKey = new Map((sessions || []).map((s) => [keyOf(s), s]));
  let want;
  if (req && req.idle === true) want = [...byKey.values()].filter((s) => s.state === 'idle').map(keyOf);
  else if (req && Array.isArray(req.keys)) want = req.keys.filter((k) => typeof k === 'string' && KEY_RE.test(k)).slice(0, 200);
  else return { ok: false, error: 'Name the seats to clear, or ask for every idle one.' };
  const cleared = read(home);
  for (const [k, t] of Object.entries(cleared)) if (typeof t !== 'number' || at - t > KEEP_MS) delete cleared[k];
  let n = 0;
  let busy = 0;
  for (const k of want) {
    const s = byKey.get(k);
    if (!s) continue;
    if (s.state !== 'idle') { busy += 1; continue; }
    cleared[k] = at;
    n += 1;
  }
  fs.mkdirSync(home, { recursive: true });
  const tmp = path.join(home, `${FILE}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(cleared), 'utf8');
  fs.renameSync(tmp, path.join(home, FILE));
  return { ok: true, cleared: n, busy };
}

module.exports = { read, visible, clear, isCleared, FILE };
