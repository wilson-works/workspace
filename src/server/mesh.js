'use strict';

/**
 * mesh.js — one office for every machine you work on.
 *
 * The office combines all your machines into one shared space you can also
 * reach from your phone. The machines are workspace.config.json `machines`.
 *
 * SHAPE. One hub (the machine marked `hub`, ideally always on), any number of
 * spokes. Only the hub listens to the tailnet, and only through
 * `tailscale serve`; spokes open no port.
 *
 *   spoke  --POST /api/mesh/ingest-->  hub      desks + alarms, every interval
 *   spoke  <--------response---------  hub      notes waiting for that machine
 *
 * A spoke sends what ITS OWN wall would show — the output of reader.read(),
 * already past the privacy boundary in sources.js (titles withheld for client
 * work; no prompts, no tool inputs, no message text, ever). Nothing new is read
 * on the spoke for the hub's benefit. The hub does not trust that: every field
 * is re-whitelisted and clamped here, and an unknown field is dropped, not
 * passed through.
 *
 * HONESTY. A remote desk is only as fresh as its feed. Each feed carries the
 * spoke's own `interval_ms`; past `mesh.stale_multiple` x that, every desk from
 * that machine is demoted to `stale` and says so, and notes to it stop being
 * offered as deliverable. A feed that stopped is never shown as a quiet floor.
 *
 * NOTES. A note for a remote session is queued in the hub's outbox for that
 * machine, handed over in the response to that machine's next feed, written by
 * the spoke into its LOCAL inbox (the same file the delivery hook already
 * reads), and acknowledged on the feed after. The text is held on the hub only
 * until the spoke has acknowledged it.
 */

const fs = require('fs');
const path = require('path');
const { fact, notRead, STATUS } = require('./fact');
const Q = require('./questions');
const config = require('./config');

// Read once at start: a machine added to workspace.config.json joins after the office restarts.
const MACHINES = Object.freeze(config.machineNames());
const MAX_DESKS = 80;
const MAX_ALARMS = 40;
const MAX_FLOWS = 60;
const MAX_NOTE_CHARS = 1500;
const SESSION_RE = /^[0-9a-f-]{8,64}$/i;
const CALLSIGN_RE = /^[A-Za-z][A-Za-z0-9 -]{0,39}$/;
const STATES = new Set(['working', 'waiting', 'stale', 'ended', 'unknown']);

const clamp = (v, n) => (v == null ? null : String(v).slice(0, n));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function meshDir(home, machine) { return path.join(home, 'mesh', machine); }

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

/* ------------------------------------------------------------ the wire shape */

/** One activity step on the wire: tool name, verb, time, and the session's own one-line summary. */
function wireStep(r) {
  return { tool: r.tool, verb: r.verb, at: num(r.at), summary: r.summary || null };
}
function cleanStep(r, client) {
  return {
    tool: clamp(r && r.tool, 60), verb: clamp(r && r.verb, 24), at: num(r && r.at),
    summary: client ? null : clamp(r && r.summary, 120),
  };
}

/** A comms-bus line on the wire: who, to whom, the subject line, when. Never a body. */
function cleanFlow(f) {
  if (!f || typeof f !== 'object' || !num(f.at)) return null;
  return {
    id: clamp(f.id, 80), channel: clamp(f.channel, 60), from: clamp(f.from, 60), to: clamp(f.to, 60),
    subject: clamp(f.subject, 120), at: f.at, repo: clamp(f.repo, 80),
  };
}

/** Spoke side: a reader desk (facts and all) -> the plain wire desk. */
function flattenDesk(d, inbox) {
  const act = (d.activity && d.activity.value) || {};
  // A private session's folder and branch names can carry a client's name: they stay here.
  const client = !!d.client_work;
  return {
    id: d.id, lane: client ? 'private work' : d.lane, run: d.run || null, state: d.state,
    reconstructed: !!d.reconstructed,
    last_event_age_ms: num(d.last_event_age_ms),
    branch: client ? null : d.branch || null,
    model: d.model && d.model.status === STATUS.OK ? d.model.value : null,
    verb: act.verb || null, tool: act.tool || null,
    tool_at: d.activity ? num(d.activity.observed_at) : null,
    title: client ? null : d.title || null, client_work: client, project: client ? null : d.project || null,
    callsign: d.callsign ? { name: d.callsign.name, seat: d.callsign.seat || null } : null,
    started_at: num(d.started_at), last_event_at: num(d.last_event_at),
    waiting: d.waiting
      ? { since: num(d.waiting.since), on: d.waiting.on || null, kind: d.waiting.kind || null, summary: d.waiting.summary || null }
      : null,
    // The name of the code tree the session is in (never the full path): how
    // the hub tells which run and lane a desk is.
    tree: !client && d.code_cwd ? path.basename(String(d.code_cwd).replace(/[\\/]+$/, '')) : null,
    recent: (d.recent || []).slice(0, 8).map(wireStep),
    seats: (d.seats || []).slice(0, 12).map((s) => ({
      agent_id: s.agent_id, agent_type: s.agent_type, state: s.state,
      description: s.description || null, verb: s.verb || null, model: s.model || null,
      age_ms: num(s.age_ms), reconstructed: !!s.reconstructed,
      recent: (s.recent || []).slice(0, 3).map(wireStep),
    })),
    seats_done: num(d.seats_done) || 0,
    seats_returned: (d.seats_returned || []).slice(0, 4).map((s) => ({
      agent_id: s.agent_id, agent_type: s.agent_type, description: s.description || null, model: s.model || null, at: num(s.at),
    })),
    inbox: inbox
      ? { pending: num(inbox.pending) || 0, delivered_at: num(inbox.delivered_at), deliverable: !d.reconstructed }
      : null,
  };
}

/** Hub side: re-whitelist one wire desk. Returns null for anything unusable. */
function sanitizeDesk(w) {
  if (!w || typeof w !== 'object' || !SESSION_RE.test(String(w.id || ''))) return null;
  const client = !!w.client_work;
  return {
    id: String(w.id),
    lane: client ? 'private work' : clamp(w.lane, 120) || 'unknown',
    run: w.run && /^[\w.-]{1,40}$/.test(String(w.run)) ? String(w.run) : null,
    state: STATES.has(w.state) ? w.state : 'unknown',
    reconstructed: !!w.reconstructed,
    last_event_age_ms: num(w.last_event_age_ms),
    branch: client ? null : clamp(w.branch, 120),
    model: clamp(w.model, 80),
    verb: clamp(w.verb, 24), tool: clamp(w.tool, 60), tool_at: num(w.tool_at),
    // The spoke already withholds a client-work title. Withhold it again here:
    // the hub's wall is the one on a phone.
    title: client ? null : clamp(w.title, 200),
    client_work: client,
    // A name from a pool, never free text: letters, digits, space and hyphen.
    callsign: w.callsign && CALLSIGN_RE.test(String(w.callsign.name || ''))
      ? { name: String(w.callsign.name), seat: clamp(w.callsign.seat, 40) }
      : null,
    project: client ? null : clamp(w.project, 120),
    started_at: num(w.started_at), last_event_at: num(w.last_event_at),
    waiting: w.waiting && num(w.waiting.since)
      ? {
          since: w.waiting.since, on: clamp(w.waiting.on, 60),
          kind: w.waiting.kind === 'wakeup' || w.waiting.kind === 'background' ? w.waiting.kind : null,
          summary: client ? null : clamp(w.waiting.summary, 120),
        }
      : null,
    tree: client ? null : clamp(w.tree, 80),
    recent: Array.isArray(w.recent) ? w.recent.slice(0, 8).map((r) => cleanStep(r, client)) : [],
    seats: Array.isArray(w.seats)
      ? w.seats.slice(0, 12).map((s) => ({
          agent_id: clamp(s && s.agent_id, 80), agent_type: clamp(s && s.agent_type, 80),
          state: clamp(s && s.state, 16),
          description: client ? null : clamp(s && s.description, 200),
          verb: clamp(s && s.verb, 24), model: clamp(s && s.model, 80),
          age_ms: num(s && s.age_ms), reconstructed: !!(s && s.reconstructed),
          recent: Array.isArray(s && s.recent) ? s.recent.slice(0, 3).map((r) => cleanStep(r, client)) : [],
        }))
      : [],
    seats_done: num(w.seats_done) || 0,
    seats_returned: Array.isArray(w.seats_returned)
      ? w.seats_returned.slice(0, 4).map((s) => ({
          agent_id: clamp(s && s.agent_id, 80), agent_type: clamp(s && s.agent_type, 80),
          description: client ? null : clamp(s && s.description, 200),
          model: clamp(s && s.model, 80), at: num(s && s.at),
        }))
      : [],
    inbox: w.inbox && typeof w.inbox === 'object'
      ? { pending: num(w.inbox.pending) || 0, delivered_at: num(w.inbox.delivered_at), deliverable: w.inbox.deliverable !== false }
      : null,
  };
}

function sanitizeAlarm(a) {
  if (!a || typeof a !== 'object') return null;
  const sev = a.severity === 'page' ? 'page' : 'wall';
  return {
    lane: clamp(a.lane, 120) || 'unknown',
    condition: clamp(a.condition, 60) || 'unknown',
    since: num(a.since) || Date.now(),
    severity: sev,
    detail: clamp(a.detail, 300),
    desk: a.desk && SESSION_RE.test(String(a.desk)) ? String(a.desk) : null,
    run: a.run ? clamp(a.run, 40) : null,
  };
}

/* ------------------------------------------------------------------- ingest */

/**
 * Accept one feed from a spoke. `self` is this hub's own wall name; a machine
 * may not feed itself and an unknown machine may not feed at all.
 */
function ingest(home, body, now, self) {
  const machine = String((body && body.machine) || '').toUpperCase();
  if (!MACHINES.includes(machine)) return { ok: false, status: 400, error: 'unknown machine' };
  if (machine === self) return { ok: false, status: 400, error: 'a machine does not feed itself' };

  const desks = (Array.isArray(body.desks) ? body.desks : []).slice(0, MAX_DESKS).map(sanitizeDesk).filter(Boolean);
  const alarms = (Array.isArray(body.alarms) ? body.alarms : []).slice(0, MAX_ALARMS).map(sanitizeAlarm).filter(Boolean);
  const flows = (Array.isArray(body.flows) ? body.flows : []).slice(0, MAX_FLOWS).map(cleanFlow).filter(Boolean);
  // Owner questions, re-checked here: the spoke already refused technical ones,
  // and the hub does not take its word for it.
  const questions = [];
  for (const q of (Array.isArray(body.questions) ? body.questions : []).slice(0, 30)) {
    if (!q || !Q.ID_RE.test(String(q.id || '')) || !SESSION_RE.test(String(q.session_id || ''))) continue;
    const v = Q.vet(q.question, q.recommendation);
    if (!v.ok) continue;
    questions.push({ id: q.id, session_id: q.session_id, asked_at: num(q.asked_at) || now, question: v.question, recommendation: v.recommendation });
  }
  const interval = num(body.interval_ms);
  const feed = {
    v: 1, machine, received_at: now, sent_at: num(body.sent_at),
    interval_ms: interval && interval >= 1000 ? interval : null,
    desks, alarms, flows, questions,
  };
  writeAtomic(path.join(meshDir(home, machine), 'feed.json'), JSON.stringify(feed));

  const acks = (Array.isArray(body.acks) ? body.acks : []).map(String).slice(0, 200);
  if (acks.length) ackNotes(home, machine, acks, now);
  return { ok: true, status: 200, received_at: now, desks: desks.length, notes: pendingNotes(home, machine) };
}

function readFeed(home, machine) {
  try { return JSON.parse(fs.readFileSync(path.join(meshDir(home, machine), 'feed.json'), 'utf8')); } catch (_) { return null; }
}

/**
 * Everything the hub shows for the other machines, in the reader's own output
 * shape so the wall needs no second code path.
 */
function readRemote(home, now, cfg, self) {
  const m = (cfg && cfg.mesh) || {};
  const defInterval = m.default_interval_ms || 15000;
  const staleMult = m.stale_multiple || 4;
  const dropMult = m.drop_multiple || 240;
  const out = { desks: [], alarms: [], feeds: {} };

  for (const machine of MACHINES) {
    if (machine === self) continue;
    const src = path.join(meshDir(home, machine), 'feed.json');
    const feed = readFeed(home, machine);
    if (!feed) {
      out.feeds[machine] = notRead(src, 'this machine has never sent the office a feed', now);
      continue;
    }
    const interval = feed.interval_ms || defInterval;
    const age = now - feed.received_at;
    const stale = age > interval * staleMult;
    const gone = age > interval * dropMult;
    out.feeds[machine] = fact({
      value: { desks: feed.desks.length, interval_ms: interval },
      source_path: src, observed_at: feed.received_at,
      status: stale ? STATUS.STALE : STATUS.OK,
      note: stale ? `the last feed from ${machine} arrived ${Math.round(age / 1000)}s ago — its forwarder is not running, or the machine is off` : undefined,
      max_age_ms: interval * staleMult,
    });
    if (gone) continue; // hours-old desks are history, not a floor

    for (const w of feed.desks) {
      const state = stale && w.state !== 'ended' ? 'stale' : w.state;
      const srcDesk = `mesh:${machine}`;
      out.desks.push({
        id: w.id, lane: w.lane, machine, run: w.run, state,
        reconstructed: w.reconstructed, remote: true,
        feed_received_at: feed.received_at, feed_stale: stale,
        last_event_age_ms: w.last_event_age_ms == null ? null : w.last_event_age_ms + age,
        branch: w.branch,
        model: w.model
          ? fact({ value: w.model, source_path: srcDesk, observed_at: feed.received_at, status: STATUS.OK })
          : notRead('desk model', `${machine} did not report a model for this session`, now),
        activity: fact({
          value: { agent_type: null, verb: w.verb || 'working', tool: w.tool },
          source_path: srcDesk, observed_at: w.tool_at || w.last_event_at || feed.received_at,
          status: w.tool ? STATUS.OK : STATUS.EMPTY,
        }),
        title: w.title, client_work: w.client_work, project: w.project,
        // The pool is the feeding machine's: its name rides on that machine.
        callsign: w.callsign ? Object.assign({}, w.callsign, { machine }) : null,
        started_at: w.started_at, last_event_at: w.last_event_at,
        waiting: w.waiting, recent: w.recent, seats: stale ? [] : w.seats, seats_done: w.seats_done,
        seats_returned: w.seats_returned || [], code_cwd: w.tree || null,
        rows: notRead('queue', 'no run queue bound to this desk', now),
        remote_inbox: w.inbox,
      });
    }
    if (!stale) {
      for (const a of feed.alarms) {
        out.alarms.push(Object.assign({}, a, {
          machine, lane: `${machine} · ${a.lane}`, source_path: `mesh:${machine}`,
        }));
      }
    }
  }
  return out;
}

/** Which machine owns this session, by the newest feeds. null = not a remote desk. */
function ownerOf(home, sessionId, self) {
  for (const machine of MACHINES) {
    if (machine === self) continue;
    const feed = readFeed(home, machine);
    if (feed && feed.desks.some((d) => d.id === sessionId)) return machine;
  }
  return null;
}

/* ------------------------------------------------------------------- outbox */

function outboxFile(home, machine) { return path.join(meshDir(home, machine), 'outbox.jsonl'); }

function readLines(file) {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
  } catch (_) { return []; }
}

function queueNote(home, machine, sessionId, text, from, answer) {
  if (!MACHINES.includes(machine)) return { ok: false, error: 'unknown machine' };
  if (!SESSION_RE.test(String(sessionId || ''))) return { ok: false, error: 'not a session id' };
  const body = String(text || '').trim();
  if (!body) return { ok: false, error: 'empty note' };
  if (body.length > MAX_NOTE_CHARS) return { ok: false, error: `note is longer than ${MAX_NOTE_CHARS} characters` };
  const rec = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    session_id: String(sessionId), queued_at: Date.now(), from: from || 'owner', text: body,
  };
  // An answer to an owner question also travels as data, so the spoke can mark
  // its own copy answered (questions.js) and wake a session waiting on it.
  if (answer && answer.question_id) rec.answer = { question_id: answer.question_id, kind: answer.kind, text: answer.text || null };
  fs.mkdirSync(meshDir(home, machine), { recursive: true });
  fs.appendFileSync(outboxFile(home, machine), JSON.stringify(rec) + '\n', 'utf8');
  return { ok: true, id: rec.id, queued_at: rec.queued_at, via: machine };
}

function pendingNotes(home, machine) { return readLines(outboxFile(home, machine)); }

/** The spoke has written these into its local inbox. Drop the text; keep the receipt. */
function ackNotes(home, machine, ids, now) {
  const want = new Set(ids);
  const all = pendingNotes(home, machine);
  const keep = all.filter((n) => !want.has(n.id));
  const done = all.filter((n) => want.has(n.id));
  if (!done.length) return 0;
  writeAtomic(outboxFile(home, machine), keep.map((n) => JSON.stringify(n)).join('\n') + (keep.length ? '\n' : ''));
  const receipts = done.map((n) => JSON.stringify({ id: n.id, session_id: n.session_id, queued_at: n.queued_at, handed_over_at: now, chars: n.text.length })).join('\n') + '\n';
  fs.appendFileSync(path.join(meshDir(home, machine), 'handed-over.jsonl'), receipts, 'utf8');
  return done.length;
}

/** What the wall says about notes for one remote desk. */
function noteStatus(home, desk) {
  const held = pendingNotes(home, desk.machine).filter((n) => n.session_id === desk.id).length;
  const r = desk.remote_inbox || {};
  const status = { pending: held + (r.pending || 0), delivered_at: r.delivered_at || null, held_on_hub: held };
  if (desk.feed_stale) {
    status.deliverable = false;
    status.reason = `${desk.machine} has stopped reporting — a note would wait on this machine until it comes back`;
  } else if (r.deliverable === false) {
    status.deliverable = false;
    status.reason = `this session on ${desk.machine} isn't running the office's hooks, so nothing would hand it the note`;
  } else {
    status.deliverable = true;
  }
  return status;
}

module.exports = {
  MACHINES, flattenDesk, sanitizeDesk, sanitizeAlarm, ingest, readFeed, readRemote, ownerOf,
  queueNote, pendingNotes, ackNotes, noteStatus, meshDir,
};
