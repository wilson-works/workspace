'use strict';

/**
 * reader.js — the pure boundary.
 *
 *   read(root) -> state JSON
 *
 * Every data claim the office makes can be checked without a browser:
 * `bin/office-read.js` prints exactly what this returns, so anything the page
 * says about DATA is checkable with node and a fixture directory, no server
 * and no DOM.
 *
 * A `root` is a directory holding the office's view of the world:
 *
 *   <root>/office/events.jsonl      the hook stream             (WORKSPACE_HOME)
 *   <root>/projects/               a ~/.claude/projects mirror or fixture
 *
 * Both are optional. A missing source is NOT READ with a reason, never an
 * empty panel, never a zero, never a green.
 */

const fs = require('fs');
const path = require('path');
const { fact, notRead, aggregate, STATUS } = require('./fact');
const S = require('./sources');
const config = require('./config');
const { thisMachine } = require('./geography');

function loadConfig(configPath) {
  const p = configPath || path.join(__dirname, '..', '..', 'config', 'thresholds.json');
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  let mtime = 0;
  try { mtime = fs.statSync(p).mtimeMs; } catch (_) {}
  return { cfg, path: p, mtime };
}

/**
 * The conditions the office watches for. Each fires ONCE per
 * (lane, condition, first_seen). They are not shown on the page; the idle
 * nudge (nudge.js) uses `permission-undecided` to leave a session alone while
 * it waits on a permission prompt.
 */
function detectAlarms(ctx) {
  const { now, cfg, desks, openToolCalls, comms } = ctx;
  const alarms = [];

  const push = (a) => alarms.push(Object.assign({
    id: `${a.lane}|${a.condition}`,
    since: a.since,
    age_ms: now - a.since,
    severity: 'wall',
    feed_proven: true,
  }, a));

  for (const d of desks.values()) {
    if (d.reconstructed) continue;          // no arming event: never alarms
    if (d.state === 'ended') continue;

    // 1. Lane idle.
    if (d.last_event_age_ms > cfg.alarms.lane_idle_wall_ms) {
      push({
        lane: d.lane, desk: d.id, condition: 'lane-idle',
        since: d.last_event_at, source_path: ctx.eventsPath,
        severity: d.last_event_age_ms > cfg.alarms.lane_idle_page_ms ? 'page' : 'wall',
        detail: `no event for ${Math.round(d.last_event_age_ms / 1000)}s`,
      });
    }

    // 2. A turn that ended with no next event.
    //
    // Measured: a session emits `Stop` while a subagent it started is STILL
    // working (more events and the SubagentStop come afterwards). Arming on
    // `Stop` alone would false-positive on every session that backgrounds a
    // helper, so Stop does not arm while the desk has an open seat.
    if (d.turn_ended_at && d.open_seats === 0) {
      const since = d.turn_ended_at;
      if (now - since > cfg.alarms.stall_after_turn_end_ms) {
        push({
          lane: d.lane, desk: d.id, condition: 'turn-ended-no-next-event',
          since, source_path: ctx.eventsPath, severity: 'page',
          detail: `turn ended ${Math.round((now - since) / 1000)}s ago with no next event and no open seat`,
        });
      }
    }
  }

  // 3. Permission undecided.
  //
  // The documented feed (PermissionRequest / Notification:permission_prompt) is
  // not reliably delivered, so the arming path is the measured one: a
  // tool_use_id that got a PreToolUse and never a PostToolUse is a tool that
  // did not run.
  for (const [tid, call] of openToolCalls) {
    const d = desks.get(call.session_id);
    if (!d || d.reconstructed) continue;
    const age = now - call.at;
    if (age <= cfg.alarms.permission_undecided_ms) continue;

    // The false positive to avoid is a tool that is simply still running. Two
    // shapes distinguish "did not run" from "running":
    //   (a) the turn or the session ended while the call was still open - the
    //       session gave up because nobody answered;
    //   (b) nothing at all has happened since the call, past the threshold -
    //       the session is sitting on a dialog and emitting nothing.
    const endedAfter = (d.turn_ended_at && d.turn_ended_at > call.at) || (d.ended_at && d.ended_at > call.at);
    const quietSince = d.last_event_at <= call.at;
    if (!endedAfter && !quietSince) continue;

    push({
      lane: d.lane, desk: d.id, condition: 'permission-undecided',
      since: call.at, source_path: ctx.eventsPath, severity: 'page',
      armed_by: 'unclosed-tool_use_id',
      feed_proven: false,
      detail: `${call.tool_name} (${tid.slice(0, 16)}) opened ${Math.round(age / 1000)}s ago and never closed; no event since`,
    });
  }

  // 4. A BLOCKED post on a comms bus.
  if (comms && comms.ok) {
    for (const b of comms.blocked) {
      push({
        lane: b.work_order || b.channel, condition: 'blocked-post',
        since: Date.parse(b.posted_at) || now, source_path: comms.path,
        severity: 'page',
        detail: `${b.from_agent} posted BLOCKED on ${b.channel}`,
      });
    }
  }

  // A desk that is blocked, or whose turn ended, is ALSO idle - that is why it
  // is idle. The specific cause outranks the generic symptom, and the idle line
  // is dropped rather than said twice.
  const explained = new Set(
    alarms
      .filter((a) => a.condition === 'permission-undecided' || a.condition === 'turn-ended-no-next-event')
      .map((a) => a.desk)
      .filter(Boolean)
  );
  for (let i = alarms.length - 1; i >= 0; i -= 1) {
    if (alarms[i].condition === 'lane-idle' && explained.has(alarms[i].desk)) alarms.splice(i, 1);
  }

  return alarms;
}

function readCallsigns(officeHome) {
  try {
    const o = JSON.parse(fs.readFileSync(path.join(officeHome, 'callsigns.json'), 'utf8'));
    return o && typeof o === 'object' ? o : {};
  } catch (_) {
    return {};
  }
}

/** The main entry point. Pure with respect to disk: it reads, it never writes. */
function read(root, opts) {
  const o = opts || {};
  const now = typeof o.now === 'number' ? o.now : Date.now();
  const { cfg, path: cfgPath, mtime: cfgMtime } = o.config || loadConfig(o.configPath);

  const officeHome = o.officeHome || path.join(root, 'office');
  const projects = o.projects || path.join(root, 'projects');

  const sourcesRead = [];
  const sourcesFailed = [];
  const track = (ok, p) => { (ok ? sourcesRead : sourcesFailed).push(p); };

  /* ---- events -> desks and seats ---- */
  const ev = S.readEvents(officeHome);
  track(ev.ok, ev.path);
  const { desks, openToolCalls } = S.foldDesks(ev.events, now, cfg);

  /* ---- reconstruction for desks we did not observe ---- */
  let reconstructed = { ok: false, desks: [], path: projects, reason: 'not read' };
  if (fs.existsSync(projects)) {
    reconstructed = S.readReconstructed(projects, now - 24 * 3600 * 1000);
    track(reconstructed.ok, projects);
    // Waiting on something it started itself (see sources.transcriptMeta).
    // Bounded: a session that died mid-wait never writes the finish.
    const isWaiting = (d) => !!d.waiting && now - d.waiting.since < cfg.liveness.waiting_max_ms;
    for (const d of reconstructed.desks) {
      if (desks.has(d.id)) {
        // A desk the hooks already know about keeps its live timing, but the
        // hooks carry no title, model, launch project or activity trail. Those
        // come from the same session's transcript, so fill them in rather than
        // leave the hook-observed desks - the best-instrumented ones - nameless.
        const live = desks.get(d.id);
        for (const k of ['title', 'client_work', 'project', 'launch_cwd', 'code_cwd', 'model', 'branch', 'recent', 'started_at', 'source_path']) {
          if (live[k] == null || (Array.isArray(live[k]) && live[k].length === 0)) live[k] = d[k];
        }
        // Hooks carry a helper's type but not its task, model or activity; the
        // transcript's subagent files carry those. A helper the hooks never saw
        // start (it began before the event slice) is taken from the transcript.
        for (const s of d.seats) {
          const hs = live.seats.get(s.agent_id);
          if (hs) {
            for (const k of ['description', 'model', 'verb', 'tool', 'recent', 'age_ms']) if (hs[k] == null) hs[k] = s[k];
          } else {
            live.seats.set(s.agent_id, s);
          }
        }
        if (!live.last_tool && d.last_tool) live.last_tool = d.last_tool;
        live.waiting = d.waiting;
        if (live.state === 'stale' && isWaiting(d)) live.state = 'waiting';
        continue;
      }
      const seats = new Map();
      for (const s of d.seats) seats.set(s.agent_id, s);
      // A reconstructed desk is judged by the same liveness floor as an
      // observed one - otherwise every real session renders `unknown`.
      const age = d.last_event_age_ms;
      let state = 'working';
      if (age > cfg.liveness.desk_floor_ms && isWaiting(d)) state = 'waiting';
      else if (age > cfg.liveness.desk_floor_ms * 10) state = 'ended';
      else if (age > cfg.liveness.desk_floor_ms) state = 'stale';
      const m = /\brun-(\d+)\b/i.exec(String(d.lane));
      desks.set(d.id, Object.assign({}, d, {
        seats,
        open_seats: [...seats.values()].filter((s) => s.state === 'running').length,
        lane_id: S.laneId(d.cwd || d.slug),
        run: m ? `run-${m[1]}` : null,
        state,
      }));
    }
  }

  /* ---- comms buses ---- */
  const commsPaths = o.commsPaths || [];
  let comms = null;
  const commsFacts = [];
  for (const cp of commsPaths) {
    const c = S.readComms(cp, o.commsSince);
    track(c.ok, cp);
    if (c.ok && !comms) comms = c;
    commsFacts.push(
      c.ok
        ? fact({
            value: { messages: c.message_count, blocked: c.blocked.length, claims: c.claims.length },
            source_path: cp, observed_at: c.read_at,
            // EMPTY, not OK: a source returning a valid-but-empty result must be
            // visually distinct from a source returning nothing. A comms DB
            // resolved from the wrong folder opens empty and reports a quiet night.
            status: c.empty ? STATUS.EMPTY : STATUS.OK,
            note: c.empty ? 'read, and it was empty' : undefined,
          })
        : notRead(cp, c.reason, now)
    );
  }

  /* ---- alarms ---- */
  const alarms = detectAlarms({ now, cfg, desks, openToolCalls, comms, eventsPath: ev.path });

  /* ---- the other machines (mesh.js) ----
   * Their desks and alarms arrive as feeds the hub stored under
   * <office home>/mesh/<MACHINE>/. A spoke reads no feeds, so this is empty there. */
  const self = thisMachine();
  const remote = require('./mesh').readRemote(officeHome, now, cfg, self);
  for (const a of remote.alarms) alarms.push(a);
  const machineNames = config.machineNames().includes(self) ? config.machineNames() : [self].concat(config.machineNames());
  const machines = machineNames.map((name) => ({
    name,
    desks: 0,
    feed: name === self
      ? fact({ value: { local: true }, source_path: ev.path, observed_at: now, status: STATUS.OK, note: 'this machine - read directly' })
      : (remote.feeds[name] || notRead(`mesh:${name}`, 'no feed', now)),
  }));

  /* ---- the verdict ----
   * Only inputs that could CHANGE the answer are aggregated: could a session be
   * waiting on me and I not see it (the desk feed), could one have posted
   * BLOCKED and I not see it (the comms buses). */
  const deskFeed = (ev.ok && ev.events.length)
    ? fact({ value: ev.events.length, source_path: ev.path, observed_at: ev.read_at, status: STATUS.OK })
    : (reconstructed.ok
        ? fact({ value: desks.size, source_path: reconstructed.path, observed_at: now, status: desks.size ? STATUS.OK : STATUS.EMPTY })
        : notRead(ev.path, ev.reason, now));

  const blocking = alarms.filter((a) => a.severity === 'page');
  const verdictFact = aggregate({
    value: blocking.length,
    source_path: 'verdict (aggregate of the inputs that could change the answer)',
    observed_at: now,
    inputs: [deskFeed].concat(commsFacts),
  });
  const dark = verdictFact.dark || [];
  const working = [...desks.values()].filter((d) => d.state === 'working' || d.state === 'waiting').length;
  let word;
  if (blocking.length) word = 'WALK BACK';
  else if (dark.length) word = `UNKNOWN · ${dark.length} dark`;
  else if (working) word = `${working} WORKING`;
  else word = 'ALL QUIET';

  /* ---- desks ---- */
  const deskList = [...desks.values()].map((d) => ({
    id: d.id, lane: d.lane, machine: d.machine || thisMachine(), run: d.run || null,
    state: d.state, reconstructed: !!d.reconstructed,
    last_event_age_ms: d.last_event_age_ms,
    branch: d.branch || null,
    // No hook carries the model. It comes from the transcript's own
    // `message.model`, which is an id, not text (see sources.transcriptMeta).
    model: d.model
      ? fact({
          value: d.model,
          source_path: d.source_path || ev.path,
          observed_at: d.last_event_at || now,
          status: STATUS.OK,
        })
      : notRead('desk model', 'no assistant line read for this session yet', now),
    activity: fact({
      value: {
        agent_type: null,
        verb: S.verbFor(d.last_tool),
        tool: d.last_tool || null,
      },
      source_path: d.source_path || ev.path,
      observed_at: d.last_tool_at || d.last_event_at || now,
      status: d.last_tool ? STATUS.OK : STATUS.EMPTY,
    }),
    // Who this is and what it is for. `title` is null for private work.
    title: d.title || null,
    client_work: !!d.client_work,
    project: d.project || S.projectOf(d.launch_cwd || d.cwd),
    started_at: d.started_at || null,
    last_event_at: d.last_event_at || null,
    waiting: d.waiting || null,
    // The last few tool NAMES, newest first - the inspector's activity trail.
    recent: (d.recent || []).map((r) => ({ tool: r.tool, verb: r.verb, at: r.at, summary: r.summary || null })),
    code_cwd: d.code_cwd || null,
    seats: [...d.seats.values()].filter((s) => s.state === 'running').map((s) => ({
      agent_id: s.agent_id, agent_type: s.agent_type, state: s.state,
      description: s.description || null,
      verb: s.verb || null,
      model: s.model || null,
      age_ms: typeof s.age_ms === 'number' ? s.age_ms : null,
      recent: s.recent || [],
      reconstructed: !!s.reconstructed,
    })),
    // Helpers that came back in the last ten minutes, so a hand-off can be
    // seen returning instead of blinking out of existence.
    seats_returned: [...d.seats.values()]
      .filter((s) => s.state === 'done')
      .map((s) => ({ s, at: s.closed_at || s.last_at || 0 }))
      .filter((x) => now - x.at < 600000)
      .sort((a, b) => b.at - a.at)
      .slice(0, 4)
      .map(({ s, at }) => ({ agent_id: s.agent_id, agent_type: s.agent_type, description: s.description || null, model: s.model || null, at })),
    seats_done: [...d.seats.values()].filter((s) => s.state === 'done').length,
  }));
  // Callsigns: the hook's book (.claude/hooks/callsign.js), read-only here. A
  // released name still labels its desk; it is only not handed out again.
  const book = readCallsigns(officeHome);
  for (const d of deskList) {
    const c = book[d.id];
    if (c && c.name) d.callsign = { name: String(c.name), machine: c.machine || d.machine, seat: c.seat || null };
  }
  for (const d of remote.desks) deskList.push(d);

  // Three desks all called "my-repo" tell you nothing about which one to walk
  // back to. Where a name repeats, add the branch if it distinguishes them, and
  // otherwise a short session id. Unique names are left exactly as they are.
  const byName = new Map();
  for (const d of deskList) byName.set(d.lane, (byName.get(d.lane) || 0) + 1);
  const seen = new Set();
  for (const d of deskList) {
    if (byName.get(d.lane) > 1) {
      // `HEAD` is what a detached worktree reports, so it distinguishes nothing.
      const b = d.branch;
      const branch = b && b !== 'HEAD' && b !== 'main' && b !== 'master' ? b : null;
      d.lane = `${d.lane} · ${branch || String(d.id).slice(0, 6)}`;
    }
    if (seen.has(d.lane)) d.lane = `${d.lane} · ${String(d.id).slice(0, 6)}`;
    seen.add(d.lane);
  }

  // A desk that ended an hour ago is not "who is working". Ended desks are
  // counted, not listed.
  const liveDesks = deskList.filter((d) => d.state !== 'ended');
  const endedCount = deskList.length - liveDesks.length;
  for (const m of machines) {
    m.desks = liveDesks.filter((d) => (d.machine || thisMachine()) === m.name).length;
  }

  const factsWithAge = commsFacts.filter((f) => f.status !== STATUS.NOT_READ);
  const oldest = factsWithAge.length ? Math.max(...factsWithAge.map((f) => now - f.observed_at)) : null;

  return {
    asOf: now,
    config: cfg,
    config_path: cfgPath,
    config_mtime: cfgMtime,
    verdict: { word, count: blocking.length, dark, fact: verdictFact },
    alarms,
    machines,
    desks: liveDesks,
    desks_ended: endedCount,
    comms: commsFacts,
    sources: {
      read: sourcesRead.length,
      total: sourcesRead.length + sourcesFailed.length,
      failed: sourcesFailed,
      // A source with no fact at all drops out of `oldest`, so the count of
      // sources with no fact travels with it.
      no_fact: sourcesFailed.length,
      oldest_fact_age_ms: oldest,
    },
  };
}

module.exports = { read, loadConfig, detectAlarms };
