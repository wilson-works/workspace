'use strict';

/**
 * nudge.js — the waiter's status, and the opt-in idle nudge.
 *
 * bin/office-wake-hook.js keeps one waiter per idle session and names it in
 * <home>/wake/<session>.pid. A live pid there means a note wakes the session
 * now, so the composer can say so instead of "the next time it uses a tool".
 *
 * The nudge: a run seat that
 * went quiet with nothing armed gets ONE standard note per idle window, so the
 * run does not stall silently. All of these must hold:
 *   - Keep awake is on for the desk (default on for run seats, off for plain
 *     chats; the owner flips it per desk in the panel);
 *   - its waiter is live (a nudge to a session that cannot wake is noise);
 *   - idle past alarms.lane_idle_wall_ms, with no wakeup or background job
 *     (the desk is not WAITING) and no helper running;
 *   - not waiting on the owner (an open question from it) or on a permission
 *     prompt;
 *   - fewer than wake.nudge_max_per_hour nudges to it in the last hour.
 * The wording is config (thresholds.json wake.nudge_text). The note goes
 * through the inbox like any other, from "office".
 */

const fs = require('fs');
const path = require('path');
const inbox = require('./inbox');

const SESSION_RE = /^[0-9a-f-]{8,64}$/i;
const HOUR_MS = 3600 * 1000;

function wakeDir(home) { return path.join(home, 'wake'); }
function keepAwakeFile(home) { return path.join(wakeDir(home), 'keep-awake.json'); }
function nudgeLog(home, sid) { return path.join(wakeDir(home), 'nudges', `${sid}.jsonl`); }

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}

function readJsonl(p) {
  try {
    return fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim())
      .map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
  } catch (_) { return []; }
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** Is a waiter running for this session right now? */
function waiterLive(home, sid) {
  const l = readJson(path.join(wakeDir(home), `${sid}.pid`));
  return !!(l && pidAlive(l.pid));
}

function keepAwake(home, sid, isRunSeat) {
  const m = readJson(keepAwakeFile(home)) || {};
  return typeof m[sid] === 'boolean' ? m[sid] : !!isRunSeat;
}

function setKeepAwake(home, sid, on) {
  if (!SESSION_RE.test(String(sid || ''))) return { ok: false, error: 'not a session id' };
  const m = readJson(keepAwakeFile(home)) || {};
  m[sid] = !!on;
  fs.mkdirSync(wakeDir(home), { recursive: true });
  const tmp = `${keepAwakeFile(home)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(m, null, 2), 'utf8');
  fs.renameSync(tmp, keepAwakeFile(home));
  return { ok: true, session_id: sid, keep_awake: !!on };
}

/** What a desk shows: waiter live, Keep awake, and when the last nudge went. */
function status(home, sid, isRunSeat) {
  const log = readJsonl(nudgeLog(home, sid));
  return {
    live: waiterLive(home, sid),
    keep_awake: keepAwake(home, sid, isRunSeat),
    nudged_at: log.length ? log[log.length - 1].at : null,
  };
}

/**
 * Send the nudges that are due. `sessions` are view.js sessions; only this
 * machine's are considered (another machine's office nudges its own).
 * ctx: { now, cfg, machine, askingOwner: Set<id>, onPermission: Set<id>, live?: (home, id) => bool }
 * Returns the ids nudged.
 */
function check(home, sessions, ctx) {
  const { now, cfg, machine } = ctx;
  const wake = (cfg && cfg.wake) || {};
  const text = String(wake.nudge_text || '').trim();
  const max = Number.isInteger(wake.nudge_max_per_hour) ? wake.nudge_max_per_hour : 3;
  const idleMs = cfg.alarms.lane_idle_wall_ms;
  const live = ctx.live || waiterLive;
  const sent = [];
  if (!text) return sent;

  for (const s of sessions || []) {
    if (s.machine !== machine || !s.deliverable) continue;
    if (!keepAwake(home, s.id, !!s.run)) continue;
    if (s.state !== 'idle' || s.waiting || (s.helpers || []).length) continue;
    if (!s.last_at || now - s.last_at <= idleMs) continue;
    if ((ctx.askingOwner && ctx.askingOwner.has(s.id)) || (ctx.onPermission && ctx.onPermission.has(s.id))) continue;
    if (!live(home, s.id)) continue;

    const log = readJsonl(nudgeLog(home, s.id));
    if (log.some((n) => n.window === s.last_at)) continue;           // one per idle window
    if (log.filter((n) => now - n.at < HOUR_MS).length >= max) continue;

    const r = inbox.enqueue(home, s.id, text, 'office');
    if (!r.ok) continue;
    fs.mkdirSync(path.dirname(nudgeLog(home, s.id)), { recursive: true });
    fs.appendFileSync(nudgeLog(home, s.id), JSON.stringify({ at: now, window: s.last_at, note: r.id }) + '\n', 'utf8');
    sent.push(s.id);
  }
  return sent;
}

module.exports = { check, status, setKeepAwake, waiterLive, keepAwake };
