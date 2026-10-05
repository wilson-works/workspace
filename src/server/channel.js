'use strict';

/**
 * channel.js — one group chat for the owner and every running session.
 *
 * The hub keeps the thread: <office home>/channel/channel.jsonl, one message per line,
 *   {id, at, from: {kind: owner|session, callsign, machine, session_id}, scope: all|run:<n>|machine:<n>|auto,
 *    to: callsign|null, text}
 * and who it went to: <office home>/channel/fanout.jsonl, {id, at, recipients: [{machine, session_id,
 * callsign, note_id, queued_at}]}.
 *
 * A message reaches sessions as an ordinary office note (inbox.enqueue here, mesh.queueNote for
 * another machine), so the delivery hooks, the wake waiter and the delivered receipts all work
 * unchanged. Fan-out goes to every live, deliverable session in scope that is not stale, never to
 * the sender.
 *
 * Sessions post through bin/office-say.js, which checks the guard rails on the session's own
 * machine (it knows that session's history) and writes <office home>/channel/outbox.jsonl. The hub
 * drains its own outbox; a spoke's forwarder carries it in the feed. The hub re-checks length and
 * privacy and never trusts the spoke's word for either.
 */

const fs = require('fs');
const path = require('path');
const inbox = require('./inbox');
const mesh = require('./mesh');
const { technicalReason } = require('./questions');

const MAX_CHARS = 500;
const PER_HOUR = 6;
const MIN_GAP_MS = 60 * 1000;
const LOOP_MS = 60 * 1000;
const RECENT_N = 10;
const RECENT_MS = 2 * 3600 * 1000;
const GUIDANCE = 'Group messages are for coordination. Reply only if you are addressed, asked, or affected. Never reply just to acknowledge.';
const CALLSIGN_RE = /^[A-Za-z][A-Za-z0-9 -]{0,39}$/;
const SCOPE_RE = /^(all|auto|run:[\w.-]{1,40}|machine:[A-Z0-9][A-Z0-9-]{0,23})$/;
// How a session posts, with this WorkSpace's real path, so the line can be run as written.
const SAY = `node "${path.join(__dirname, '..', '..', 'bin', 'office-say.js')}" "text" [--to <callsign>]`;
// A path, by shape: a drive letter, a UNC or home path, or a slash-separated name with an extension.
const PATH_RE = /[A-Za-z]:[\\/]|\\\\[\w.-]+\\|~[\\/]|(?:^|\s)\.{0,2}\/?[\w.-]+[\\/][\w.\\/-]*\.\w{1,6}\b/;
// A file name on its own (`smith-1040.pdf`): the wall never shows one, because the name can be a client's.
const FILE_RE = /[\w-]{2,}\.[A-Za-z][A-Za-z0-9]{1,4}\b/;

const dir = (home) => path.join(home, 'channel');
const file = (home, name) => path.join(dir(home), name);

function readLines(p) {
  try {
    return fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim())
      .map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
  } catch (_) { return []; }
}

function append(home, name, rec) {
  fs.mkdirSync(dir(home), { recursive: true });
  fs.appendFileSync(file(home, name), JSON.stringify(rec) + '\n', 'utf8');
}

const newId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const clean = (s) => String(s || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/[ \t]+/g, ' ').trim();

/**
 * The content rules, shared by office-say (before it queues) and the hub (before it stores).
 * Returns null when the text may be posted, else the refusal line.
 */
function contentRefusal(text, clientWork) {
  const t = clean(text);
  if (!t) return 'Nothing to post.';
  if (t.length > MAX_CHARS) return `Keep it under ${MAX_CHARS} characters (this is ${t.length}).`;
  if (clientWork) {
    if (PATH_RE.test(t) || FILE_RE.test(t)) return 'This session is private work: its group posts may not name a file or folder. Say it in plain words.';
    const why = technicalReason(t);
    if (why) return `This session is private work: its group posts must be plain English (it contains ${why}).`;
  }
  return null;
}

/**
 * The rate rules for one session (never the owner). said: [at] of its own posts; received:
 * [{at, addressed}] of group messages handed to it. Returns null or {line, retry_at}.
 */
function rateRefusal(said, received, now) {
  const hour = said.filter((t) => now - t < 3600 * 1000).sort((a, b) => a - b);
  if (hour.length && now - hour[hour.length - 1] < MIN_GAP_MS) {
    const at = hour[hour.length - 1] + MIN_GAP_MS;
    return { line: `One group post a minute. You can post again at ${clock(at)}.`, retry_at: at };
  }
  if (hour.length >= PER_HOUR) {
    const at = hour[hour.length - PER_HOUR] + 3600 * 1000;
    return { line: `${PER_HOUR} group posts an hour is the cap. You can post again at ${clock(at)}.`, retry_at: at };
  }
  const last = received.filter((r) => !r.addressed && now - r.at < LOOP_MS).sort((a, b) => b.at - a.at)[0];
  if (last) {
    const at = last.at + LOOP_MS;
    return {
      line: `Loop breaker: you got a group message ${Math.round((now - last.at) / 1000)} s ago that was not addressed to you. ` +
        `You can post again at ${clock(at)}. ${GUIDANCE}`,
      retry_at: at,
    };
  }
  return null;
}

function clock(t) {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

/** Store one message on the hub. from.kind 'owner' skips nothing but the rate rules (done upstream). */
function store(home, msg, clientWork, now) {
  const text = clean(msg.text);
  const refusal = contentRefusal(text, clientWork);
  if (refusal) return { ok: false, error: refusal };
  const scope = SCOPE_RE.test(String(msg.scope || 'all')) ? String(msg.scope || 'all') : 'all';
  const from = msg.from && msg.from.kind === 'session'
    ? {
        kind: 'session',
        callsign: CALLSIGN_RE.test(String(msg.from.callsign || '')) ? String(msg.from.callsign) : null,
        machine: mesh.MACHINES.includes(msg.from.machine) ? msg.from.machine : null,
        session_id: /^[0-9a-f-]{8,64}$/i.test(String(msg.from.session_id || '')) ? String(msg.from.session_id) : null,
      }
    : { kind: 'owner', callsign: null, machine: null, session_id: null };
  const rec = {
    id: msg.id && /^g[0-9a-z]{6,20}$/.test(msg.id) ? msg.id : newId(),
    at: now, from, scope,
    to: msg.to && CALLSIGN_RE.test(String(msg.to)) ? String(msg.to) : null,
    text,
  };
  if (readLines(file(home, 'channel.jsonl')).some((m) => m.id === rec.id)) return { ok: true, id: rec.id, duplicate: true };
  append(home, 'channel.jsonl', rec);
  return { ok: true, id: rec.id, message: rec };
}

/** The note a session receives. Self-describing, so both delivery hooks say it right. */
function noteText(m) {
  const who = m.from.kind === 'owner' ? 'the owner' : `${m.from.callsign || 'a session'}${m.from.machine ? ` (${m.from.machine})` : ''}`;
  const to = m.to ? ` → ${m.to}` : '';
  return `[Group${to}] ${who}: ${m.text}\n(${GUIDANCE} To post: ${SAY}.)`;
}

/** 'auto' (office-say's default) is the sender's own run, or everyone. */
function resolveScope(m, sender) {
  return m.scope === 'auto' ? (sender && sender.run ? `run:${sender.run}` : 'all') : m.scope;
}

function inScope(m, s, sender) {
  const scope = resolveScope(m, sender);
  if (scope === 'all') return true;
  if (scope.startsWith('run:')) return s.run === scope.slice(4);
  if (scope.startsWith('machine:')) return s.machine === scope.slice(8);
  return false;
}

/**
 * Fan out every stored message that has not gone out yet. sessions: the frame's view sessions;
 * staleIds: desks the reader calls stale. Returns how many messages went out.
 */
function fanOut(home, sessions, staleIds, self, now) {
  const done = new Set(readLines(file(home, 'fanout.jsonl')).map((f) => f.id));
  const pending = readLines(file(home, 'channel.jsonl')).filter((m) => !done.has(m.id));
  for (const m of pending) {
    const sender = m.from.session_id ? sessions.find((s) => s.id === m.from.session_id) : null;
    const recipients = [];
    for (const s of sessions) {
      if (!s.deliverable || staleIds.has(`${s.machine}:${s.id}`)) continue;
      if (m.from.session_id && s.id === m.from.session_id) continue;
      if (!inScope(m, s, sender)) continue;
      const text = noteText(m);
      const r = s.machine === self ? inbox.enqueue(home, s.id, text, 'group') : mesh.queueNote(home, s.machine, s.id, text, 'group');
      if (s.machine !== self && r.ok) inbox.recordSent(home, s.id, { id: r.id, queued_at: r.queued_at, from: 'group', text });
      if (r.ok) recipients.push({ machine: s.machine, session_id: s.id, callsign: s.callsign ? s.callsign.name : null, note_id: r.id, queued_at: r.queued_at });
    }
    append(home, 'fanout.jsonl', { id: m.id, at: now, scope: resolveScope(m, sender), recipients });
  }
  return pending.length;
}

/** Drain THIS machine's session posts (bin/office-say.js) into the hub's thread. */
function drainLocal(home, clientOf, now) {
  const out = file(home, 'outbox.jsonl');
  const posts = readLines(out);
  if (!posts.length) return 0;
  try { fs.unlinkSync(out); } catch (_) { return 0; }
  for (const p of posts) store(home, p, clientOf(p), now);
  return posts.length;
}

/** Hub side: posts a spoke's forwarder carried. */
function acceptRemote(home, machine, posts, clientOf, now) {
  if (!Array.isArray(posts)) return [];
  const ok = [];
  for (const p of posts.slice(0, 20)) {
    if (!p || !p.from || p.from.machine !== machine) continue;
    const r = store(home, p, clientOf(p), now);
    if (r.ok) ok.push(p.id);
  }
  return ok;
}

/** Delivery of one recipient's note: local receipts, or the spoke's last delivery time. */
function deliveredAt(home, r, sessions, self) {
  if (r.machine === self) {
    const d = readLines(path.join(home, 'inbox', 'delivered', `${r.session_id}.jsonl`)).find((x) => x.id === r.note_id);
    return d ? d.delivered_at : null;
  }
  // Another machine's session: its notes carry the delivery time its feed reports (view.notesOf).
  const s = sessions.find((x) => x.machine === r.machine && x.id === r.session_id);
  const n = s && (s.notes || []).find((x) => x.id === r.note_id);
  return n ? n.delivered_at || null : null;
}

/** The thread for the frame: the newest `limit` messages with sender and delivery receipts. */
function view(home, sessions, self, limit) {
  const msgs = readLines(file(home, 'channel.jsonl')).slice(-(limit || 60));
  const fan = new Map(readLines(file(home, 'fanout.jsonl')).map((f) => [f.id, f]));
  return msgs.map((m) => {
    const f = fan.get(m.id);
    const sender = m.from.session_id ? sessions.find((s) => s.id === m.from.session_id && s.machine === m.from.machine) : null;
    const recipients = f ? f.recipients.map((r) => ({
      machine: r.machine, session_id: r.session_id, callsign: r.callsign,
      delivered_at: deliveredAt(home, r, sessions, self),
    })) : null;
    return {
      id: m.id, at: m.at, scope: (f && f.scope) || m.scope, to: m.to, text: m.text,
      from: Object.assign({}, m.from, {
        avatar: sender ? sender.avatar : null, family: sender ? sender.family : null,
        key: sender ? `${sender.machine}:${sender.id}` : null,
      }),
      sent: !!f,
      recipients,
    };
  });
}

/** The last RECENT_N messages of the past RECENT_MS, as lines for a new session's context. */
function recentLines(messages, now) {
  return messages.filter((m) => now - m.at < RECENT_MS).slice(-RECENT_N).map((m) => {
    const who = m.from.kind === 'owner' ? 'owner' : `${m.from.callsign || 'session'} (${m.from.machine || '?'})`;
    return `- [${clock(m.at)}] ${who}${m.to ? ` → ${m.to}` : ''}: ${m.text}`;
  });
}

module.exports = {
  MAX_CHARS, PER_HOUR, MIN_GAP_MS, LOOP_MS, GUIDANCE, RECENT_MS, SAY,
  contentRefusal, rateRefusal, store, fanOut, drainLocal, acceptRemote, view, noteText, inScope,
  recentLines, readLines, file, clock,
};
