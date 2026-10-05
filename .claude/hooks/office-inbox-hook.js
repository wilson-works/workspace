#!/usr/bin/env node
/**
 * office-inbox-hook.js — hands the owner's notes to a running session.
 *
 * Runs on PostToolUse and UserPromptSubmit. If the office has queued a
 * note for THIS session (keyed on session_id), the note is returned as
 * `additionalContext`, which Claude Code adds to the model's context, and the
 * note is moved to the delivered log. Otherwise it prints nothing and exits.
 *
 * Rules, same as the event writer:
 *   - It never fails the session: every path is wrapped, it always exits 0.
 *   - It prints NOTHING unless there is a note to deliver. A stray line on a
 *     UserPromptSubmit hook's stdout would be injected into the model's context.
 *   - Two tool calls in parallel must not deliver one note twice. The inbox file
 *     is CLAIMED by an atomic rename before it is read; only one process can win
 *     the rename, the other finds nothing and exits quietly.
 */

'use strict';

const fs = require('fs');
const path = require('path');

function home() {
  return require('../../src/server/home').homeDir();
}

/** Whose office this is (workspace.config.json owner.name), else "the owner". */
function ownerName() {
  try { return require('../../src/server/config').ownerName() || 'the owner'; } catch (_) { return 'the owner'; }
}

function clock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function main() {
  let payload = {};
  try { payload = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (_) { return; }

  const sid = String(payload.session_id || '');
  if (!/^[0-9a-f-]{8,64}$/i.test(sid)) return;
  // A note is for the session, not for one of its helpers. Deliver on the
  // parent's own tool calls only, so a subagent never swallows it.
  if (payload.agent_id) return;

  const event = payload.hook_event_name === 'UserPromptSubmit' ? 'UserPromptSubmit' : 'PostToolUse';
  const dir = path.join(home(), 'inbox');
  const box = path.join(dir, `${sid}.jsonl`);
  if (!fs.existsSync(box)) return;

  const claim = `${box}.claim-${process.pid}`;
  try { fs.renameSync(box, claim); } catch (_) { return; } // someone else won, or nothing there

  let notes = [];
  try {
    notes = fs.readFileSync(claim, 'utf8').split(/\r?\n/).filter((l) => l.trim())
      .map((l) => { try { return JSON.parse(l); } catch (_) { return null; } })
      .filter(Boolean);
  } catch (_) { notes = []; }

  if (!notes.length) { try { fs.unlinkSync(claim); } catch (_) {} return; }

  const now = Date.now();
  // Group-chat messages (channel.js) carry their own sender and guidance in the text.
  const group = notes.every((n) => n.from === 'group');
  const text = [
    group
      ? `From the office group chat${notes.length > 1 ? ` (${notes.length} messages)` : ''}:`
      : `A note from ${ownerName()}, sent through the office${notes.length > 1 ? ` (${notes.length} notes)` : ''}:`,
    ...notes.map((n) => `- [${clock(n.queued_at || now)}] ${n.text}`),
    group ? 'Carry on with your work unless one of these is for you.' : 'Read it, act on it if it asks you to, and carry on.',
  ].join('\n');

  // Record delivery before printing, so a crash after print cannot re-deliver.
  try {
    fs.mkdirSync(path.join(dir, 'delivered'), { recursive: true });
    fs.appendFileSync(
      path.join(dir, 'delivered', `${sid}.jsonl`),
      notes.map((n) => JSON.stringify({ id: n.id, queued_at: n.queued_at, delivered_at: now, via: event })).join('\n') + '\n',
      'utf8'
    );
    fs.unlinkSync(claim);
  } catch (_) { /* best effort; the note is still delivered below */ }

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: event, additionalContext: text },
  }));
}

try { main(); } catch (_) { /* never fail the session */ }
process.exit(0);
