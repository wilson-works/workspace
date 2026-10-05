'use strict';

/**
 * sources.js — every place the office reads from, and nothing else.
 *
 * PRIVACY BOUNDARY. Transcripts on this machine can hold private text. This
 * module reads transcript METADATA and at most the newest activity line, and it
 * never persists, indexes, logs or transmits transcript text. Nothing here
 * writes to disk.
 *
 *   RENDERED: a session's generated TITLE, a helper's task DESCRIPTION, and the
 *     one-line summary a session writes for a tool call (the `description` of a
 *     Bash/PowerShell/Agent call, a ScheduleWakeup `reason`, a SendMessage
 *     `summary`), plus a comms-bus post's one-line `subject` (never its body).
 *     Short, model-written summaries, so a desk says what it is for.
 *   WITHHELD: all of those for private work (workspace.config.json
 *     `privacy.private_work`), where a summary can carry a client's name.
 *   NEVER READ, anywhere: message bodies, prompts, tool inputs (file paths,
 *     commands, patterns, contents), tool results. A file NAME is not shown,
 *     because the name of a file can be a client's name.
 *   NEVER OPENED: sessions under a `privacy.never_read` folder.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { thisMachine } = require('./geography');
const config = require('./config');
const { fact, notRead, STATUS } = require('./fact');

/**
 * The verb whitelist. "What they are working on" is assembled from enumerable
 * values only — never from tool_input, which holds file bodies and file names.
 * `Read <clients folder>\<name>-tax-return.pdf` is a client's name on a
 * wall-mounted screen, and the basename IS the name.
 */
const VERBS = Object.freeze({
  Read: 'reading', Write: 'editing', Edit: 'editing', NotebookEdit: 'editing',
  Bash: 'running', PowerShell: 'running',
  Glob: 'searching', Grep: 'searching',
  Agent: 'delegating', Task: 'delegating',
  WebFetch: 'fetching', WebSearch: 'searching',
  TodoWrite: 'planning',
});
function verbFor(toolName) {
  if (!toolName) return 'working';
  return VERBS[toolName] || 'working';
}

/**
 * The one-line summary the model itself wrote for a tool call, or null. Reads
 * exactly one named key per tool - never the command, path, pattern or body.
 */
const SUMMARY_KEY = Object.freeze({
  Bash: 'description', PowerShell: 'description', Agent: 'description', Task: 'description',
  ScheduleWakeup: 'reason', SendMessage: 'summary',
});
function summaryFor(toolName, input) {
  const key = SUMMARY_KEY[toolName];
  if (!key || !input || typeof input !== 'object') return null;
  const v = input[key];
  if (typeof v !== 'string' || !v.trim()) return null;
  return v.trim().replace(/\s+/g, ' ').slice(0, 120);
}

const SEAT_LIVE_MS = 120000; // a seat whose transcript has not moved in 2 min is done

const laneId = (cwd) => crypto.createHash('sha1').update(String(cwd)).digest('hex').slice(0, 12);
const laneLabel = (cwd) => (cwd ? path.basename(String(cwd).replace(/[\\/]+$/, '')) : 'unknown');

/* ------------------------------------------------------------------ events */

/**
 * Read the hook event stream. One object per line, written by
 * .claude/hooks/office-hook.js. A malformed line is COUNTED, never skipped
 * silently — a parser that drops what it cannot read is how a wall goes quiet.
 */
// The hook stream only ever grows (8 MB after its first day), and it used to be
// read whole on every frame. Only the newest slice can change who is at a desk
// now; a session whose last event is older than that is read from its
// transcript instead. The parse is reused until the file changes.
const EVENTS_TAIL_BYTES = 3 * 1024 * 1024;
let eventsCache = null;

function readEvents(officeHome) {
  const p = path.join(officeHome, 'events.jsonl');
  const now = Date.now();
  let raw, st;
  try {
    st = fs.statSync(p);
    if (eventsCache && eventsCache.path === p && eventsCache.size === st.size && eventsCache.mtime === st.mtimeMs) {
      return Object.assign({}, eventsCache.out, { read_at: now });
    }
    raw = readSlice(p, true, EVENTS_TAIL_BYTES).text;
  } catch (e) {
    return { ok: false, path: p, reason: `${e.code === 'ENOENT' ? 'no events file yet' : e.message}`, events: [], read_at: now };
  }
  const lines = raw.split(/\r?\n/);
  // A slice that starts mid-file starts mid-line; that fragment is not an event.
  if (st.size > EVENTS_TAIL_BYTES) lines.shift();
  const events = [];
  let malformed = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      o._t = Date.parse(o.received_at) || now;
      events.push(o);
    } catch (_) { malformed += 1; }
  }
  // Time order, not file order: a rotation (events-archive.js) appends the kept
  // tail after whatever the hooks wrote while it ran. The sort is stable, so
  // events stamped in the same millisecond keep the order they were written.
  events.sort((a, b) => a._t - b._t);
  const out = { ok: true, path: p, events, malformed, read_at: now };
  eventsCache = { path: p, size: st.size, mtime: st.mtimeMs, out };
  return out;
}

/**
 * Fold the event stream into desks and seats.
 *
 * Identity, measured (EVENT-SCHEMA §3): session_id is the PARENT's on every
 * line, including subagent lines. So:
 *    desk = session_id      seat = (session_id, agent_id)
 * A PreToolUse WITH agent_id is the seat's activity; WITHOUT, it is the desk's.
 * Ordering is never used to attribute work — hooks on one event run in parallel
 * with non-deterministic order.
 */
function foldDesks(events, now, cfg) {
  const desks = new Map();
  const openToolCalls = new Map(); // tool_use_id -> {session_id, tool_name, at, agent_id}

  const deskOf = (sid) => {
    if (!desks.has(sid)) {
      desks.set(sid, {
        id: sid, cwd: null, machine: thisMachine(), started_at: null, ended_at: null,
        last_event_at: 0, last_tool: null, last_tool_at: 0,
        permission_mode: null, seats: new Map(),
        turn_ended_at: null, reconstructed: false,
      });
    }
    return desks.get(sid);
  };

  for (const e of events) {
    const sid = e.session_id;
    if (!sid) continue;
    const d = deskOf(sid);
    d.last_event_at = Math.max(d.last_event_at, e._t);
    if (e.cwd) d.cwd = e.cwd;
    if (e.permission_mode) d.permission_mode = e.permission_mode;

    switch (e.hook_event_name) {
      case 'SessionStart':
        d.started_at = e._t;
        break;
      case 'SessionEnd':
        d.ended_at = e._t;
        // A seat never outlives its desk.
        for (const s of d.seats.values()) if (s.state === 'running') { s.state = 'done'; s.closed_at = e._t; }
        break;
      case 'SubagentStart':
        if (e.agent_id) {
          d.seats.set(e.agent_id, {
            agent_id: e.agent_id, agent_type: e.agent_type || 'unknown',
            state: 'running', opened_at: e._t, last_at: e._t, reconstructed: false,
          });
        }
        break;
      case 'SubagentStop':
        if (e.agent_id && d.seats.has(e.agent_id)) {
          const s = d.seats.get(e.agent_id);
          s.state = 'done';
          s.closed_at = e._t;
        }
        break;
      case 'UserPromptSubmit':
        d.turn_ended_at = null;
        break;
      case 'Stop':
      case 'StopFailure':
        d.turn_ended_at = e._t;
        break;
      case 'PreToolUse':
        d.turn_ended_at = null;
        if (e.tool_use_id) {
          openToolCalls.set(e.tool_use_id, {
            session_id: sid, tool_name: e.tool_name, at: e._t, agent_id: e.agent_id || null,
          });
        }
        if (e.agent_id && d.seats.has(e.agent_id)) {
          const s = d.seats.get(e.agent_id);
          s.last_at = e._t; s.last_tool = e.tool_name;
        } else if (!e.agent_id) {
          d.last_tool = e.tool_name; d.last_tool_at = e._t;
        }
        break;
      case 'PostToolUse':
      case 'PostToolUseFailure':
        if (e.tool_use_id) openToolCalls.delete(e.tool_use_id);
        break;
      default:
        break;
    }
  }

  // The liveness floor (thresholds.liveness.desk_floor_ms). Independent of
  // every arming event: the only defence against a session that exits on
  // max_turns and never emits Stop.
  const floor = cfg.liveness.desk_floor_ms;
  for (const d of desks.values()) {
    const age = now - d.last_event_at;
    if (d.ended_at) d.state = 'ended';
    else if (age > floor) d.state = 'stale';
    else d.state = 'working';
    d.last_event_age_ms = age;
    d.lane = laneLabel(d.cwd);
    d.lane_id = laneId(d.cwd);
    // Which run a desk belongs to is derived from its working directory, which
    // is a common field on every event — never asked of the model and never
    // guessed from timing. The convention is a worktree named
    // `wt-run-NN-lane-x`; a desk whose cwd does not carry one belongs to no run
    // and lands in the lobby rather than being attached to a plausible one.
    const m = /\brun-(\d+)\b/.exec(String(d.lane));
    d.run = m ? `run-${m[1]}` : null;
    d.open_seats = [...d.seats.values()].filter((s) => s.state === 'running' && !s.reconstructed).length;
  }

  return { desks, openToolCalls };
}

/* ------------------------------------------------- transcripts (metadata) */

/**
 * Reconstruct desks and seats the office was not running to observe.
 *
 * Reads ONLY: directory names, file mtimes, and `<uuid>/subagents/agent-*.meta.json`
 * (which carries {agentType, description, toolUseId, spawnDepth, requestShape,
 * requestNonInteractive} — measured on this box; the docs document no such
 * convention). `description` IS read for display, and withheld for client work.
 *
 * Rows produced here carry reconstructed:true, render grey, and NEVER alarm —
 * an alarm needs an arming event and there was none.
 */
function readReconstructed(projectsDir, sinceMs) {
  const out = [];
  const now = Date.now();
  let slugs;
  try { slugs = fs.readdirSync(projectsDir); } catch (e) {
    return { ok: false, path: projectsDir, reason: e.message, desks: [] };
  }
  for (const slug of slugs) {
    // A `privacy.never_read` folder: its sessions are never read, listed, or indexed.
    if (config.neverRead(slug)) continue;
    const slugDir = path.join(projectsDir, slug);
    let files;
    try { files = fs.readdirSync(slugDir); } catch (_) { continue; }
    for (const f of files) {
      if (!/^[0-9a-f-]{36}\.jsonl$/i.test(f)) continue;
      const jsonl = path.join(slugDir, f);
      let st;
      try { st = fs.statSync(jsonl); } catch (_) { continue; }
      if (sinceMs && st.mtimeMs < sinceMs) continue;
      const uuid = f.replace(/\.jsonl$/i, '');
      const seats = [];
      const subDir = path.join(slugDir, uuid, 'subagents');
      try {
        for (const s of fs.readdirSync(subDir)) {
          if (!/\.meta\.json$/.test(s)) continue;
          let meta = {};
          try { meta = JSON.parse(fs.readFileSync(path.join(subDir, s), 'utf8')); } catch (_) { /* counted below */ }
          const jl = path.join(subDir, s.replace(/\.meta\.json$/, '.jsonl'));
          let sst = null;
          try { sst = fs.statSync(jl); } catch (_) { /* seat with no transcript */ }
          // Running vs done, from the seat's own transcript mtime. Without this
          // every subagent a session ever spawned counts as present and a desk
          // reads "seats=29", which is noise, not a fact about right now.
          const seatAge = sst ? (now - sst.mtimeMs) : Infinity;
          const running = seatAge < SEAT_LIVE_MS;
          // What a running helper is doing right now: its own newest tool name.
          // Only read for running helpers - a finished one is not "now".
          const sm = running && sst ? transcriptMeta(jl, 65536) : null;
          seats.push({
            agent_id: s.replace(/^agent-/, '').replace(/\.meta\.json$/, ''),
            agent_type: meta.agentType || 'unknown',
            // The task the parent gave this helper. Free text, so the reader
            // withholds it for client work (see isClientWork).
            description: typeof meta.description === 'string' ? meta.description.slice(0, 100) : null,
            spawn_depth: meta.spawnDepth != null ? meta.spawnDepth : null,
            state: running ? 'running' : 'done',
            verb: sm && sm.tool ? verbFor(sm.tool) : null,
            tool: sm ? sm.tool : null,
            recent: sm ? sm.recent.slice(0, 3) : [],
            model: sm ? sm.model : null,
            last_at: sst ? sst.mtimeMs : null,
            age_ms: sst ? seatAge : null,
            reconstructed: true,
          });
        }
      } catch (_) { /* no subagents dir */ }
      // One tail read gives the desk a name, a model and a verb. Without it the
      // row renders as its folder slug and reads as noise.
      const meta = transcriptMeta(jsonl);
      const head = transcriptHead(jsonl);
      const cwd = meta.cwd || slug;
      const launch = head.cwd || cwd;
      const lastAt = Math.max(st.mtimeMs, meta.at || 0);
      const client = isClientWork(launch, cwd, meta.code_cwd);
      const redact = (list) => (list || []).map((r) => Object.assign({}, r, { summary: client ? null : r.summary }));

      for (const s of seats) {
        s.recent = redact(s.recent);
        if (client) s.description = null;
      }

      out.push({
        id: uuid,
        slug,
        cwd,
        launch_cwd: launch,
        code_cwd: meta.code_cwd || null,
        // The room is the code tree the session is working in, when there is
        // one; sessions launched from a parent folder would otherwise share it.
        project: projectOf(meta.code_cwd || launch),
        lane: laneLabel(launch),
        title: client ? null : meta.title,
        client_work: client,
        started_at: head.started_at,
        recent: redact(meta.recent),
        machine: thisMachine(),
        model: meta.model || null,
        branch: meta.gitBranch || null,
        last_tool: meta.tool || null,
        waiting: meta.waiting ? Object.assign({}, meta.waiting, { summary: client ? null : meta.waiting.summary }) : null,
        out_tokens: meta.out_tokens,
        last_event_at: lastAt,
        last_event_age_ms: now - lastAt,
        state: 'unknown',        // set by the caller against the liveness floor
        reconstructed: true,
        seats,
        source_path: jsonl,
      });
    }
  }
  return { ok: true, path: projectsDir, desks: out };
}

/**
 * Read the tail of ONE transcript and return METADATA ONLY.
 *
 * This is what makes a desk legible: without it a session renders as its folder
 * slug with no name, no model and no activity, which is what the first version
 * of this wall did and why it was unreadable.
 *
 * What it returns, and why each one is safe to show:
 *   cwd, gitBranch  - present on every line; the working directory is how a
 *                     lane gets its name. Not free text.
 *   model           - an enum-ish id like `claude-opus-5`.
 *   verb / tool     - the NAME of the last tool used (`Read`, `Bash`), passed
 *                     through the fixed whitelist. The tool's INPUT is never
 *                     read - that is where file paths and client names live.
 *   at              - a timestamp.
 *   out_tokens      - a number.
 *
 * There is no branch in this function that returns message text. It reads
 * `content[].type` and `content[].name` and nothing else from a content block.
 */
// Parsed transcript metadata, keyed on path, reused while (mtime, size) are
// unchanged. The server rebuilds a frame every 5 s; re-parsing 18 transcript
// tails every frame is pointless disk work for files that did not move.
const metaCache = new Map();

function readSlice(p, fromEnd, bytes) {
  const st = fs.statSync(p);
  const want = Math.min(st.size, bytes);
  const fd = fs.openSync(p, 'r');
  const buf = Buffer.alloc(want);
  fs.readSync(fd, buf, 0, want, fromEnd ? st.size - want : 0);
  fs.closeSync(fd);
  return { st, text: buf.toString('utf8') };
}

/**
 * The HEAD of a transcript: where the session was launched and when.
 *
 * The cwd on the newest line is wherever the session last `cd`-ed, which is why
 * the first version of this wall named sessions "memory" and "Projects". The
 * FIRST cwd is the project the session was started in, and that does not move.
 */
function transcriptHead(jsonlPath) {
  try {
    const { st, text } = readSlice(jsonlPath, false, 16384);
    let cwd = null, at = null;
    for (const l of text.split(/\r?\n/)) {
      let o; try { o = JSON.parse(l); } catch (_) { continue; }
      if (!at && o.timestamp) at = Date.parse(o.timestamp) || null;
      if (!cwd && o.cwd) cwd = o.cwd;
      if (cwd && at) break;
    }
    return { cwd, started_at: at || st.birthtimeMs || st.ctimeMs };
  } catch (_) {
    return { cwd: null, started_at: null };
  }
}

/**
 * The TAIL of a transcript, as metadata only.
 *
 * Returns, and nothing else:
 *   cwd, gitBranch  - present on every line.
 *   model           - an id like `claude-opus-5`.
 *   tool            - the NAME of the newest tool used. Never its input.
 *   recent          - up to 8 recent tool NAMES with their timestamps. This is
 *                     what the inspector shows as "what they have been doing".
 *   title           - the session's generated title (`ai-title` line). See the
 *                     privacy note in reader.js - it is redacted for client work.
 *   at, out_tokens  - a timestamp and a number.
 *   waiting         - { kind, since } when the session is waiting on something
 *                     it started itself: a background command that has not
 *                     reported back, or a ScheduleWakeup timer. Such a session
 *                     writes nothing until the wait ends, so without this it
 *                     looks idle, and after 20 minutes it looks gone. Read from
 *                     structure only: `toolUseResult.backgroundTaskId` on the
 *                     launch, and the harness's own <task-id> on the finish.
 *
 * There is no branch that returns message text. From a content block it reads
 * `type` and `name`, and never `input` or `text`.
 */
function transcriptMeta(jsonlPath, maxBytes) {
  try {
    const st0 = fs.statSync(jsonlPath);
    const key = jsonlPath;
    const hit = metaCache.get(key);
    if (hit && hit.mtime === st0.mtimeMs && hit.size === st0.size) return hit.out;

    const { st, text } = readSlice(jsonlPath, true, maxBytes || 262144);
    const lines = text.split(/\r?\n/).filter(Boolean);

    const out = {
      ok: false, model: null, cwd: null, gitBranch: null, title: null,
      tool: null, recent: [], at: st.mtimeMs, out_tokens: null, reason: null,
      waiting: null, code_cwd: null,
    };
    // Walking newest to oldest, a finish is always met before its launch.
    const finished = new Set();
    let stoppedLater = false;   // a TaskStop newer than a launch ends that wait too

    for (let i = lines.length - 1; i >= 0; i -= 1) {
      let o;
      try { o = JSON.parse(lines[i]); } catch (_) { continue; }

      if (!out.cwd && o.cwd) out.cwd = o.cwd;
      // The newest directory inside a code tree: where the work actually is,
      // for a session launched from a parent folder that `cd`s into a repo.
      if (!out.code_cwd && o.cwd && repoOf(o.cwd)) out.code_cwd = o.cwd;
      if (!out.gitBranch && o.gitBranch) out.gitBranch = o.gitBranch;
      if (o.type === 'queue-operation' && typeof o.content === 'string') {
        const m = /<task-id>([^<]+)<\/task-id>/.exec(o.content);
        if (m) finished.add(m[1]);
      }
      const bg = o.type === 'user' && o.toolUseResult && o.toolUseResult.backgroundTaskId;
      if (bg && !out.waiting && !stoppedLater && !finished.has(bg)) {
        out.waiting = { kind: 'background', since: Date.parse(o.timestamp) || st.mtimeMs };
      }
      if (!out.title && o.type === 'ai-title' && typeof o.aiTitle === 'string') {
        out.title = o.aiTitle.slice(0, 120);
      }

      if (o.type === 'assistant' && o.message) {
        const m = o.message;
        const t = Date.parse(o.timestamp) || st.mtimeMs;
        if (!out.model && m.model) out.model = m.model;
        if (out.out_tokens === null && m.usage && typeof m.usage.output_tokens === 'number') {
          out.out_tokens = m.usage.output_tokens;
        }
        if (Array.isArray(m.content)) {
          // Tool NAMES, plus the one summary key summaryFor() names. Nothing
          // else from `input`.
          for (let j = m.content.length - 1; j >= 0; j -= 1) {
            const c = m.content[j];
            if (c && c.type === 'tool_use' && typeof c.name === 'string') {
              const summary = summaryFor(c.name, c.input);
              if (!out.tool) {
                out.tool = c.name;
                if (c.name === 'ScheduleWakeup') out.waiting = { kind: 'wakeup', since: t, summary };
              }
              if (c.name === 'TaskStop' || c.name === 'KillShell') stoppedLater = true;
              if (out.recent.length < 8) out.recent.push({ tool: c.name, verb: verbFor(c.name), at: t, summary });
            }
          }
        }
        if (!out.ok) { out.ok = true; out.at = t; }
      }
      if (out.ok && out.cwd && out.model && out.title && out.recent.length >= 8 && (out.waiting || stoppedLater)) break;
    }

    if (!out.ok) out.reason = 'no assistant line in the tail';
    metaCache.set(key, { mtime: st0.mtimeMs, size: st0.size, out });
    return out;
  } catch (e) {
    return { ok: false, reason: e.message, at: 0, recent: [] };
  }
}

/**
 * The repo folder a path sits in: the first folder under one of the configured
 * `code_roots` (workspace.config.json), or null when it is under none.
 */
function repoOf(cwd) {
  if (!cwd) return null;
  const s = String(cwd).replace(/\//g, '\\');
  for (const root of config.codeRoots()) {
    const r = String(root).replace(/\//g, '\\').replace(/\\+$/, '');
    if (s.toLowerCase().startsWith(`${r.toLowerCase()}\\`)) {
      const name = s.slice(r.length + 1).split('\\')[0];
      if (name) return name;
    }
  }
  return null;
}

/**
 * Which project a session belongs to: the room it sits in. A session inside a
 * code root sits in that repo's room; anything else in the room named for its
 * own folder.
 */
function projectOf(cwd) {
  if (!cwd) return 'unknown';
  return repoOf(cwd) || path.basename(String(cwd).replace(/[\\/]+$/, '')) || 'unknown';
}

/**
 * Private work: a session whose launch or current folder matches
 * workspace.config.json `privacy.private_work`. Its generated title can carry a
 * client's name, so the title and its helpers' descriptions are withheld.
 */
function isClientWork(...cwds) {
  return config.isPrivate(...cwds);
}

/* --------------------------------------------------------------- comms DB */

/**
 * Open a comms DB READ-ONLY, by explicit absolute path.
 *
 * The failure this guards (packet, and observed on this box): the DB resolves
 * from CWD, so a reader started in the wrong directory opens an EMPTY PRIVATE
 * DB and reports "quiet". That is why every path here is absolute and why an
 * empty result is STATUS.EMPTY and never STATUS.OK.
 *
 * Implemented over `node:sqlite` where available; when it is not, the source
 * reports NOT READ with the reason rather than reporting silence.
 */
function readComms(dbPath, sinceIso) {
  const now = Date.now();
  if (!path.isAbsolute(dbPath)) {
    return { ok: false, path: dbPath, reason: 'refusing a relative comms DB path — this is the wrong-CWD defect', read_at: now };
  }
  if (!fs.existsSync(dbPath)) {
    return { ok: false, path: dbPath, reason: 'no such comms DB', read_at: now };
  }
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch (e) {
    return { ok: false, path: dbPath, reason: 'node:sqlite unavailable in this runtime', read_at: now };
  }
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db.prepare(
      `SELECT id, channel, from_agent, to_agent, subject, work_order, posted_at
         FROM messages
        WHERE posted_at >= ?
        ORDER BY id DESC
        LIMIT 200`
    ).all(sinceIso || '1970-01-01');
    const claims = db.prepare(
      `SELECT path, agent, work_order, claimed_at FROM claims WHERE status = 'active' LIMIT 200`
    ).all();
    db.close();
    // `subject` is a short header written on the org's bus and is matched for
    // the literal token BLOCKED only — the body is never read.
    const blocked = rows.filter((r) => /\bBLOCKED\b/.test(String(r.subject || '')));
    return {
      ok: true, path: dbPath, read_at: now,
      message_count: rows.length,
      blocked: blocked.map((r) => ({
        id: r.id, channel: r.channel, from_agent: r.from_agent,
        work_order: r.work_order, posted_at: r.posted_at,
      })),
      claims: claims.map((c) => ({ path: c.path, agent: c.agent, claimed_at: c.claimed_at })),
      empty: rows.length === 0,
    };
  } catch (e) {
    try { if (db) db.close(); } catch (_) {}
    return { ok: false, path: dbPath, reason: `sqlite: ${e.message}`, read_at: now };
  }
}

/**
 * Every comms bus that has moved recently: one per repo (the DB resolves from
 * the repo a lane works in), plus any extra paths given. One directory level
 * under each code root - never a crawl. Private repos are skipped outright.
 */
function findCommsDbs(zoneDirs, extra, maxAgeMs, now) {
  const found = new Set();
  const consider = (p) => {
    if (isClientWork(p) || found.has(p)) return;
    try { if (now - fs.statSync(p).mtimeMs <= maxAgeMs) found.add(p); } catch (_) { /* no bus here */ }
  };
  for (const z of zoneDirs || []) {
    let names = [];
    try { names = fs.readdirSync(z); } catch (_) { continue; }
    for (const n of names) consider(path.join(z, n, '.claude', 'comms.db'));
  }
  for (const p of extra || []) consider(p);
  return [...found];
}

/**
 * Who said what to whom on the buses, since `sinceIso`: channel, sender,
 * recipient, the one-line subject and the time. The body is never selected.
 */
function readFlows(dbPaths, sinceIso) {
  let DatabaseSync;
  try { ({ DatabaseSync } = require('node:sqlite')); } catch (_) { return []; }
  const out = [];
  for (const p of dbPaths) {
    let db;
    try {
      db = new DatabaseSync(p, { readOnly: true });
      const rows = db.prepare(
        `SELECT id, channel, from_agent, to_agent, subject, posted_at
           FROM messages WHERE posted_at >= ? ORDER BY id DESC LIMIT 60`
      ).all(sinceIso);
      for (const r of rows) {
        out.push({
          id: `${laneId(p)}:${r.id}`,
          channel: r.channel, from: r.from_agent, to: r.to_agent || null,
          subject: String(r.subject || '').replace(/\s+/g, ' ').slice(0, 120),
          at: Date.parse(r.posted_at) || null,
          repo: projectOf(path.dirname(path.dirname(p))),
        });
      }
    } catch (_) { /* an unreadable bus contributes nothing */ }
    try { if (db) db.close(); } catch (_) {}
  }
  return out.sort((a, b) => (b.at || 0) - (a.at || 0));
}

module.exports = {
  VERBS, verbFor, summaryFor, laneId, laneLabel,
  readEvents, foldDesks, readReconstructed, transcriptMeta, transcriptHead, projectOf, isClientWork,
  readComms, findCommsDbs, readFlows, repoOf,
};
