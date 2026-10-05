'use strict';

/**
 * view.js — what the owner's screen needs, and nothing else.
 *
 * The reader (reader.js) answers every question about the floor. The page is a
 * clean view: watch the sessions work, see what each is doing, message them,
 * and follow their flows between helpers and between sessions. No audit logs,
 * no alert trails.
 *
 * So this shapes one frame of:
 *   sessions  who is at a desk, what they are doing right now in a sentence,
 *             who is helping them, the notes you sent them
 *   flows     who said what to whom on the comms buses, mapped onto sessions
 * This is a projection of the reader's output; the reader is untouched.
 */

const fs = require('fs');
const path = require('path');
const S = require('./sources');
const inbox = require('./inbox');
const mesh = require('./mesh');
const nudge = require('./nudge');
const { thisMachine } = require('./geography');

const FLOW_WINDOW_MS = 45 * 60 * 1000;
const PEOPLE = path.join(__dirname, '..', '..', 'config', 'org-people.json');

// config/org-people.json, re-read when it changes (a run adds its lanes there).
let people = { at: null, file: null, cfg: null };
function loadPeople(file) {
  const f = file || PEOPLE;
  try {
    const at = fs.statSync(f).mtimeMs;
    if (people.file !== f || people.at !== at) people = { at, file: f, cfg: JSON.parse(fs.readFileSync(f, 'utf8')) };
  } catch (_) { people = { at: null, file: f, cfg: null }; }
  return people.cfg || { roster: {}, runs: [] };
}

/** The title's own words, with the run code and lane taken out: "RUN0412-N product gate" -> "Product gate". */
function scopeOf(title) {
  const words = String(title || '')
    .replace(/\b[A-Z]{2,}\d{2,}(?:-[A-Z])?\b/g, ' ')
    .replace(/\blane\s+[a-z]\b/gi, ' ')
    .split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
  return words ? words[0].toUpperCase() + words.slice(1) : null;
}

/**
 * Who runs this session, by config/org-people.json ("James-1-Planning" for the first of
 * James's sessions): a run's lane map, else an agent-org seat, else a gate. Null when no rule
 * names one.
 */
function personOf(d, cfg) {
  const seat = (d.callsign && d.callsign.seat) || '';
  const hay = [d.title, d.code_cwd, seat].filter(Boolean).join(' ').toLowerCase();
  const has = (m) => !!m && hay.includes(String(m).toLowerCase());
  const scope = (s) => (d.client_work ? 'Private work' : s || scopeOf(d.title));
  for (const run of cfg.runs || []) {
    if (!has(run.match)) continue;
    const lane = (run.lanes || []).find((l) => has(l.match));
    if (lane) return { person: lane.person, scope: scope(lane.scope) };
  }
  const roster = cfg.roster || {};
  const s = seat.toLowerCase();
  const agent = Object.keys(roster).find((k) => k === s || String(roster[k]).toLowerCase() === s);
  if (agent) return { person: roster[agent], scope: scope(null) };
  if (cfg.gate && (s === 'gate' || /\bgate\b/i.test(d.title || ''))) return { person: cfg.gate, scope: scope(null) };
  return null;
}

/**
 * Every session's one name, the same on its desk, its panel and the hub floor: <person>-<n>-<workscope>,
 * n counting that person's sessions in the order they started. Else its callsign, else its title.
 */
function nameSessions(sessions, whos) {
  const byPerson = new Map();
  sessions.forEach((s, i) => {
    const w = whos[i];
    if (!w) return;
    if (!byPerson.has(w.person)) byPerson.set(w.person, []);
    byPerson.get(w.person).push(i);
  });
  for (const [person, idx] of byPerson) {
    idx.sort((a, b) => (sessions[a].started_at || Infinity) - (sessions[b].started_at || Infinity)
      || `${sessions[a].machine}:${sessions[a].id}`.localeCompare(`${sessions[b].machine}:${sessions[b].id}`));
    idx.forEach((i, k) => {
      const name = `${person}-${k + 1}`;
      const label = whos[i].scope ? `${name}-${whos[i].scope}` : name;
      sessions[i].display = { name, label, rename: label.replace(/\s+/g, '-'), person };
    });
  }
  for (const s of sessions) {
    if (s.display) continue;
    const c = s.callsign;
    s.display = c ? { name: c.name, label: c.label, rename: c.rename, person: null } : { name: s.name, label: s.name, rename: null, person: null };
  }
  return sessions;
}

function family(model) {
  const m = String(model || '').toLowerCase();
  for (const f of ['opus', 'fable', 'sonnet', 'haiku']) if (m.includes(f)) return f;
  return 'unknown';
}

/** Run and lane tags a session carries in its title or working tree. */
function tagsOf(d) {
  const hay = [d.code_cwd, d.title, d.lane].filter(Boolean).join(' ');
  const run = /\brun[-\s]?(\d+[a-z]?)\b/i.exec(hay);
  const lane = /\blane[-\s]?([a-z])\b/i.exec(hay);
  return { run: run ? run[1].toLowerCase() : null, lane: lane ? lane[1].toLowerCase() : null };
}

function prettyRoom(name) {
  return String(name || 'unknown').replace(/[_-]+/g, ' ').trim();
}

function step(r) {
  return r ? { verb: r.verb || S.verbFor(r.tool), tool: r.tool || null, summary: r.summary || null, at: r.at || null } : null;
}

/**
 * The notes you sent this session. A local one is marked read from the local
 * delivered log; one on another machine, from that machine's last delivery
 * time as its feed reports it.
 */
function notesOf(d, home) {
  const notes = inbox.thread(home, d.id);
  if (!d.remote) return notes;
  const at = d.remote_inbox && d.remote_inbox.delivered_at;
  return notes.map((n) => Object.assign({}, n, { delivered_at: at && at >= n.at ? at : null }));
}

/**
 * The desk's callsign, display-ready: `Vega · LAPTOP · run-1 lane B`. The role
 * is the seat the session was launched into, else the run and lane its tree
 * carries, else its room. Private work is labelled as such, never by project.
 */
function callsignOf(d, machine, tags, room) {
  const c = d.callsign;
  if (!c || !c.name) return null;
  const runLane = tags.run ? `run-${tags.run}${tags.lane ? ` lane ${tags.lane.toUpperCase()}` : ''}` : null;
  const role = d.client_work ? 'private work'
    : c.seat ? (runLane ? `${runLane} ${c.seat}` : c.seat)
      : runLane || room;
  const m = c.machine || machine;
  return {
    name: c.name, machine: m, role,
    label: [c.name, m, role].filter(Boolean).join(' · '),
    rename: `${String(c.name).replace(/\s+/g, '')}-${m}`,
  };
}

function sessionOf(d, self, home) {
  const machine = d.machine || self;
  const tags = tagsOf(d);
  const model = d.model && d.model.status !== 'NOT_READ' ? d.model.value : null;
  const state = d.state === 'working' ? 'working' : d.state === 'waiting' ? 'waiting' : 'idle';
  const recent = d.recent || [];
  const seats = d.seats || [];
  // A private session's folder name can be a client's name, so it never names the room.
  const room = d.client_work ? 'Private work' : tags.run ? `Run ${tags.run}` : prettyRoom(d.project);
  // A waiter (bin/office-wake-hook.js) lives on this machine only; another
  // machine's desk keeps the old wording.
  const wake = d.remote ? null : nudge.status(home, d.id, !!tags.run);
  return {
    id: d.id,
    machine,
    name: d.title || (d.client_work ? 'Private work' : d.lane),
    callsign: callsignOf(d, machine, tags, prettyRoom(d.project)),
    client_work: !!d.client_work,
    room,
    run: tags.run,
    lane: tags.lane,
    model,
    family: family(model),
    state,
    waiting: d.waiting ? { kind: d.waiting.kind, since: d.waiting.since, summary: d.waiting.summary || null } : null,
    now: step(recent[0]) || (d.activity && d.activity.value && d.activity.value.tool
      ? { verb: d.activity.value.verb, tool: d.activity.value.tool, summary: null, at: d.activity.observed_at }
      : null),
    before: recent.slice(1, 4).map(step),
    started_at: d.started_at || null,
    last_at: d.last_event_at || null,
    helpers: seats.map((s) => ({
      id: s.agent_id,
      type: s.agent_type || 'helper',
      task: s.description || null,
      family: family(s.model),
      now: step((s.recent || [])[0]) || (s.verb ? { verb: s.verb, tool: null, summary: null, at: null } : null),
    })),
    returned: (d.seats_returned || []).map((s) => ({
      id: s.agent_id, type: s.agent_type || 'helper', task: s.description || null, family: family(s.model), at: s.at,
    })),
    notes: notesOf(d, home),
    deliverable: d.remote ? mesh.noteStatus(home, d).deliverable : !d.reconstructed,
    waker: !!(wake && wake.live),
    keep_awake: wake ? wake.keep_awake : null,
    nudged_at: wake ? wake.nudged_at : null,
  };
}

/**
 * Map bus traffic onto sessions: on the machine whose bus carried it, channel
 * run-NN + sender lane-x is that lane's desk.
 */
function mapFlows(raw, sessions, now, self) {
  const byRunLane = new Map();
  for (const s of sessions) if (s.run && s.lane) byRunLane.set(`${s.machine}|${s.run}|${s.lane}`, s);
  const endpoint = (machine, channel, agent) => {
    const run = /\brun-(\d+[a-z]?)\b/i.exec(String(channel || ''));
    const lane = /\blane-([a-z])\b/i.exec(String(agent || ''));
    const s = run && lane ? byRunLane.get(`${machine}|${run[1].toLowerCase()}|${lane[1].toLowerCase()}`) : null;
    return { label: agent || 'everyone', session: s ? s.id : null, machine: s ? s.machine : null };
  };
  return raw
    .filter((f) => f.at && now - f.at < FLOW_WINDOW_MS)
    .map((f) => {
      const machine = f.machine || self;
      return {
        id: `${machine}:${f.id}`, machine, channel: f.channel, subject: f.subject, at: f.at, repo: f.repo,
        from: endpoint(machine, f.channel, f.from),
        to: f.to ? endpoint(machine, f.channel, f.to) : { label: f.channel, session: null, machine: null },
      };
    })
    .sort((a, b) => b.at - a.at);
}

/**
 * @param state   read() output
 * @param opts    { machine, home, flows: raw bus rows }
 */
function buildView(state, opts) {
  const machine = opts.machine || thisMachine();
  const now = state.asOf;
  const desks = state.desks || [];
  const sessions = desks.map((d) => sessionOf(d, machine, opts.home));
  const cfg = loadPeople(opts.peopleFile);
  nameSessions(sessions, desks.map((d) => personOf(d, cfg)));
  return {
    asOf: now,
    machine,
    sessions,
    flows: mapFlows(opts.flows || [], sessions, now, machine),
  };
}

module.exports = { buildView, tagsOf, mapFlows, family, callsignOf, personOf, scopeOf, nameSessions, loadPeople };
