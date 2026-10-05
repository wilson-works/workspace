'use strict';

/**
 * avatars.js — every live session gets its own emblem, framed by its model family.
 *
 * Emblem: hash(callsign) mod the emblem count, probing to the next emblem no other live session
 * holds, so no two live desks look alike. The choice is remembered in <office home>/avatars.json
 * (keyed machine:session) and kept for the session's life. When every emblem is held, the next
 * session shares its hashed emblem and is drawn with a second ring (variant 2, 3, ...).
 *
 * Fleet-wide: the hub sees every machine's sessions, so the hub's choice is the one that counts.
 * It returns each spoke's choices in the mesh ingest reply; the spoke's forwarder stores them in
 * <office home>/avatars-hub.json and the spoke's own wall follows them (`pinned` below).
 *
 * Frame: one per model family (config/avatars.json family_frames), so the model reads at a glance.
 */

const fs = require('fs');
const path = require('path');

const EMBLEMS = require('../ui/avatars/emblems.json');
const CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'avatars.json');
const SEEN_REFRESH_MS = 3600 * 1000;
const FORGET_MS = 24 * 3600 * 1000;
const HUB_FRESH_MS = 10 * 60 * 1000;

function loadConfig(p) {
  try {
    const o = JSON.parse(fs.readFileSync(p || CONFIG_PATH, 'utf8'));
    return { retired: Array.isArray(o.retired) ? o.retired : [], family_frames: o.family_frames || {} };
  } catch (_) {
    return { retired: [], family_frames: {} };
  }
}

/** The emblem ids that may be handed out, in a fixed order. */
function emblemIds(retired) {
  const out = new Set(retired || []);
  return Object.keys(EMBLEMS).sort().filter((id) => !out.has(id));
}

/** FNV-1a, 32 bit: small, stable across machines and Node versions. */
function hash(s) {
  let h = 0x811c9dc5;
  for (const ch of String(s)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const keyOf = (s) => `${s.machine}:${s.id}`;
const seedOf = (s) => (s.callsign && s.callsign.name) || s.id;

/**
 * Pure. sessions: [{id, machine, callsign?}] (live ones); book: {key: {emblem, variant, at, seen}}
 * (mutated); pinned: {key: {emblem, variant}} from the hub, or null. Returns {map, changed}.
 */
function assign(sessions, book, opts) {
  const { now, ids } = opts;
  const pinned = opts.pinned || null;
  const N = ids.length;
  const valid = new Set(ids);
  const taken = new Map();
  const map = new Map();
  let changed = false;
  if (!N) return { map, changed };

  const take = (key, emblem, variant) => {
    map.set(key, { emblem, variant });
    taken.set(emblem, (taken.get(emblem) || 0) + 1);
    const b = book[key];
    if (!b || b.emblem !== emblem || b.variant !== variant) {
      book[key] = { emblem, variant, at: b && b.emblem === emblem ? b.at : now, seen: now };
      changed = true;
    } else if (now - (b.seen || 0) > SEEN_REFRESH_MS) {
      b.seen = now;
      changed = true;
    }
  };

  const live = sessions.map((s) => ({ s, key: keyOf(s) }));
  // 1. The hub's word, on a spoke.
  for (const x of live) {
    const p = pinned && pinned[x.key];
    if (p && valid.has(p.emblem)) take(x.key, p.emblem, Number(p.variant) > 1 ? Number(p.variant) : 1);
  }
  // 2. What each session already had, oldest holder first: stable for the session's life.
  const kept = live.filter((x) => !map.has(x.key) && book[x.key] && valid.has(book[x.key].emblem))
    .sort((a, b) => (book[a.key].at - book[b.key].at) || (a.key < b.key ? -1 : 1));
  const fresh = live.filter((x) => !map.has(x.key) && !kept.includes(x));
  for (const x of kept) {
    const e = book[x.key].emblem;
    if (!taken.has(e)) take(x.key, e, 1);
    else if (taken.size >= N) take(x.key, e, taken.get(e) + 1);
    else fresh.push(x);
  }
  // 3. Newcomers: hash of the callsign, then the next free emblem.
  fresh.sort((a, b) => (a.key < b.key ? -1 : 1));
  for (const x of fresh) {
    const start = hash(seedOf(x.s)) % N;
    let got = null;
    for (let i = 0; i < N && !got; i += 1) {
      const e = ids[(start + i) % N];
      if (!taken.has(e)) got = e;
    }
    if (got) take(x.key, got, 1);
    else take(x.key, ids[start], taken.get(ids[start]) + 1);
  }

  for (const [key, b] of Object.entries(book)) {
    if (!map.has(key) && now - (b.seen || b.at || 0) > FORGET_MS) { delete book[key]; changed = true; }
  }
  return { map, changed };
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}

function writeJson(file, obj) {
  try {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj), 'utf8');
    fs.renameSync(tmp, file);
  } catch (_) { /* the wall still renders; the choice is re-made next frame */ }
}

/**
 * Give each view session `avatar: {emblem, variant, frame}`. Live = not ended. Writes the
 * book only when a choice changed.
 */
function apply(home, sessions, now, cfgPath) {
  const cfg = loadConfig(cfgPath);
  const ids = emblemIds(cfg.retired);
  const bookFile = path.join(home, 'avatars.json');
  const book = readJson(bookFile) || {};
  const hub = readJson(path.join(home, 'avatars-hub.json'));
  const pinned = hub && hub.avatars && now - (hub.at || 0) < HUB_FRESH_MS ? hub.avatars : null;
  const { map, changed } = assign(sessions, book, { now, ids, pinned });
  if (changed) writeJson(bookFile, book);
  for (const s of sessions) {
    const a = map.get(keyOf(s));
    const frame = cfg.family_frames[s.family] || cfg.family_frames.unknown || null;
    s.avatar = a ? { emblem: a.emblem, variant: a.variant, frame } : null;
  }
  return sessions;
}

/** Hub side: the choices it made for one spoke's sessions, for the ingest reply. */
function forMachine(home, machine, now) {
  const book = readJson(path.join(home, 'avatars.json')) || {};
  const out = {};
  for (const [key, b] of Object.entries(book)) {
    if (key.startsWith(`${machine}:`) && now - (b.seen || b.at || 0) < FORGET_MS) {
      out[key] = { emblem: b.emblem, variant: b.variant };
    }
  }
  return out;
}

/** Spoke side: keep the hub's choices (re-whitelisted: known emblem, small variant). */
function takeFromHub(home, avatars, now) {
  if (!avatars || typeof avatars !== 'object') return;
  const clean = {};
  for (const [key, a] of Object.entries(avatars)) {
    if (!a || !Object.prototype.hasOwnProperty.call(EMBLEMS, a.emblem) || !/^[A-Z]+:[0-9a-f-]{8,64}$/i.test(key)) continue;
    const v = Number(a.variant);
    clean[key] = { emblem: a.emblem, variant: v >= 1 && v <= 99 ? Math.floor(v) : 1 };
  }
  writeJson(path.join(home, 'avatars-hub.json'), { at: now, avatars: clean });
}

module.exports = { assign, apply, forMachine, takeFromHub, emblemIds, hash, loadConfig };
