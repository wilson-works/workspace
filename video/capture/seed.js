#!/usr/bin/env node
'use strict';

/**
 * seed.js — fill the three installed sandbox computers with an invented working day, for filming.
 *
 *   node capture/seed.js [--sandboxes <dir>] [--ids v4,v5,v6] [--only DESK|MINI|LAPTOP]
 *
 * Contract:
 *   The computers are installed first (capture/install.js); their office settings are the
 *   installer's, and this never writes them. For each computer it writes, inside its sandbox only:
 *     - invented Claude Code transcript METADATA under its fake CLAUDE_CONFIG_DIR/projects
 *       (a generated title, tool names with their one-line summaries, a model id, folders and
 *       branches) in the shapes src/server/sources.js reads;
 *     - in its office's files (<home>/AppData/Local/WorkSpace): the hook event stream, the callsign
 *       book, an owner question or two, a delivered note and course progress, in the shapes
 *       .claude/hooks/office-hook.js, callsign.js, questions.js, inbox.js and work.js write.
 *   It replaces only what it wrote before (those files, and the Claude folder's projects/).
 *   Timestamps are "now", so run it right before a capture: a desk is "working" for two minutes.
 *   Exit 0 seeded, 1 failed.
 *
 * Every name, folder, branch and line here is invented. The folders a session "works in" are
 * written as the person Alex would see them (C:\Users\alex\Hub\..., /Users/alex/Hub/...); they are
 * strings in the metadata, never real folders, and the sandbox's own path never appears in them.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WORLD, RIG, baseFrom, idsFrom, sandboxes } = require('./sandbox');

const MIN = 60 * 1000;

/* ---------------------------------------------------------------- the day */

const OPUS = 'claude-opus-5';
const SONNET = 'claude-sonnet-5';

// Where each session works, as Alex sees it on that computer.
function where(computer, rel) {
  const sep = computer.os === 'macOS' ? '/' : '\\';
  return [computer.hub_root].concat(rel.split('/')).join(sep);
}
const code = (computer, repo) => where(computer, `${computer.code_zone}/${repo}`);

/**
 * The sessions on each computer. state: working (moved seconds ago), waiting (on a timer it set),
 * idle (its turn ended a few minutes ago). tools: oldest first; the newest is what the desk says now.
 */
function dayOf(computer) {
  const c = computer;
  if (c.name === 'DESK') {
    return [
      {
        callsign: 'Cedar', cwd: code(c, 'garden-planner'), branch: 'main', model: OPUS, state: 'working',
        title: 'Plan the frost dates feature',
        tools: [['Read'], ['Agent', 'Check what the calendar already stores'], ['Bash', 'Write the work order for frost dates']],
        helpers: [{ type: 'Explore', description: 'Check what the calendar already stores', tool: 'Grep' }],
        note: { text: "Keep last year's dates as a fallback, please.", delivered: true },
      },
      {
        callsign: 'Alder', cwd: code(c, 'garden-planner'), branch: 'main', model: OPUS, state: 'working',
        title: 'Gate review: frost dates',
        tools: [['Read'], ['Bash', "Fetch MINI's frost dates branch"], ['Bash', 'Run the tests on the builder branch']],
        helpers: [],
      },
      {
        callsign: 'Aspen', cwd: code(c, 'bakery-site'), branch: 'main', model: SONNET, state: 'working',
        title: 'Build the menu page',
        tools: [['Edit'], ['Bash', 'Start the preview server'], ['Edit']],
        helpers: [],
        question: {
          q: 'Should the menu page show prices, or only the dishes for now?',
          r: 'Only the dishes for now. Prices can come later.',
        },
      },
      {
        callsign: 'Rowan', cwd: where(c, '50-AI/agents/iris'), branch: null, model: OPUS, state: 'working',
        title: 'Iris: research brief on raised-bed soil',
        tools: [['WebSearch'], ['Agent', 'Compare three soil guides'], ['WebFetch']],
        helpers: [{ type: 'general-purpose', description: 'Compare three soil guides', tool: 'WebFetch' }],
        question: {
          q: 'Two good guides disagree on how much compost to mix in. Should the brief show both?',
          r: 'Show both, with one line on why they differ.',
        },
      },
      {
        callsign: 'Birch', cwd: where(c, '50-AI/agents/quill'), branch: null, model: SONNET, state: 'waiting',
        title: 'Quill: draft the spring newsletter',
        tools: [['Write'], ['ScheduleWakeup', 'Check back after Alex reviews the outline']],
        helpers: [],
      },
      {
        callsign: 'Maple', cwd: c.hub_root, branch: null, model: SONNET, state: 'idle',
        title: 'Sort the inbox into zones',
        tools: [['Bash', 'List what is waiting in the inbox'], ['Bash', 'Rebuild the NAV map']],
        helpers: [],
      },
    ];
  }
  if (c.name === 'MINI') {
    return [
      {
        callsign: 'Vega', cwd: code(c, 'garden-planner'), branch: 'gp-04-frost-dates', model: OPUS, state: 'working',
        title: 'Build GP-04 frost dates',
        tools: [['Edit'], ['Agent', 'Write tests for the frost date lookup'], ['Bash', 'Run the calendar tests']],
        helpers: [{ type: 'general-purpose', description: 'Write tests for the frost date lookup', tool: 'Write' }],
      },
      {
        callsign: 'Lyra', cwd: code(c, 'bakery-site'), branch: 'bs-02-menu-photos', model: SONNET, state: 'working',
        title: 'Build BS-02 menu photos',
        tools: [['Read'], ['Edit'], ['Bash', 'Resize the menu photos for phones']],
        helpers: [],
      },
    ];
  }
  return [
    {
      callsign: 'Hudson', cwd: code(c, 'bakery-site'), branch: 'bs-03-about-page', model: SONNET, state: 'working',
      title: 'Draft the About page',
      tools: [['Read'], ['Edit'], ['Bash', 'Push the About page branch']],
      helpers: [],
    },
  ];
}

/* ----------------------------------------------------------- the shapes */

/** A stable id from a name, in the uuid shape Claude Code uses. */
function uuidOf(seed) {
  const h = crypto.createHash('sha1').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const agentIdOf = (seed) => crypto.createHash('sha1').update(seed).digest('hex').slice(0, 17);
const toolIdOf = (seed) => `toolu_${crypto.createHash('sha1').update(seed).digest('hex').slice(0, 24)}`;

/** Claude Code's folder name for a working folder. */
function slugOf(cwd) { return String(cwd).replace(/[^A-Za-z0-9]/g, '-'); }

const SUMMARY_KEY = { Bash: 'description', PowerShell: 'description', Agent: 'description', ScheduleWakeup: 'reason' };

/** The last moment a session moved, by its state. */
function lastAt(s, now) {
  if (s.state === 'working') return now - 4000;
  if (s.state === 'waiting') return now - 3.5 * MIN;
  return now - 3 * MIN;
}

/** Tool times, oldest first, ending at the session's last moment. */
function toolTimes(s, now) {
  const end = lastAt(s, now);
  return s.tools.map((_, i) => end - (s.tools.length - 1 - i) * 35000);
}

function writeTranscript(sb, s, now) {
  const dir = path.join(sb.claude, 'projects', slugOf(s.cwd));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${s.id}.jsonl`);
  const times = toolTimes(s, now);
  const start = times[0] - 6 * MIN;
  const base = { sessionId: s.id, cwd: s.cwd, gitBranch: s.branch || undefined, version: '2.1.0' };
  const lines = [];
  lines.push(Object.assign({ type: 'user', uuid: uuidOf(`${s.id}:u0`), timestamp: new Date(start).toISOString() }, base,
    { message: { role: 'user', content: 'Demo session for the WorkSpace walkthrough.' } }));
  lines.push({ type: 'ai-title', sessionId: s.id, aiTitle: s.title });
  s.tools.forEach(([name, summary], i) => {
    const input = {};
    if (summary && SUMMARY_KEY[name]) input[SUMMARY_KEY[name]] = summary;
    lines.push(Object.assign({ type: 'assistant', uuid: uuidOf(`${s.id}:a${i}`), timestamp: new Date(times[i]).toISOString() }, base, {
      message: {
        role: 'assistant', model: s.model,
        content: [{ type: 'tool_use', id: toolIdOf(`${s.id}:${i}`), name, input }],
        usage: { input_tokens: 1200, output_tokens: 180 + i * 40 },
      },
    }));
  });
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8');
  const mt = new Date(lastAt(s, now));
  fs.utimesSync(file, mt, mt);

  // Its helpers: the meta file Claude Code writes beside each subagent's own transcript.
  for (const h of s.helpers) {
    const sub = path.join(dir, s.id, 'subagents');
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, `agent-${h.id}.meta.json`), JSON.stringify({ agentType: h.type, description: h.description }), 'utf8');
    const line = {
      type: 'assistant', timestamp: new Date(now - 6000).toISOString(), sessionId: s.id, cwd: s.cwd,
      message: { role: 'assistant', model: s.model, content: [{ type: 'tool_use', id: toolIdOf(`${h.id}:0`), name: h.tool, input: {} }] },
    };
    fs.writeFileSync(path.join(sub, `agent-${h.id}.jsonl`), JSON.stringify(line) + '\n', 'utf8');
  }
  return file;
}

/** The hook stream for one session, in office-hook.js's shape (the allow-listed fields only). */
function eventsOf(s, transcript, now) {
  const times = toolTimes(s, now);
  const start = times[0] - 6 * MIN;
  const common = { session_id: s.id, cwd: s.cwd, transcript_path: transcript, permission_mode: 'default' };
  const ev = (at, name, extra) => Object.assign({ received_at: new Date(at).toISOString(), hook_event_name: name }, common, extra || {});
  const out = [ev(start, 'SessionStart', { source: 'startup' }), ev(start + 2000, 'UserPromptSubmit')];
  s.tools.forEach(([name], i) => {
    const id = toolIdOf(`${s.id}:${i}`);
    out.push(ev(times[i] - 900, 'PreToolUse', { tool_name: name, tool_use_id: id }));
    out.push(ev(times[i], 'PostToolUse', { tool_name: name, tool_use_id: id }));
  });
  for (const h of s.helpers) {
    out.push(ev(times[0] + 1000, 'SubagentStart', { agent_id: h.id, agent_type: h.type }));
    out.push(ev(now - 6500, 'PreToolUse', { agent_id: h.id, agent_type: h.type, tool_name: h.tool, tool_use_id: toolIdOf(`${h.id}:pre`) }));
    out.push(ev(now - 6000, 'PostToolUse', { agent_id: h.id, agent_type: h.type, tool_name: h.tool, tool_use_id: toolIdOf(`${h.id}:pre`) }));
  }
  if (s.state !== 'working') out.push(ev(lastAt(s, now) + 500, 'Stop', { stop_hook_active: false }));
  return out;
}

/* ----------------------------------------------------------------- seed */

function rm(p) { fs.rmSync(p, { recursive: true, force: true }); }

function seedOne(sb, now) {
  if (!fs.existsSync(sb.config)) return { ok: false, error: `${sb.name} is not installed yet (no ${sb.config}). Run capture/install.js first.` };
  for (const d of [sb.claude, sb.office]) fs.mkdirSync(d, { recursive: true });
  // What this script owns in the office home and the Claude folder; the office's own state stays.
  rm(path.join(sb.claude, 'projects'));
  for (const f of ['events.jsonl', 'callsigns.json']) rm(path.join(sb.office, f));
  for (const d of ['questions', 'inbox', 'work']) rm(path.join(sb.office, d));

  const Q = require(path.join(RIG, 'src', 'server', 'questions'));
  const inbox = require(path.join(RIG, 'src', 'server', 'inbox'));

  const sessions = dayOf(sb.computer).map((s) => Object.assign({}, s, {
    id: uuidOf(`${sb.name}:${s.callsign}`),
    helpers: s.helpers.map((h) => Object.assign({}, h, { id: agentIdOf(`${sb.name}:${s.callsign}:${h.description}`) })),
  }));
  const events = [];
  const book = {};
  for (const s of sessions) {
    const transcript = writeTranscript(sb, s, now);
    events.push(...eventsOf(s, transcript, now));
    book[s.id] = { name: s.callsign, machine: sb.name, seat: null, at: new Date(now - 20 * MIN).toISOString(), transcript };
    if (s.question) {
      const r = Q.ask(sb.office, s.id, s.question.q, s.question.r, now - 2 * MIN);
      if (!r.ok) return { ok: false, error: `question for ${s.callsign} refused: ${r.error}` };
    }
    if (s.note) {
      const r = inbox.enqueue(sb.office, s.id, s.note.text, 'owner');
      if (!r.ok) return { ok: false, error: `note for ${s.callsign} refused: ${r.error}` };
      if (s.note.delivered) {
        // What the delivery hook does when the session next uses a tool: move it to delivered/.
        fs.rmSync(path.join(inbox.inboxDir(sb.office), `${s.id}.jsonl`), { force: true });
        fs.mkdirSync(inbox.deliveredDir(sb.office), { recursive: true });
        fs.appendFileSync(path.join(inbox.deliveredDir(sb.office), `${s.id}.jsonl`),
          JSON.stringify({ id: r.id, delivered_at: now - 60000 }) + '\n', 'utf8');
      }
    }
  }
  events.sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at));
  fs.writeFileSync(path.join(sb.office, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(sb.office, 'callsigns.json'), JSON.stringify(book, null, 2), 'utf8');

  if (sb.computer.hub) {
    // The course, part way through: three lessons done, the fourth under way.
    const progress = { 'getting-started': {} };
    ['GS-01', 'GS-02', 'GS-03'].forEach((id, i) => { progress['getting-started'][id] = { status: 'done', at: now - (3 - i) * 86400000 }; });
    progress['getting-started']['GS-04'] = { status: 'doing', at: now - 3600000 };
    fs.mkdirSync(path.join(sb.office, 'work'), { recursive: true });
    fs.writeFileSync(path.join(sb.office, 'work', 'progress.json'), JSON.stringify(progress, null, 2), 'utf8');
  }
  return { ok: true, sessions: sessions.map((s) => ({ id: s.id, callsign: s.callsign, title: s.title, state: s.state })) };
}

function seed(base, only, ids) {
  const now = Date.now();
  const out = {};
  for (const sb of sandboxes(base, ids)) {
    if (only && sb.name !== only) continue;
    const r = seedOne(sb, now);
    if (!r.ok) return { ok: false, error: r.error };
    out[sb.name] = r;
  }
  return { ok: true, at: now, computers: out };
}

module.exports = { seed, uuidOf, slugOf };

if (require.main === module) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--only');
  const only = i >= 0 ? String(args[i + 1] || '').toUpperCase() : null;
  try {
    const r = seed(baseFrom(args), only, idsFrom(args));
    if (!r.ok) {
      process.stdout.write(`NOT SEEDED: ${r.error}\n`);
      process.exit(1);
    }
    for (const [name, c] of Object.entries(r.computers)) {
      process.stdout.write(`seeded ${name}: ${c.sessions.length} session(s) (${c.sessions.map((s) => `${s.callsign} ${s.state}`).join(', ')})\n`);
    }
  } catch (e) {
    process.stdout.write(`NOT SEEDED: ${e.message}\n`);
    process.exit(1);
  }
}
