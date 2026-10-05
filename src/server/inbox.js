'use strict';

/**
 * inbox.js — notes from the owner to a running session.
 *
 * Why this exists instead of posting to a comms bus: nothing guarantees a
 * session is reading a bus, so a "send a message" button wired to one could
 * look like it worked and reach nobody. The inbox is handed over by a hook.
 *
 * How a note travels:
 *   1. The office writes it to  <home>/inbox/<session_id>.jsonl  (one line).
 *   2. `.claude/hooks/office-inbox-hook.js` runs on PostToolUse inside that
 *      session. If the session has pending notes, it hands them to the model as
 *      `additionalContext` and moves them to  <home>/inbox/delivered/.
 *   3. The office reads both files to show "waiting" vs "delivered at HH:MM".
 *
 * A note is therefore delivered the next time the session USES A TOOL - not
 * instantly, and never to a session that does not have the hook registered.
 * The inspector says both of those things in words. A session that also runs
 * `bin/office-wake-hook.js` on Stop is woken by the note when its turn has
 * ended (guides/01-install.md, "Waking an idle session"); the composer says so instead.
 */

const fs = require('fs');
const path = require('path');

const MAX_CHARS = 1500;
const SESSION_RE = /^[0-9a-f-]{8,64}$/i;

function inboxDir(home) { return path.join(home, 'inbox'); }
function deliveredDir(home) { return path.join(home, 'inbox', 'delivered'); }

/** Queue one note. Returns {ok, id, queued_at} or {ok:false, error}. */
function enqueue(home, sessionId, text, from) {
  if (!SESSION_RE.test(String(sessionId || ''))) return { ok: false, error: 'not a session id' };
  const body = String(text || '').trim();
  if (!body) return { ok: false, error: 'empty note' };
  if (body.length > MAX_CHARS) return { ok: false, error: `note is longer than ${MAX_CHARS} characters` };

  fs.mkdirSync(inboxDir(home), { recursive: true });
  const rec = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    queued_at: Date.now(),
    from: from || 'owner',
    text: body,
  };
  fs.appendFileSync(path.join(inboxDir(home), `${sessionId}.jsonl`), JSON.stringify(rec) + '\n', 'utf8');
  recordSent(home, sessionId, rec);
  return { ok: true, id: rec.id, queued_at: rec.queued_at };
}

function sentDir(home) { return path.join(home, 'inbox', 'sent'); }

/**
 * The owner's own copy of a note, so the office can show the conversation -
 * for local notes and for notes routed to another machine alike. The hook
 * never reads this folder; it only empties the inbox.
 */
function recordSent(home, sessionId, rec) {
  if (!SESSION_RE.test(String(sessionId || ''))) return;
  try {
    fs.mkdirSync(sentDir(home), { recursive: true });
    fs.appendFileSync(path.join(sentDir(home), `${sessionId}.jsonl`),
      JSON.stringify({ id: rec.id, queued_at: rec.queued_at, from: rec.from || 'owner', text: rec.text }) + '\n', 'utf8');
  } catch (_) { /* the note is queued; only the owner's copy is missing */ }
}

function readJsonl(p) {
  try {
    return fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim())
      .map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
  } catch (_) { return []; }
}

/** The last few notes sent to a session, each with when it was handed over (or null). */
function thread(home, sessionId, limit = 6) {
  if (!SESSION_RE.test(String(sessionId || ''))) return [];
  const sent = readJsonl(path.join(sentDir(home), `${sessionId}.jsonl`)).slice(-limit);
  if (!sent.length) return [];
  const delivered = new Map(readJsonl(path.join(deliveredDir(home), `${sessionId}.jsonl`)).map((d) => [d.id, d.delivered_at]));
  return sent.map((n) => ({ id: n.id, from: n.from || 'owner', text: n.text, at: n.queued_at, delivered_at: delivered.get(n.id) || null }));
}

function countLines(p) {
  try {
    return fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim()).length;
  } catch (_) { return 0; }
}

function lastDelivered(p) {
  try {
    const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return null;
    const o = JSON.parse(lines[lines.length - 1]);
    return o.delivered_at || null;
  } catch (_) { return null; }
}

/** What the office shows on a desk: how many notes are waiting, when the last one landed. */
function status(home, sessionId) {
  return {
    pending: countLines(path.join(inboxDir(home), `${sessionId}.jsonl`)),
    delivered_at: lastDelivered(path.join(deliveredDir(home), `${sessionId}.jsonl`)),
  };
}

module.exports = { enqueue, status, thread, recordSent, inboxDir, deliveredDir, MAX_CHARS };
