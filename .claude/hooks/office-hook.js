#!/usr/bin/env node
/**
 * office-hook.js — the WorkSpace office's event writer.
 *
 * Contract:
 *   stdin: one Claude Code hook payload as JSON.
 *   stdout: nothing, except on SessionStart: the session's callsign as
 *     hookSpecificOutput.additionalContext (callsign.js). stderr: nothing.
 *     exit: always 0.
 *   side effect: exactly one line appended to <office home>/events.jsonl;
 *     on SessionStart/SessionEnd, the callsign book is updated.
 *
 * This program runs inside every session it watches. It therefore obeys four
 * rules that outrank completeness:
 *
 *   1. IT NEVER FAILS THE SESSION. Every path is wrapped; the process exits 0
 *      whatever happens. A hook that throws damages the run it is monitoring.
 *   2. IT NEVER BLOCKS. No network, no locks, no retries, no stdout. One
 *      appendFileSync and done.
 *   3. IT NEVER COPIES CONTENT. Hook payloads carry `tool_input` (which holds
 *      whole file bodies on Write), `prompt`, and `last_assistant_message`.
 *      Those can contain private text. Nothing outside ALLOW below is
 *      ever read, and every string is clamped. There is no passthrough branch.
 *   4. IT KEEPS LINES SHORT. A line is clamped to MAX_LINE bytes so that the
 *      single O_APPEND write stays small enough to interleave safely when
 *      several sessions append to one file at once. A line that would exceed
 *      the clamp is emitted truncated with `trunc:true`, never split.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MAX_STR = 300;      // per string field
const MAX_LINE = 3500;    // per line, bytes — under the 4K append boundary

/** Fields copied from a payload, by name. Nothing else is ever read. */
const ALLOW = [
  'hook_event_name',
  'session_id',
  'prompt_id',
  'cwd',
  'permission_mode',
  'model',
  'session_start_reason',
  'session_end_reason',
  'stop_reason',
  'stop_hook_active',
  'tool_name',
  'tool_use_id',
  'agent_id',
  'agent_type',
  // NOT `agent_description`: it is free text written by the parent model and
  // routinely names a client. Banned from capture, not merely from display.
  'parent_session_id',
  'notification_type',
  'error_type',
  'source',
  'transcript_path',
  'agent_transcript_path',
];

function clampStr(v) {
  if (typeof v === 'boolean' || typeof v === 'number') return v;
  if (typeof v !== 'string') return undefined;
  return v.length > MAX_STR ? v.slice(0, MAX_STR) + '…' : v;
}

function home() {
  return require('../../src/server/home').homeDir();
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

function main() {
  const receivedAt = new Date().toISOString();
  const dir = home();
  const out = path.join(dir, 'events.jsonl');

  let rec;
  let payload = null;
  try {
    const raw = readStdin();
    try {
      payload = JSON.parse(raw);
    } catch (_) {
      payload = null;
    }

    if (payload && typeof payload === 'object') {
      rec = { received_at: receivedAt, pid: process.pid };
      for (const k of ALLOW) {
        const v = clampStr(payload[k]);
        if (v !== undefined && v !== null) rec[k] = v;
      }
      // `notification_type` is not always populated; the message is NOT copied,
      // but whether a notification is a permission prompt is the fact the
      // stall/permission alarms need. Derive it from the type alone.
      if (!rec.hook_event_name) rec.hook_event_name = 'UNKNOWN';
      // Argv fallback: the settings entry may name the event explicitly so the
      // office can still classify a payload whose shape changes under it.
      if (process.argv[2]) rec.declared_event = clampStr(process.argv[2]);
    } else {
      rec = {
        received_at: receivedAt,
        pid: process.pid,
        hook_event_name: process.argv[2] || 'UNPARSEABLE',
        parse_error: true,
      };
    }
  } catch (err) {
    rec = { received_at: receivedAt, hook_event_name: 'HOOK_ERROR' };
  }

  let line;
  try {
    line = JSON.stringify(rec);
    if (Buffer.byteLength(line, 'utf8') > MAX_LINE) {
      const slim = {
        received_at: rec.received_at,
        pid: rec.pid,
        hook_event_name: rec.hook_event_name,
        session_id: rec.session_id,
        agent_id: rec.agent_id,
        trunc: true,
      };
      line = JSON.stringify(slim);
    }
  } catch (_) {
    line = JSON.stringify({ received_at: receivedAt, hook_event_name: 'SERIALIZE_ERROR' });
  }

  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) { /* the append below will fail; that is the whole handling */ }

  try {
    fs.appendFileSync(out, line + '\n', { encoding: 'utf8' });
  } catch (_) { /* swallowed on purpose: rule 1 */ }

  // The session's callsign (callsign.js). Bounded and self-contained: it
  // swallows its own errors, so rule 1 holds.
  try {
    const ev = rec && rec.hook_event_name;
    if (payload && ev === 'SessionStart') {
      const C = require('./callsign');
      const machine = require('../../src/server/geography').thisMachine();
      const name = C.onSessionStart(dir, payload, machine, process.env);
      const lines = [];
      if (name) lines.push(C.contextLine(name, machine));
      const group = groupContext(dir, Date.now());
      if (group) lines.push(group);
      if (lines.length) {
        // writeSync: the process.exit(0) below must not cut an async pipe write.
        fs.writeSync(1, JSON.stringify({
          hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.join('\n\n') },
        }));
      }
    } else if (payload && ev === 'SessionEnd') {
      require('./callsign').onSessionEnd(dir, payload);
    }
  } catch (_) { /* rule 1 */ }
}

/**
 * The group chat's last 10 messages of the past 2 h, for a session that starts now. The hub reads
 * its own thread (the tail only); another machine reads the copy its forwarder keeps.
 */
function groupContext(dir, now) {
  try {
    let msgs = [];
    const recent = path.join(dir, 'channel', 'recent.json');
    const thread = path.join(dir, 'channel', 'channel.jsonl');
    if (fs.existsSync(thread)) {
      const st = fs.statSync(thread);
      const fd = fs.openSync(thread, 'r');
      const len = Math.min(st.size, 65536);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, st.size - len);
      fs.closeSync(fd);
      msgs = buf.toString('utf8').split(/\r?\n/).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
    } else if (fs.existsSync(recent)) {
      msgs = JSON.parse(fs.readFileSync(recent, 'utf8')).messages || [];
    }
    if (!msgs.length) return null;
    const ch = require('../../src/server/channel');
    const lines = ch.recentLines(msgs, now);
    if (!lines.length) return null;
    return [`The office group chat, last ${lines.length} message(s) of the past 2 hours:`, ...lines,
      `${ch.GUIDANCE} To post: ${ch.SAY}.`].join('\n');
  } catch (_) {
    return null;
  }
}

try { main(); } catch (_) { /* rule 1 */ }
process.exit(0);
