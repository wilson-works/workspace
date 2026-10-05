#!/usr/bin/env node
/**
 * office-wake-hook.js — a note from the office wakes an idle session.
 *
 * Registered three times (bin/install.js hooks):
 *   Stop              async + asyncRewake. Waits for a note to THIS session.
 *                     When one lands it claims it, prints it to stderr and
 *                     exits 2; Claude Code then wakes the session and hands it
 *                     the stderr as a reminder. Otherwise it exits 0, quietly.
 *   UserPromptSubmit  writes the turn marker, so a waiter from an earlier turn
 *                     stands down: the inbox hook delivers mid-turn notes.
 *   SessionEnd        the same marker; the session is going away.
 *
 * Measured (Claude Code CLI 2.1.277 and the VS Code extension's 2.1.287): an
 * idle session woke 1.2 s / 3.0 s after the exit 2. A
 * new turn does NOT cancel an earlier waiter - without the marker and the
 * pid-lock one note would wake the session twice. A hard-killed claude.exe
 * leaves its waiter running, so the waiter watches CLAUDE_PID itself.
 *
 * The waiter exits 0, delivering nothing, when any of these holds:
 *   - the turn marker is newer than the waiter (a new turn began, or SessionEnd);
 *   - the pid-lock <home>/wake/<session>.pid names another waiter (a later Stop
 *     replaced this one);
 *   - the session's claude process is gone;
 *   - thresholds.json wake.wake_wait_max_ms has passed (default 8 h).
 *
 * A note is claimed with the same atomic rename office-inbox-hook.js uses, so
 * between them a note is delivered exactly once. Like the inbox hook it skips
 * subagents and prints nothing to stdout.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const POLL_MS = 2000;
const DEFAULT_MAX_MS = 8 * 3600 * 1000;
const SESSION_RE = /^[0-9a-f-]{8,64}$/i;

function home() {
  return require('../src/server/home').homeDir();
}

function maxWaitMs() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'thresholds.json'), 'utf8'));
    const v = cfg.wake && cfg.wake.wake_wait_max_ms;
    return typeof v === 'number' && v > 0 ? v : DEFAULT_MAX_MS;
  } catch (_) { return DEFAULT_MAX_MS; }
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}

function writeAtomic(p, obj) {
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj), 'utf8');
  fs.renameSync(tmp, p);
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return true; // unknown parent: rely on the other exits
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function clock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** UserPromptSubmit / SessionEnd: tell any waiter for this session to stand down. */
function mark(dir, sid, event) {
  fs.mkdirSync(dir, { recursive: true });
  writeAtomic(path.join(dir, `${sid}.turn`), { at: Date.now(), event });
}

function wait(dir, sid) {
  fs.mkdirSync(dir, { recursive: true });
  const inboxDir = path.join(home(), 'inbox');
  fs.mkdirSync(inboxDir, { recursive: true });
  const box = path.join(inboxDir, `${sid}.jsonl`);
  const lock = path.join(dir, `${sid}.pid`);
  const turn = path.join(dir, `${sid}.turn`);
  const startedAt = Date.now();
  const parent = parseInt(process.env.CLAUDE_PID || '', 10) || process.ppid;
  const deadline = startedAt + maxWaitMs();

  // One waiter per session: the newest Stop owns the lock, and an older waiter
  // sees the lock name someone else on its next check and leaves.
  writeAtomic(lock, { pid: process.pid, parent, started_at: startedAt });

  let watcher = null;
  let timer = null;
  const leave = (code) => {
    try { if (watcher) watcher.close(); } catch (_) {}
    if (timer) clearInterval(timer);
    const l = readJson(lock);
    if (l && l.pid === process.pid) { try { fs.unlinkSync(lock); } catch (_) {} }
    process.exit(code);
  };

  const standDown = () => {
    const l = readJson(lock);
    if (!l || l.pid !== process.pid) return 'replaced';
    const t = readJson(turn);
    if (t && typeof t.at === 'number' && t.at >= startedAt) return t.event || 'new turn';
    if (!alive(parent)) return 'session gone';
    if (Date.now() >= deadline) return 'cap';
    return null;
  };

  const check = () => {
    if (standDown()) leave(0);
    if (!fs.existsSync(box)) return;
    const claim = `${box}.claim-${process.pid}`;
    try { fs.renameSync(box, claim); } catch (_) { return; } // the inbox hook won, or nothing there

    let notes = [];
    try {
      notes = fs.readFileSync(claim, 'utf8').split(/\r?\n/).filter((l) => l.trim())
        .map((l) => { try { return JSON.parse(l); } catch (_) { return null; } })
        .filter(Boolean);
    } catch (_) { notes = []; }
    if (!notes.length) { try { fs.unlinkSync(claim); } catch (_) {} return; }

    // Record delivery before printing, so a crash after print cannot re-deliver.
    const now = Date.now();
    try {
      fs.mkdirSync(path.join(inboxDir, 'delivered'), { recursive: true });
      fs.appendFileSync(
        path.join(inboxDir, 'delivered', `${sid}.jsonl`),
        notes.map((n) => JSON.stringify({ id: n.id, queued_at: n.queued_at, delivered_at: now, via: 'Wake' })).join('\n') + '\n',
        'utf8'
      );
      fs.unlinkSync(claim);
    } catch (_) { /* best effort; the note is still delivered below */ }

    process.stderr.write(notes.map((n) => `Note from the office (${n.from || 'owner'}, ${clock(n.queued_at || now)}): ${n.text}`).join('\n') + '\n');
    leave(2);
  };

  try {
    watcher = fs.watch(inboxDir, (_ev, name) => { if (!name || String(name) === `${sid}.jsonl`) check(); });
  } catch (_) { watcher = null; } // the poll below is the backstop
  timer = setInterval(check, POLL_MS);
  check(); // a note that landed after the last tool call goes out now
}

function main() {
  let payload = {};
  try { payload = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (_) { process.exit(0); }
  const sid = String(payload.session_id || '');
  if (!SESSION_RE.test(sid)) process.exit(0);
  if (payload.agent_id) process.exit(0); // a note is for the session, not one of its helpers

  const dir = path.join(home(), 'wake');
  const event = process.argv[2] || payload.hook_event_name || 'Stop';
  if (event === 'UserPromptSubmit' || event === 'SessionEnd') {
    mark(dir, sid, event);
    process.exit(0);
  }
  wait(dir, sid);
}

try { main(); } catch (_) { process.exit(0); /* never fail the session */ }
