'use strict';

/**
 * mesh-dispatch.js - sessions on another computer, started and talked to from the hub's office.
 *
 * With several computers (guides/07-several-computers.md), the New session sheet on the hub can start a headless
 * session on any of them: a build machine that stays on, a laptop while it is open. Each computer runs its own sessions
 * with its own Claude Code sign-in, in its own Hub.
 *
 * The mesh stays push-only (mesh.js): the hub never dials out and a spoke opens no port. A start, a Stop or a Close
 * rides back to the spoke on the answer to its own feed, exactly as a note does, and what came of it rides in on the
 * feed after.
 *
 *   hub    <home>/mesh/<MACHINE>/dispatch-outbox.jsonl  { id, kind: 'start' | 'act', queued_at, req, view }, held only
 *                                                       until the spoke acknowledges it (the brief lives here until then)
 *          <home>/mesh/<MACHINE>/dispatch-handed.jsonl  one receipt per acknowledgement: done, or the spoke's own words
 *                                                       for why not. Never the brief.
 *          <home>/mesh/<MACHINE>/talk/<job id>.json     a job's prompts and final replies, as the spoke last sent them
 *   spoke  runs its OWN dispatch.createJob and startTurn, or dispatch.act. Its config/dispatch.json and its own places
 *          decide what is valid; the hub's word on a choice is never taken. Its feed carries `jobs` (dispatch.view, which
 *          already withholds a client job's brief), `dispatch_options` (names only), `dispatch_acks`, and `talk` for the
 *          jobs whose conversation moved since the hub last acknowledged it.
 *
 * The hub trusts none of it: every job, option and line of talk is re-whitelisted and clamped here, an unknown field is
 * dropped, and private work (workspace.config.json privacy.private_work) carries no brief and no talk whatever the
 * spoke sent.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

// The computers that share this office (workspace.config.json machines, and the fleet's), read each time so a
// computer added to the fleet is offered without a restart.
const MACHINES = () => config.machineNames();

const JOB_RE = /^d[0-9a-z]{6,24}$/;
const QUEUED_RE = /^q[0-9a-z]{6,24}$/;
const SESSION_RE = /^[0-9a-f-]{36}$/i;
const KEY_RE = /^[a-z][a-z0-9-]{0,60}$/;
const PLACE_RE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$/;
const STATES = new Set(['starting', 'working', 'idle', 'stopped', 'failed', 'closed']);
const ACTIONS = ['stop', 'close', 'reopen', 'notify', 'quiet'];

const MAX_JOBS = 60;
const MAX_PLACES = 80;
const MAX_TALK_JOBS = 20;
const TALK_MAX = 40;
const TEXT_MAX = 8000;
// What a spoke sends of talk in one feed (the hub takes 512 KB a feed, desks and all): the newest items of one job up
// to TALK_JOB_MAX, and jobs until TALK_FEED_MAX. The rest goes on the next feed, since the hub has not acknowledged it.
const TALK_JOB_MAX = 120 * 1024;
const TALK_FEED_MAX = 240 * 1024;
// A reply buzzes the phone only while it is news.
const REPLY_FRESH_MS = 10 * 60 * 1000;
// How long the page can follow a stand-in desk to the session it became.
const HANDED_SHOWN_MS = 10 * 60 * 1000;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const count = (v) => { const n = num(v); return n == null ? 0 : Math.max(0, Math.min(1e7, Math.round(n))); };
const clamp = (v, n) => (v == null || v === '' ? null : String(v).slice(0, n));
/** Text the page shows as one line: clamped, no control characters. */
const words = (v, n) => (v == null || v === '' ? null : String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n));
/** Text the page shows as a paragraph: clamped, line breaks kept, other control characters gone. */
const para = (v, n) => (v == null || v === '' ? null : String(v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').slice(0, n));

function dir(home, machine) { return path.join(home, 'mesh', machine); }
const outboxFile = (home, machine) => path.join(dir(home, machine), 'dispatch-outbox.jsonl');
const handedFile = (home, machine) => path.join(dir(home, machine), 'dispatch-handed.jsonl');
const talkFile = (home, machine, id) => path.join(dir(home, machine), 'talk', `${id}.json`);

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } }
function readLines(p) {
  try {
    return fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim())
      .map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
  } catch (_) { return []; }
}
function writeAtomic(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.${Math.random().toString(36).slice(2, 6)}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, p);
}
const writeLines = (p, list) => writeAtomic(p, list.map((x) => JSON.stringify(x)).join('\n') + (list.length ? '\n' : ''));

// The page reads the receipts on every frame, so the file keeps its newest RECEIPTS_KEEP lines once it passes twice
// that. A cleared mark always follows its receipt, so trimming from the front never orphans a refusal back onto the floor.
const RECEIPTS_KEEP = 500;
function appendHanded(home, machine, lines) {
  const f = handedFile(home, machine);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.appendFileSync(f, lines.map((x) => JSON.stringify(x)).join('\n') + '\n', 'utf8');
  const all = readLines(f);
  if (all.length > RECEIPTS_KEEP * 2) writeLines(f, all.slice(-RECEIPTS_KEEP));
}

/* ------------------------------------------------------- the wire, hub side */

/**
 * One job from a spoke's feed (its dispatch.jobView), re-whitelisted. null for anything unusable. `clientPlaces` is the
 * place labels the same feed's own options flag as private work: a job in one of them is private work whatever its own
 * flag says, and so is one the hub's own privacy rule names (dispatch.isClientPlace), so the hub never takes a spoke's
 * word that a private project's brief may travel.
 */
function cleanJob(w, machine, clientPlaces) {
  if (!w || typeof w !== 'object' || !JOB_RE.test(String(w.id || '')) || !SESSION_RE.test(String(w.session_id || ''))) return null;
  const label = String(w.place_label || '');
  const client = !!w.client_work || (!!label && ((clientPlaces && clientPlaces.has(label.toLowerCase()))
    || (label !== 'The Hub' && label !== 'Home folder' && require('./dispatch').isClientPlace(label.replace(/\s+/g, '-'), ''))));
  const t = w.turn && typeof w.turn === 'object' ? w.turn : null;
  const p = w.parent && typeof w.parent === 'object' && SESSION_RE.test(String(w.parent.session_id || '')) ? w.parent : null;
  return {
    id: String(w.id), machine, session_id: String(w.session_id),
    name: client ? 'Private work' : words(w.name, 40) || 'Session',
    as: KEY_RE.test(String(w.as || '')) ? String(w.as) : null, person: words(w.person, 40), role: words(w.role, 60),
    model: words(w.model, 20), model_id: words(w.model_id, 80), model_label: words(w.model_label, 40), effort: words(w.effort, 12),
    hands: words(w.hands, 20), hands_label: words(w.hands_label, 30), cap_min: count(w.cap_min),
    place_label: client ? null : words(w.place_label, 80),
    client_work: client, origin: w.origin === 'session' ? 'session' : 'owner', depth: Math.max(1, Math.min(9, count(w.depth) || 1)),
    // A helper's lead is on the helper's own computer (dispatch.createJob refuses anything else).
    parent: p ? { machine, session_id: String(p.session_id), name: words(p.name, 40) || 'its lead', job: JOB_RE.test(String(p.job || '')) ? String(p.job) : null } : null,
    created_at: num(w.created_at), status: STATES.has(w.status) ? w.status : 'idle',
    reason: words(w.reason, 300), paused: words(w.paused, 200),
    turns: count(w.turns), steps: count(w.steps),
    turn: t ? {
      n: count(t.n), started_at: num(t.started_at), ended_at: num(t.ended_at), ok: typeof t.ok === 'boolean' ? t.ok : null,
      ms: num(t.ms), steps: count(t.steps), stop: words(t.stop, 12), denials: count(t.denials), out_tokens: num(t.out_tokens), notes: count(t.notes),
    } : null,
    running_since: num(w.running_since), reported_at: num(w.reported_at),
    brief: client ? null : para(w.brief, 1200),
    notify: !!w.notify && !p, pending: count(w.pending),
  };
}

/** `options` is the same feed's cleaned dispatch_options (cleanOptions), whose client places mark their jobs. */
function cleanJobs(list, machine, options) {
  const clientPlaces = new Set(((options && options.places) || []).filter((p) => p.client)
    .flatMap((p) => [String(p.label).toLowerCase(), String(p.key).toLowerCase()]));
  return Array.isArray(list) ? list.slice(0, MAX_JOBS).map((w) => cleanJob(w, machine, clientPlaces)).filter(Boolean) : null;
}

/** What a spoke's New session sheet would offer: its places by name, whether it has Claude Code, how busy it is. */
function cleanOptions(o) {
  if (!o || typeof o !== 'object') return null;
  return {
    places: (Array.isArray(o.places) ? o.places : []).slice(0, MAX_PLACES)
      .filter((p) => p && PLACE_RE.test(String(p.key || '')))
      .map((p) => ({ key: String(p.key), label: words(p.label, 80) || String(p.key), client: !!p.client })),
    claude: o.claude === true, running: count(o.running), max_running: count(o.max_running) || null,
  };
}

/** A job's conversation on the wire: prompts and final replies only, the newest TALK_MAX, each clamped. */
function cleanTalk(items) {
  return (Array.isArray(items) ? items : []).slice(-TALK_MAX).map((i) => {
    if (!i || (i.kind !== 'prompt' && i.kind !== 'reply') || typeof i.text !== 'string') return null;
    const out = { kind: i.kind, at: num(i.at), text: i.text.replace(/\u0000/g, '').slice(0, TEXT_MAX) };
    if (i.kind === 'prompt') out.who = words(i.who, 60) || 'owner';
    else out.steps = count(i.steps);
    return out;
  }).filter(Boolean);
}

/**
 * Whether the newest reply answers the owner's own words: the brief, a note, or an answer to a question. A reply to
 * a helper's report, the group chat or an office nudge is not one. The phone buzzes for questions and
 * for direct replies, nothing else.
 */
function answersOwner(items) {
  let i = items.length - 1;
  while (i >= 0 && items[i].kind !== 'reply') i -= 1;
  while (i >= 0 && items[i].kind !== 'prompt') i -= 1;
  if (i < 0) return false;
  const p = items[i];
  return ['brief', 'owner', 'the owner'].includes(p.who) || p.text.includes('Note from the office (the owner,');
}

/**
 * Keep the talk a spoke sent, for jobs its own feed lists and never for client work. Every version is acknowledged,
 * kept or not, so the spoke stops resending it. Returns { acks: { <job id>: version }, replied: [jobs] }: the owner's
 * own jobs with "buzz my phone" on that have a reply newer than the one the hub held.
 */
function storeTalk(home, machine, talk, jobs, now) {
  const acks = {};
  const replied = [];
  if (!talk || typeof talk !== 'object' || Array.isArray(talk)) return { acks, replied };
  const byId = new Map((jobs || []).map((j) => [j.id, j]));
  const lastReply = (items) => (items || []).reduce((t, i) => (i.kind === 'reply' && i.at > t ? i.at : t), 0);
  for (const id of Object.keys(talk).slice(0, MAX_TALK_JOBS)) {
    const job = byId.get(id);
    const t = talk[id];
    const v = t && typeof t === 'object' ? words(t.v, 80) : null;
    if (!job || !v) continue;
    acks[id] = v;
    if (job.client_work) continue;
    const items = cleanTalk(t.items);
    const f = talkFile(home, machine, id);
    const was = lastReply((readJson(f) || {}).items);
    writeAtomic(f, JSON.stringify({ v, received_at: now, items }));
    const is = lastReply(items);
    if (is > was && now - is < REPLY_FRESH_MS && job.notify && !job.parent && answersOwner(items)) replied.push(job);
  }
  return { acks, replied };
}

/* ------------------------------------------------------------ the outbox */

/** Queue a start or an act for a spoke. `view` is what the page shows of a start meanwhile: never the brief. */
function queue(home, machine, kind, req, view, now) {
  const rec = { id: `q${now.toString(36)}${crypto.randomBytes(3).toString('hex')}`, kind, queued_at: now, req };
  if (view) rec.view = view;
  fs.mkdirSync(dir(home, machine), { recursive: true });
  fs.appendFileSync(outboxFile(home, machine), JSON.stringify(rec) + '\n', 'utf8');
  return rec;
}

/** What goes to a spoke on the answer to its feed. */
function pending(home, machine) {
  return readLines(outboxFile(home, machine)).map((r) => ({ id: r.id, kind: r.kind, queued_at: r.queued_at, req: r.req }));
}

/**
 * The spoke did these, or said why not: drop them from the outbox and keep a receipt without the brief. A start's
 * receipt names the session it became, from the same feed's jobs, so the page can follow its stand-in desk there.
 */
function ack(home, machine, acks, jobs, now) {
  const list = (Array.isArray(acks) ? acks : []).slice(0, 100).filter((a) => a && QUEUED_RE.test(String(a.id || '')));
  if (!list.length) return 0;
  const byId = new Map(list.map((a) => [String(a.id), a]));
  const all = readLines(outboxFile(home, machine));
  const done = all.filter((r) => byId.has(r.id));
  if (!done.length) return 0;
  writeLines(outboxFile(home, machine), all.filter((r) => !byId.has(r.id)));
  const receipts = done.map((r) => {
    const a = byId.get(r.id);
    const ok = a.ok === true;
    const jobId = JOB_RE.test(String(a.job_id || '')) ? String(a.job_id) : null;
    const job = jobId && (jobs || []).find((j) => j.id === jobId);
    const out = { id: r.id, kind: r.kind, queued_at: r.queued_at, handed_over_at: now, ok, job_id: jobId, session_id: job ? job.session_id : null, error: ok ? null : words(a.error, 300) || 'It was not done.' };
    if (r.kind === 'act') Object.assign(out, { job: r.req && r.req.job, action: r.req && r.req.action });
    if (r.view) out.view = r.view;
    return out;
  });
  appendHanded(home, machine, receipts);
  return done.length;
}

/** The receipts, newest last, each start marked when the owner cleared it or took it back. */
function receipts(home, machine) {
  const lines = readLines(handedFile(home, machine));
  const cleared = new Set(lines.filter((x) => x.cleared_at).map((x) => x.id));
  return lines.filter((x) => !x.cleared_at).map((x) => (cleared.has(x.id) ? Object.assign({}, x, { cleared: true }) : x));
}

/** A start on its way, or one the spoke refused, as the page's job list carries it: a stand-in with no session yet. */
function standIn(r, machine, status, error) {
  const v = r.view || {};
  return Object.assign({
    name: 'New session', as: null, person: null, role: null, model: null, model_id: null, model_label: null, effort: null,
    hands: null, hands_label: null, cap_min: null, place_label: null, client_work: false, notify: false, parent: null,
  }, v, {
    id: r.id, machine, session_id: null, start: true, origin: 'owner', depth: v.parent ? 2 : 1, created_at: r.queued_at,
    status, reason: error || null, paused: null, turns: 0, steps: 0, turn: null, running_since: null, reported_at: null,
    brief: null, pending: 0, feed_stale: false, stale: null,
  });
}

/* ------------------------------------------------------- what the hub shows */

function feedOf(home, machine) { return readJson(path.join(dir(home, machine), 'feed.json')); }

/** How old a feed is and what that means (mesh.readRemote's rule). */
function freshness(feed, cfg, now) {
  const m = (cfg && cfg.mesh) || {};
  const interval = feed.interval_ms || m.default_interval_ms || 15000;
  const age = now - feed.received_at;
  return { age, stale: age > interval * (m.stale_multiple || 4), gone: age > interval * (m.drop_multiple || 240) };
}

const agoWords = (ms) => { const min = Math.round(ms / 60000); return min < 1 ? 'under a minute' : min < 60 ? `${min} min` : `${Math.round(min / 60)} h`; };

/**
 * Every other computer's jobs (from its newest feed, each with its machine; a stale feed's jobs say so), the starts
 * on their way or refused, and the starts the page can follow to the session they became.
 * @returns { jobs, handed: [{ id, machine, session_id }] }
 */
function remote(home, now, cfg, self, keepMs) {
  const jobs = [];
  const handed = [];
  for (const machine of MACHINES()) {
    if (machine === self) continue;
    const feed = feedOf(home, machine);
    if (feed && Array.isArray(feed.jobs)) {
      const f = freshness(feed, cfg, now);
      if (!f.gone) {
        for (const j of feed.jobs) {
          let talkV = null;
          try { talkV = fs.statSync(talkFile(home, machine, j.id)).mtimeMs; } catch (_) { /* none kept yet */ }
          jobs.push(Object.assign({}, j, {
            machine, talk_v: talkV, feed_stale: f.stale,
            stale: f.stale ? `${machine} stopped reporting ${agoWords(f.age)} ago; this is how it last stood.` : null,
          }));
        }
      }
    }
    for (const r of readLines(outboxFile(home, machine))) if (r.kind === 'start') jobs.push(standIn(r, machine, 'queued', null));
    for (const x of receipts(home, machine)) {
      if (x.kind !== 'start' || x.cleared) continue;
      if (!x.ok && now - x.handed_over_at < keepMs) jobs.push(standIn(x, machine, 'failed', `${machine} didn't start it: ${x.error}`));
      if (x.ok && x.session_id && now - x.handed_over_at < HANDED_SHOWN_MS) handed.push({ id: x.id, machine, session_id: x.session_id });
    }
  }
  return { jobs, handed };
}

/** Another computer's job by its id, from the newest feeds: { machine, job, stale } or null. */
function findJob(home, id, now, cfg, self) {
  for (const machine of MACHINES()) {
    if (machine === self) continue;
    const feed = feedOf(home, machine);
    const job = feed && Array.isArray(feed.jobs) ? feed.jobs.find((j) => j.id === id) : null;
    if (job) return { machine, job, stale: freshness(feed, cfg, now).stale };
  }
  return null;
}

/** The computer a session the office started lives on, by its session id: where a note to it goes. */
function machineOf(home, sessionId, self) {
  for (const machine of MACHINES()) {
    if (machine === self) continue;
    const feed = feedOf(home, machine);
    if (feed && Array.isArray(feed.jobs) && feed.jobs.some((j) => j.session_id === sessionId)) return machine;
  }
  return null;
}

/**
 * The other computers the New session sheet offers, on the hub only (a spoke reads no feeds): every computer in the
 * settings, reachable or not, so an offline one says why. Each says whether a session can start there now and, when
 * not, why in plain words.
 */
function machines(home, now, cfg, self) {
  let hub = null;
  try { hub = config.hubMachine(); } catch (_) { hub = null; }
  if (self !== hub) return [];
  const out = [];
  for (const machine of MACHINES()) {
    if (machine === self) continue;
    const feed = feedOf(home, machine);
    const f = feed ? freshness(feed, cfg, now) : null;
    const fresh = !!(f && !f.stale);
    const o = fresh ? feed.dispatch_options : null;
    let why = null;
    if (!feed) why = `${machine} is offline: it has never reported to this office.`;
    else if (!fresh) why = `${machine} is offline: its last report came ${agoWords(f.age)} ago.`;
    else if (!o) why = `${machine}'s office is on older code that can't start sessions yet.`;
    else if (!o.claude) why = `Claude Code isn't installed where ${machine}'s office can find it.`;
    else if (o.max_running && o.running >= o.max_running) why = `${o.running} sessions are already working on ${machine}, the most at once.`;
    out.push({ key: machine, label: machine, ok: !why, why, places: o ? o.places : [], running: o ? o.running : null, max_running: o ? o.max_running : null });
  }
  return out;
}

/**
 * A start for another computer, checked on the hub against the choices every computer shares (config/dispatch.json).
 * Who sits in the chair and where it works are that computer's to decide; here they are only checked for shape.
 * @param p      the page's request
 * @param parent the lead on that computer, or null
 * @param opts   that computer's dispatch_options from its feed
 * @returns { ok: true, req, view } | { ok: false, status, error }
 */
function startRequest(p, parent, opts, ctx) {
  const D = require('./dispatch');
  const c = D.loadConfig(ctx && ctx.config);
  const r = p || {};
  const v = D.vetShared(c, { brief: r.brief, model: r.model, effort: r.effort, hands: r.hands, cap_min: r.cap_min, origin: 'owner' });
  if (!v.ok) return v;
  if (r.name != null && r.name !== '' && !D.NAME_RE.test(String(r.name))) return { ok: false, status: 400, error: 'A name is up to 40 letters, numbers and spaces.' };
  const as = r.as == null || r.as === '' ? null : String(r.as);
  if (as && !D.AGENT_RE.test(as)) return { ok: false, status: 400, error: `There is nobody called ${as.slice(0, 40)} in the org.` };
  const place = r.place == null || r.place === '' || r.place === 'hub' ? null : String(r.place);
  if (place && !PLACE_RE.test(place)) return { ok: false, status: 400, error: `There is no project called ${place.slice(0, 60)} there.` };
  const pl = place ? ((opts && opts.places) || []).find((x) => x.key === place) : null;
  const client = !!(pl && pl.client) || !!(parent && parent.client_work);
  const person = as ? D.people(ctx && ctx.agentsDir).find((x) => x.key === as) || null : null;
  const notify = !parent && r.notify === true;
  const req = {
    brief: v.brief, model: v.model.key, effort: v.effort, hands: v.hands.key, cap_min: v.cap,
    as, place, name: r.name ? String(r.name) : null, notify, parent: parent || null,
  };
  const view = {
    name: client ? 'Private work' : r.name ? String(r.name) : person ? person.person : D.nameFromBrief(v.brief),
    as, person: person ? person.person : null, role: person ? person.role : null,
    model: v.model.key, model_id: v.model.id, model_label: v.model.label, effort: v.effort,
    hands: v.hands.key, hands_label: v.hands.label, cap_min: v.cap,
    place_label: client ? null : pl ? pl.label : place || 'The Hub', client_work: client, notify,
    parent: parent ? { machine: parent.machine, session_id: parent.session_id, name: parent.name || 'its lead', job: null } : null,
  };
  return { ok: true, req, view };
}

/**
 * Stop, Close, Reopen and the buzz, from the page, for a job on another computer: queued for its next feed. For a
 * start still on its way, Close takes it back; for one that was refused, it clears it off the floor.
 */
function act(home, id, verb, now, cfg, self) {
  if (QUEUED_RE.test(String(id))) {
    for (const machine of MACHINES()) {
      if (machine === self) continue;
      const all = readLines(outboxFile(home, machine));
      const r = all.find((x) => x.id === id && x.kind === 'start');
      const x = r ? null : receipts(home, machine).find((y) => y.id === id && y.kind === 'start' && !y.ok && !y.cleared);
      if (!r && !x) continue;
      if (verb !== 'close' && verb !== 'stop') return { ok: false, status: 409, message: `It hasn't started on ${machine} yet.` };
      if (r) writeLines(outboxFile(home, machine), all.filter((y) => y.id !== id));
      appendHanded(home, machine, [{ id, cleared_at: now }]);
      return {
        ok: true, status: 200, machine,
        message: r ? `Taken back. If ${machine} had already picked it up, it shows on the floor and you can close it there.` : 'Cleared.',
      };
    }
    return { ok: false, status: 404, message: "There's no such session." };
  }
  const found = findJob(home, id, now, cfg, self);
  if (!found) return { ok: false, status: 404, message: "There's no such session." };
  const { machine, job } = found;
  if (!ACTIONS.includes(verb)) return { ok: false, status: 404, message: 'Stop, close or reopen.' };
  if (found.stale) return { ok: false, status: 409, message: `${machine} is offline, so this can't reach ${job.name} now.` };
  if ((verb === 'notify' || verb === 'quiet') && job.parent) return { ok: false, status: 409, message: `${job.name} reports to ${job.parent.name}, not to your phone.` };
  const rec = queue(home, machine, 'act', { job: id, action: verb }, null, now);
  const said = {
    stop: `${job.name} stops when ${machine} picks this up, within a minute.`,
    close: `${job.name} closes when ${machine} picks this up, within a minute. Its notes wait until you reopen it.`,
    reopen: `${job.name} reopens when ${machine} picks this up, within a minute.`,
    notify: `Your phone buzzes when ${job.name} replies to you.`,
    quiet: `No buzz when ${job.name} replies to you.`,
  };
  return { ok: true, status: 200, machine, queued: rec.id, message: said[verb] };
}

/** The talk the hub keeps for another computer's job; nothing for client work or a start still on its way. */
function talk(home, id, now, cfg, self) {
  if (QUEUED_RE.test(String(id))) return { ok: true, items: [] };
  const found = findJob(home, id, now, cfg, self);
  if (!found) return { ok: false, status: 404, error: "There's no such session." };
  if (found.job.client_work) return { ok: true, client_work: true, items: [] };
  const t = readJson(talkFile(home, found.machine, id));
  return { ok: true, machine: found.machine, received_at: t ? t.received_at : null, items: t && Array.isArray(t.items) ? t.items : [] };
}

/* ------------------------------------------------------------- spoke side */

/** The version of a job's talk: it moves when a turn starts or ends, or its status changes. */
const talkVersion = (j) => `${j.turns}:${j.status}:${(j.turn && j.turn.ended_at) || 0}`;

/**
 * What a spoke adds to its feed: its jobs, what its New session sheet would offer (names only), and the talk of every
 * job (never client work) whose version the hub has not acknowledged, within the feed's budget.
 * @param acked { <job id>: version } the hub has acknowledged; null sends no talk at all (a hub that has not yet
 *              answered with talk_acks may be on older code, and would take the same talk again every feed)
 * @param ctx   { machine, hubRoot, projects, now }
 */
function spokeParts(home, acked, ctx) {
  const D = require('./dispatch');
  const now = (ctx && ctx.now) || Date.now();
  const jobs = D.view(home, now);
  const o = D.options(home, { hubRoot: ctx && ctx.hubRoot });
  const options = { places: o.places, claude: o.claude, running: o.running, max_running: o.limits.max_running };
  const talkOut = {};
  let budget = TALK_FEED_MAX;
  for (const j of acked ? jobs : []) {
    if (j.client_work) continue;
    const v = talkVersion(j);
    if (acked && acked[j.id] === v) continue;
    const t = D.talk(home, j.id, ctx && ctx.projects);
    if (!t.ok || t.client_work) continue;
    let items = t.items;
    let size = JSON.stringify(items).length;
    while (items.length > 1 && size > TALK_JOB_MAX) { items = items.slice(1); size = JSON.stringify(items).length; }
    if (size > budget) continue;
    budget -= size;
    talkOut[j.id] = { v, items };
  }
  return { jobs, dispatch_options: options, talk: talkOut };
}

/**
 * Do what the hub queued for this computer, each once: a start through this computer's own createJob and startTurn,
 * an act through dispatch.act. Returns the acknowledgements for the next feed. A record handled before (its
 * acknowledgement was lost) is acknowledged again as it went, never done twice: its id is written down before it is
 * done, so even a restart in the middle cannot start it twice.
 * @param ctx { machine, hubRoot, launch? }
 */
async function handle(home, records, ctx) {
  const D = require('./dispatch');
  const seenFile = path.join(home, 'mesh-dispatch-seen.json');
  let seen = readJson(seenFile);
  if (!Array.isArray(seen)) seen = [];
  const save = () => { try { writeAtomic(seenFile, JSON.stringify(seen.slice(-300))); } catch (_) { /* best effort */ } };
  const acks = [];
  for (const rec of (Array.isArray(records) ? records : []).slice(0, 20)) {
    if (!rec || !QUEUED_RE.test(String(rec.id || ''))) continue;
    const was = seen.find((x) => x.id === rec.id);
    if (was) { acks.push(was.ack); continue; }
    const entry = { id: rec.id, ack: { id: rec.id, ok: false, job_id: null, error: 'This computer restarted while it was being done; look for it on the floor before asking again.' } };
    seen.push(entry);
    save();
    let a;
    try {
      const req = rec.req && typeof rec.req === 'object' ? rec.req : {};
      if (rec.kind === 'start') {
        const r = D.createJob(home, Object.assign({}, req, { origin: 'owner' }), { machine: ctx.machine, hubRoot: ctx.hubRoot });
        if (!r.ok) a = { id: rec.id, ok: false, job_id: null, error: r.error };
        else {
          const s = await D.startTurn(home, r.job.id, ctx);
          a = s.ok ? { id: rec.id, ok: true, job_id: r.job.id, error: null } : { id: rec.id, ok: false, job_id: r.job.id, error: s.error };
        }
      } else if (rec.kind === 'act') {
        const job = String(req.job || '');
        const r = await D.act(home, job, String(req.action || ''));
        a = { id: rec.id, ok: !!r.ok, job_id: D.ID_RE.test(job) ? job : null, error: r.ok ? null : r.message };
      } else {
        a = { id: rec.id, ok: false, job_id: null, error: "This computer's office doesn't know that request." };
      }
    } catch (e) {
      a = { id: rec.id, ok: false, job_id: null, error: 'Something went wrong on this computer.' };
    }
    entry.ack = a;
    save();
    acks.push(a);
  }
  return acks;
}

module.exports = {
  MACHINES, QUEUED_RE, TALK_MAX, TEXT_MAX,
  cleanJob, cleanJobs, cleanOptions, cleanTalk, storeTalk, queue, pending, ack, receipts, remote, findJob, machineOf,
  machines, startRequest, act, talk, talkVersion, spokeParts, handle, freshness,
};
