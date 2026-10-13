'use strict';

/**
 * dispatch.js - sessions the office starts itself, and the work they hand down to each other.
 *
 * Claude Code runs headless (-p) with its stream in JSON, started detached so nothing the office holds is inherited,
 * one process per turn, the same session resumed for the next. Who asks: the owner from the office page (New session),
 * or one session handing a piece of its work to another (bin/office-spawn.js). Nobody has to open VS Code or a
 * terminal: the office page, often on a phone, is the whole cockpit.
 *
 *   A job       <home>/dispatch/jobs/<id>.json       who, which model and effort, what hands, its status and last turn
 *               <id>.brief.txt                        what it was asked (the owner's words, or its lead's)
 *               <id>.system.md                        what it is told about working from the office (systemPrompt)
 *               <id>.turn.json                        the turn lock: the runner's pid while a turn runs
 *   A turn      bin/office-turn.js <id>: claims the notes waiting for the session, runs one Claude Code turn on them
 *               (the brief, the first time), records what came of it, and hands a helper's report up to its lead.
 *   The tick    every frame (server.js broadcast): a session with notes waiting and no turn running gets one, so a note
 *               from the office, an answer to its question or a helper's report starts its next turn within seconds.
 *
 * Every session starts in the Hub (hub/lib/root.js), or your home folder when the office runs without one, so the
 * Hub's CLAUDE.md and rules are its own, and the office's hooks put it on the floor like any chat. A project is reached
 * with --add-dir. Nothing a request says becomes part of a command line: the choices are checked against
 * config/dispatch.json, the brief travels on the process's stdin.
 *
 * What the page shows of a session the office started (the owner's own conversation through the office): the brief
 * and each turn's final reply, read from its transcript on request, and never for private work
 * (workspace.config.json privacy.private_work). Every other session keeps the privacy rule as it was: steps and names only.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { startDetached } = require('../../bin/detach');
const geo = require('./geography');
const config = require('./config');
const S = require('./sources');
const inbox = require('./inbox');
const { homeDir, ownerClaudeHome } = require('./home');

const CONFIG = path.join(__dirname, '..', '..', 'config', 'dispatch.json');
const TURN = path.join(__dirname, '..', '..', 'bin', 'office-turn.js');
const OFFICE_DIR = path.join(__dirname, '..', '..');

const ID_RE = /^d[0-9a-z]{6,24}$/;
const SESSION_RE = /^[0-9a-f-]{36}$/i;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 .'-]{0,39}$/;
const AGENT_RE = /^[a-z][a-z0-9-]{0,60}$/;
// A runner may take a moment to write its lock; until then a job that says it is starting is not a dead turn.
const START_GRACE_MS = 45 * 1000;

/* ------------------------------------------------------------------ config */

let cfgCache = { at: null, file: null, cfg: null };
function loadConfig(file) {
  const f = file || CONFIG;
  try {
    const at = fs.statSync(f).mtimeMs;
    if (cfgCache.file !== f || cfgCache.at !== at) cfgCache = { at, file: f, cfg: JSON.parse(fs.readFileSync(f, 'utf8')) };
  } catch (e) {
    throw new Error(`config/dispatch.json could not be read: ${e.message}`);
  }
  return cfgCache.cfg;
}

function dirs(home) {
  const root = path.join(home, 'dispatch');
  return { root, jobs: path.join(root, 'jobs'), logs: path.join(root, 'logs') };
}

const file = (home, id, ext) => path.join(dirs(home).jobs, `${id}${ext}`);

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } }
function writeAtomic(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.${Math.random().toString(36).slice(2, 6)}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, p);
}

function readJob(home, id) {
  if (!ID_RE.test(String(id || ''))) return null;
  const j = readJson(file(home, id, '.json'));
  return j && j.id === id ? j : null;
}
function writeJob(home, job) { writeAtomic(file(home, job.id, '.json'), `${JSON.stringify(job, null, 2)}\n`); return job; }
/** Read, merge, write in one go: the runner owns a turn's fields, the office owns Stop, Close and Reopen. */
function updateJob(home, id, patch) {
  const j = readJob(home, id);
  if (!j) return null;
  const next = typeof patch === 'function' ? patch(j) : Object.assign(j, patch);
  return writeJob(home, next || j);
}
function listJobs(home) {
  let names = [];
  try { names = fs.readdirSync(dirs(home).jobs).filter((n) => /^d[0-9a-z]+\.json$/.test(n)); } catch (_) { return []; }
  return names.map((n) => readJob(home, n.slice(0, -5))).filter(Boolean).sort((a, b) => a.created_at - b.created_at);
}
function readBrief(home, id) { try { return fs.readFileSync(file(home, id, '.brief.txt'), 'utf8'); } catch (_) { return ''; } }

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** The turn lock, if a live runner holds it: { pid, started_at, n }. */
function turnLock(home, id) {
  const l = readJson(file(home, id, '.turn.json'));
  return l && alive(l.pid) ? l : null;
}

/* ------------------------------------------------------- who, where, what */

/** Where a session the office starts works: the Hub, else the home folder of the person whose office this is. */
function workRoot(ctx) {
  return (ctx && ctx.hubRoot) || config.hubRoot() || os.homedir();
}

/** A person's name and job from an agent file's description: "Gavin - Frontend Lead. Owns ..." -> Gavin, Frontend Lead. */
function personOf(name, description) {
  const d = String(description || '').replace(/^["']|["']$/g, '');
  const m = /^([A-Z][\w'’]*(?:\s+'[^']+')?(?:\s+[A-Z][\w'’]*)?)\s+[-–—]\s+([^.]{2,60})/.exec(d);
  if (m) {
    const full = m[1].replace(/\s+'[^']+'/, '').trim();
    let role = m[2].split(/[,;(]/)[0].trim();
    if (role.length > 44) role = role.slice(0, 44).replace(/\s+\S*$/, '');
    return { person: full.split(/\s+/)[0], full, role };
  }
  const last = String(name).split('-').pop();
  const person = last.charAt(0).toUpperCase() + last.slice(1);
  return { person, full: person, role: null };
}

let peopleCache = { dir: null, at: null, list: [] };
/** The org's agents (~/.claude/agents/*.md): who the owner can put in a session's chair. Names only, never a prompt. */
function people(agentsDir) {
  const dir = agentsDir || path.join(ownerClaudeHome(), 'agents');
  let at = null;
  try { at = fs.statSync(dir).mtimeMs; } catch (_) { return []; }
  if (peopleCache.dir === dir && peopleCache.at === at) return peopleCache.list;
  const list = [];
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => /\.md$/i.test(n)); } catch (_) { names = []; }
  for (const n of names) {
    let head = '';
    try {
      const fd = fs.openSync(path.join(dir, n), 'r');
      const buf = Buffer.alloc(4096);
      const len = fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      head = buf.slice(0, len).toString('utf8').replace(/^﻿/, '');
    } catch (_) { continue; }
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(head);
    if (!fm) continue;
    const key = ((/^name:\s*(.+)$/m.exec(fm[1]) || [])[1] || '').trim().replace(/^["']|["']$/g, '');
    if (!AGENT_RE.test(key) || key === 'claude') continue;
    const desc = ((/^description:\s*(.+)$/m.exec(fm[1]) || [])[1] || '').trim();
    const p = personOf(key, desc);
    list.push({ key, person: p.person, full: p.full || p.person, role: p.role });
  }
  list.sort((a, b) => a.person.localeCompare(b.person) || a.key.localeCompare(b.key));
  peopleCache = { dir, at, list };
  return list;
}

/** Private work by the floor's own rule (workspace.config.json privacy.private_work): the project's folder or its name. */
function isClientPlace(name, dir) {
  return S.isClientWork(dir || '', String(name || ''));
}

// A worktree, a rig or a run's lane clone is not a place to start new work: it belongs to its run.
const NOT_A_PLACE = /\$|-run-\d+|-lane-|lane-[a-z]\d|^[_.]|\.json$/i;
let placesCache = { at: 0, list: [] };
/** Where a session can be pointed: the Hub itself, or a repo in one of this computer's code roots. */
function places(hubRoot, roots) {
  const now = Date.now();
  const codeRoots = roots || config.codeRoots();
  const key = `${hubRoot}|${codeRoots.join('|')}`;
  if (now - placesCache.at < 60000 && placesCache.key === key) return placesCache.list;
  const list = [{ key: 'hub', label: hubRoot ? 'The Hub' : 'Home folder', dir: hubRoot || null, client: false }];
  for (const z of codeRoots) {
    let names = [];
    try { names = fs.readdirSync(z, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch (_) { continue; }
    for (const n of names) {
      if (NOT_A_PLACE.test(n) || list.some((p) => p.key === n)) continue;
      const dir = path.join(z, n);
      list.push({ key: n, label: n.replace(/[_-]+/g, ' '), dir, client: isClientPlace(n, dir) });
    }
  }
  list.sort((a, b) => (a.key === 'hub' ? -1 : b.key === 'hub' ? 1 : a.label.localeCompare(b.label)));
  placesCache = { at: now, key, list };
  return list;
}

/** Turns running on this computer now. */
function runningCount(home, jobs) {
  return (jobs || listJobs(home)).filter((j) => turnLock(home, j.id)).length;
}

/** What the page's New session sheet offers. */
function options(home, ctx) {
  const c = loadConfig(ctx && ctx.config);
  const hubRoot = (ctx && ctx.hubRoot) || config.hubRoot();
  return {
    models: c.models.map((m) => ({ key: m.key, label: m.label, hint: m.hint || null })),
    efforts: c.efforts,
    hands: c.hands.map((h) => ({ key: h.key, label: h.label, hint: h.hint || null })),
    caps_min: c.caps_min,
    defaults: c.defaults,
    helper_defaults: c.helper_defaults,
    presets: (c.presets || []).filter((p) => modelEntry(c, p.model) && c.efforts.includes(p.effort) && handsEntry(c, p.hands) && c.caps_min.includes(p.cap_min)),
    people: people(ctx && ctx.agentsDir),
    places: places(hubRoot, ctx && ctx.codeRoots).map((p) => ({ key: p.key, label: p.label, client: p.client })),
    limits: { max_running: c.limits.max_running, brief_max_chars: c.limits.brief_max_chars },
    running: runningCount(home),
    claude: !!findClaude(),
  };
}

/* -------------------------------------------------------------- Claude Code */

/**
 * Claude Code: WORKSPACE_CLAUDE_EXE; else the newest the VS Code extension carries (it updates itself, and an npm
 * install on the PATH can lag behind the newest models); else claude (claude.exe on Windows) on the PATH or in
 * ~/.local/bin, where the native installer puts it.
 */
function findClaude() {
  const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch (_) { return false; } };
  const forced = process.env.WORKSPACE_CLAUDE_EXE;
  if (forced) return isFile(forced) ? forced : null;
  const exeName = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const root = path.join(os.homedir(), '.vscode', 'extensions');
  let names = [];
  try { names = fs.readdirSync(root).filter((n) => /^anthropic\.claude-code-\d+\.\d+\.\d+/.test(n)); } catch (_) { names = []; }
  const ver = (n) => /(\d+)\.(\d+)\.(\d+)/.exec(n).slice(1).map(Number);
  names.sort((a, b) => { const x = ver(a); const y = ver(b); return (y[0] - x[0]) || (y[1] - x[1]) || (y[2] - x[2]); });
  for (const n of names) {
    const exe = path.join(root, n, 'resources', 'native-binary', exeName);
    if (isFile(exe)) return exe;
  }
  const dirsOnPath = String(process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean);
  dirsOnPath.push(path.join(os.homedir(), '.local', 'bin'));
  for (const d of dirsOnPath) {
    const exe = path.join(d.replace(/^"|"$/g, ''), exeName);
    if (isFile(exe)) return exe;
  }
  return null;
}

// What a Claude Code chat puts in the environment of everything it starts: a session the office starts is its own
// session, never a child of the chat that asked for it.
const SESSION_VAR = /^(CLAUDECODE|CLAUDE_.+|MCP_CONNECTION_NONBLOCKING)$/i;
function sessionFreeEnv(env, home) {
  const out = {};
  for (const [k, v] of Object.entries(env || process.env)) {
    // CLAUDE_CONFIG_DIR says which Claude Code account and folder this is: it stays.
    if (SESSION_VAR.test(k) && k !== 'CLAUDE_CONFIG_DIR') continue;
    out[k] = v;
  }
  out.WORKSPACE_HOME = home;
  return out;
}

/* ------------------------------------------------------------------- words */

/** A time as the person reads it, on this computer's own clock: 14:05. */
const clock = (t) => new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t));

/** A short name from the brief's first words: "Fix the floor packing on phones" -> "Fix floor packing". */
function nameFromBrief(brief) {
  const stop = new Set(['the', 'a', 'an', 'to', 'of', 'and', 'on', 'in', 'for', 'with', 'please', 'can', 'you', 'we', 'i', 'our', 'my', 'that', 'this', 'it', 'is', 'be']);
  const words = String(brief || '').replace(/[^A-Za-z\s]/g, ' ').split(/\s+/).filter((w) => w && !stop.has(w.toLowerCase())).slice(0, 3);
  if (!words.length) return 'New session';
  const s = words.join(' ').slice(0, 40);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function modelEntry(c, key) { return c.models.find((m) => m.key === key) || null; }
function handsEntry(c, key) { return c.hands.find((h) => h.key === key) || null; }

/** Who the sessions call the person whose office this is (workspace.config.json owner.name), or "the owner". */
function ownerWord() {
  try { return config.ownerName() || 'the owner'; } catch (_) { return 'the owner'; }
}

/** What a session the office started is told about working from it (appended to Claude Code's own system prompt). */
function systemPrompt(job, ctx) {
  const office = (ctx && ctx.officeDir) || OFFICE_DIR;
  const fwd = (p) => String(p).replace(/\\/g, '/');
  const spawn = `node "${fwd(path.join(office, 'bin', 'office-spawn.js'))}"`;
  const ask = `node "${fwd(path.join(office, 'bin', 'ask-owner.js'))}"`;
  const owner = ownerWord();
  const Owner = owner.charAt(0).toUpperCase() + owner.slice(1);
  let brandName = 'WorkSpace';
  try { brandName = config.brand().name || brandName; } catch (_) { /* the default */ }
  const lines = [
    `You are ${job.name}, a session the ${brandName} office started headless on ${job.machine}. Nobody watches this session at a keyboard: ${owner} works from the office page, often on a phone.`,
    job.parent
      ? `Your lead is ${job.parent.name}. They handed you this piece of their work. Your final message of each turn goes to them as an office note, so make it the report they need: what you did, what you found, what is left.`
      : `${Owner} started you from the office. Your final message of each turn is what they read there: lead with the outcome in plain English, then what is left. Keep it short unless they ask for detail.`,
    `Your working folder is ${job.work_root ? fwd(job.work_root) : 'the Hub'}${job.place_dir ? `; your project is ${fwd(job.place_dir)}. Reach it with cd inside each command` : ''}. Its CLAUDE.md and rules are your standing orders.`,
    `How the office reaches you: a note from ${owner}, an answer to your question, or a report from a helper starts your next turn as its prompt.`,
    `To hand a self-contained piece of work to a helper session: ${spawn} "<what to do, with everything they need>" --name "<short name>" [--model opus|sonnet|haiku|fable] [--effort low|medium|high|xhigh|max] (unnamed: Opus on medium). A helper never runs above your own effort, and Fable helpers run on low only. It runs on its own and its report arrives as a note that starts your next turn. Hand down only work that stands on its own; finish your turn while helpers work.`,
    `When only ${owner} can decide something: ${ask} "plain question?" --recommend "what you would do". Then end your turn; the answer starts your next one. Anything technical is yours to decide: decide it and say what you decided.`,
    'Nobody can answer a question in this chat or approve a plan here: decide, and say what you decided. Do not leave a background job or a timer running when your turn ends; nothing will wake you for it. Wait for it inside the turn.',
  ];
  return `${lines.join('\n\n')}\n`;
}

/** One waiting note as a turn's prompt. */
function noteText(n) {
  const at = clock(n.queued_at || Date.now());
  if (n.from === 'helper') return `Report from ${n.from_name || 'a helper'}, the helper you handed work to (${at}):\n\n${n.text}`;
  const who = n.from === 'group' ? 'the group chat' : n.from === 'office' ? 'the office' : n.from === 'owner' ? 'the owner' : n.from || 'the owner';
  return `Note from the office (${who}, ${at}):\n\n${n.text}`;
}

/* ------------------------------------------------------------------- a job */

/**
 * The choices every computer shares (config/dispatch.json): the brief, model, effort, hands and time cap. createJob
 * checks them here, and so does the hub before it queues a start for another computer (mesh-dispatch.js).
 * @returns { ok: true, brief, model, effort, hands, cap } | { ok: false, status, error }
 */
function vetShared(c, r) {
  const no = (status, error) => ({ ok: false, status, error });
  const brief = String(r.brief == null ? '' : r.brief).replace(/\r\n/g, '\n').trim();
  if (!brief) return no(400, 'Say what it should do.');
  if (brief.length > c.limits.brief_max_chars) return no(400, `Keep the brief under ${c.limits.brief_max_chars} characters (this is ${brief.length}).`);
  if (/\0/.test(brief)) return no(400, 'The brief holds a character that cannot be passed on.');
  const d = Object.assign({}, r.origin === 'session' ? c.helper_defaults : c.defaults);
  const model = modelEntry(c, r.model || d.model);
  if (!model) return no(400, `There is no model called ${String(r.model).slice(0, 20)} here.`);
  const effort = r.effort || d.effort;
  if (!c.efforts.includes(effort)) return no(400, `Effort is one of ${c.efforts.join(', ')}.`);
  const hands = handsEntry(c, r.hands || d.hands);
  if (!hands) return no(400, `Hands are one of ${c.hands.map((h) => h.key).join(', ')}.`);
  const cap = r.cap_min == null || r.cap_min === '' ? Number(d.cap_min) : Number(r.cap_min);
  if (!c.caps_min.includes(cap)) return no(400, `The time cap is one of ${c.caps_min.join(', ')} minutes.`);
  return { ok: true, brief, model, effort, hands, cap };
}

/**
 * A new job, checked against config/dispatch.json. Writes the job, its brief and its system prompt; starts nothing.
 * @param req { brief, model, effort, hands, cap_min, as, place, name, notify, parent: { machine, session_id, name, client_work } | null, origin }
 * @param ctx { machine, hubRoot, codeRoots, agentsDir, config, now, jobs }
 * @returns { ok: true, job } | { ok: false, status, error }
 */
function createJob(home, req, ctx) {
  const c = loadConfig(ctx && ctx.config);
  const no = (status, error) => ({ ok: false, status, error });
  const r = req || {};
  const now = (ctx && ctx.now) || Date.now();
  const machine = (ctx && ctx.machine) || geo.thisMachine();
  const shared = vetShared(c, r);
  if (!shared.ok) return shared;
  const { brief, model, hands, cap } = shared;
  let { effort } = shared;
  let as = null;
  if (r.as != null && r.as !== '') {
    as = people(ctx && ctx.agentsDir).find((p) => p.key === r.as) || null;
    if (!as) return no(400, `There is nobody called ${String(r.as).slice(0, 40)} in the org.`);
  }
  const hubRoot = (ctx && ctx.hubRoot) || config.hubRoot();
  const root = workRoot(ctx);
  let place = null;
  if (r.place != null && r.place !== '' && r.place !== 'hub') {
    place = places(hubRoot, ctx && ctx.codeRoots).find((p) => p.key === r.place) || null;
    if (!place) return no(400, `There is no project called ${String(r.place).slice(0, 60)} here.`);
  }
  if (r.name != null && r.name !== '' && !NAME_RE.test(String(r.name))) return no(400, 'A name is up to 40 letters, numbers and spaces.');
  if (!findClaude()) return no(409, "Claude Code isn't installed where the office can find it on this computer.");

  const jobs = (ctx && ctx.jobs) || listJobs(home);
  let parent = null;
  let depth = 1;
  if (r.parent) {
    if (!SESSION_RE.test(String(r.parent.session_id || ''))) return no(400, 'That lead is not a session.');
    if (r.parent.machine && String(r.parent.machine).toUpperCase() !== machine) {
      return no(409, `That lead is on ${r.parent.machine}; helpers start on the lead's own computer.`);
    }
    const lead = jobs.find((j) => j.session_id === r.parent.session_id);
    depth = lead ? (lead.depth || 1) + 1 : 2;
    if (depth > c.limits.max_depth) return no(409, `That is ${depth} levels down; ${c.limits.max_depth} is the deepest a helper goes.`);
    const open = jobs.filter((j) => j.parent && j.parent.session_id === r.parent.session_id && !['closed', 'failed'].includes(j.status)).length;
    if (open >= c.limits.max_helpers_per_lead) return no(409, `${r.parent.name || 'That lead'} already has ${open} helpers; close one first.`);
    // Helper caps, to keep usage in hand: a helper never runs above the effort of the session that started it, and a
    // Fable helper runs on low only (most helper work belongs on Opus, medium). Helpers only: a session the owner
    // starts from the page is the owner's choice. A lead with no job here (a chat opened by hand) has no effort to
    // measure, so only the Fable rule applies. An effort the helper did not name is taken down to fit instead of refused.
    const rank = (e) => c.efforts.indexOf(e);
    const top = lead && rank(lead.effort) >= 0 ? lead.effort : null;
    if (!r.effort) {
      if (model.key === 'fable') effort = 'low';
      else if (top && rank(effort) > rank(top)) effort = top;
    }
    if (model.key === 'fable' && effort !== 'low') {
      return no(400, `Fable helpers run on low only (asked: ${effort}). For most work hand it to Opus on medium: --model opus --effort medium.`);
    }
    if (top && rank(effort) > rank(top)) {
      const allowed = c.efforts.slice(0, rank(top) + 1).join(', ');
      return no(400, `A helper's effort can't be above its lead's. ${lead.name || 'Your lead'} runs on ${top}, so a helper runs on ${allowed}.`);
    }
    parent = {
      machine, session_id: r.parent.session_id,
      name: NAME_RE.test(String(r.parent.name || '')) ? String(r.parent.name) : (lead ? lead.name : 'your lead'),
      job: lead ? lead.id : null, client_work: !!(r.parent.client_work || (lead && lead.client_work)),
    };
  }
  const running = runningCount(home, jobs);
  if (running >= c.limits.max_running) return no(429, `${running} sessions are already working here, the most at once. Try again when one finishes.`);

  const client = !!(parent && parent.client_work) || !!(place && place.client);
  const id = `d${now.toString(36)}${crypto.randomBytes(3).toString('hex')}`;
  const name = client ? 'Private work' : (r.name ? String(r.name) : as ? as.person : nameFromBrief(brief));
  const job = {
    id, v: 1, machine, session_id: crypto.randomUUID(), name,
    as: as ? as.key : null, person: as ? as.person : null, role: as ? as.role : null,
    model: model.key, model_id: model.id, model_label: model.label, effort,
    hands: hands.key, hands_label: hands.label, mode: hands.mode, cap_min: cap,
    work_root: root,
    place: place ? place.key : null, place_label: place ? place.label : (hubRoot ? 'The Hub' : 'Home folder'), place_dir: place ? place.dir : null,
    client_work: client, parent, origin: r.origin === 'session' ? 'session' : 'owner', depth,
    // A buzz on the owner's phone when it replies (the owner's own sessions only; a helper reports to its lead).
    notify: !parent && r.origin !== 'session' && r.notify === true,
    created_at: now, status: 'starting', starting_at: now, reason: null,
    turns: 0, steps: 0, turn: null, turn_times: [], reported_at: null, model_actual: null,
  };
  fs.mkdirSync(dirs(home).jobs, { recursive: true });
  writeAtomic(file(home, id, '.brief.txt'), brief);
  writeAtomic(file(home, id, '.system.md'), systemPrompt(job, ctx));
  writeJob(home, job);
  return { ok: true, job };
}

/** Start a turn's runner (bin/office-turn.js), detached, unless one is running. Resolves { ok, pid } or { ok: false, error }. */
async function startTurn(home, id, ctx) {
  const job = readJob(home, id);
  if (!job) return { ok: false, error: 'There is no such session.' };
  if (turnLock(home, id)) return { ok: true, already: true };
  const d = dirs(home);
  fs.mkdirSync(d.logs, { recursive: true });
  updateJob(home, id, (j) => Object.assign(j, { status: j.status === 'closed' ? 'closed' : 'starting', starting_at: Date.now() }));
  try {
    const launch = (ctx && ctx.launch) || startDetached;
    const pid = await launch(process.execPath, [(ctx && ctx.turnScript) || TURN, id], {
      cwd: job.work_root || workRoot(ctx), env: sessionFreeEnv(process.env, home), log: path.join(d.logs, `${id}.log`), pidFile: file(home, id, '.runner.pid'),
    });
    return { ok: true, pid };
  } catch (e) {
    updateJob(home, id, { status: 'failed', reason: 'The office could not start its turn.' });
    try { fs.appendFileSync(path.join(d.logs, `${id}.log`), `[${new Date().toISOString()}] could not start the runner: ${String(e && e.message).slice(0, 300)}\n`); } catch (_) { /* the status says it */ }
    return { ok: false, error: 'The office could not start its turn.' };
  }
}

/** Notes waiting in a session's inbox. */
function pendingNotes(home, sessionId) {
  return inbox.status(home, sessionId).pending;
}

/** Turns in the last hour, from the job's own record. */
const turnsThisHour = (job, now) => (job.turn_times || []).filter((t) => now - t < 3600 * 1000).length;

/**
 * Once a frame: a session with notes waiting and no turn running gets a turn; a turn whose runner died is said to have
 * stopped. Returns the ids it started a turn for.
 */
function tick(home, ctx) {
  const c = loadConfig(ctx && ctx.config);
  const now = (ctx && ctx.now) || Date.now();
  const jobs = listJobs(home);
  let running = runningCount(home, jobs);
  const started = [];
  for (const j of jobs) {
    if (j.status === 'closed') continue;
    const lock = turnLock(home, j.id);
    if (lock) continue;
    if ((j.status === 'starting' && now - (j.starting_at || j.created_at) > START_GRACE_MS) || j.status === 'working') {
      updateJob(home, j.id, (x) => (x.status === j.status ? Object.assign(x, { status: 'failed', reason: 'Its turn stopped without finishing.' }) : x));
      continue;
    }
    if (j.status === 'starting') continue;
    if (!pendingNotes(home, j.session_id)) continue;
    if (running >= c.limits.max_running) break;
    if (turnsThisHour(j, now) >= c.limits.max_turns_per_hour) {
      if (!j.paused) updateJob(home, j.id, { paused: `It has had ${c.limits.max_turns_per_hour} turns this hour; your note waits for the next.` });
      continue;
    }
    running += 1;
    started.push(j.id);
    startTurn(home, j.id, ctx).catch(() => null);
  }
  return started;
}

/** Stop the runner and the Claude Code it started (taskkill /T on Windows), if a turn is running. */
function killTurn(home, id) {
  return new Promise((resolve) => {
    const l = turnLock(home, id);
    if (!l) { resolve(false); return; }
    if (process.platform === 'win32') {
      execFile('taskkill', ['/PID', String(l.pid), '/T', '/F'], { timeout: 15000, windowsHide: true }, () => resolve(true));
    } else {
      try { process.kill(l.pid, 'SIGTERM'); } catch (_) { /* gone */ }
      resolve(true);
    }
  });
}

/** Stop, Close, Reopen and the reply buzz, from the page. */
async function act(home, id, action) {
  const job = readJob(home, id);
  if (!job) return { ok: false, status: 404, message: "There's no such session." };
  if (action === 'stop') {
    const was = await killTurn(home, id);
    updateJob(home, id, { status: 'stopped', reason: 'You stopped it.', paused: null });
    try { fs.rmSync(file(home, id, '.turn.json'), { force: true }); } catch (_) { /* gone */ }
    return { ok: true, status: 200, message: was ? `${job.name} stopped. A note starts it again.` : `${job.name} wasn't in a turn. A note starts it again.` };
  }
  if (action === 'close') {
    await killTurn(home, id);
    updateJob(home, id, { status: 'closed', reason: null, paused: null, closed_at: Date.now() });
    try { fs.rmSync(file(home, id, '.turn.json'), { force: true }); } catch (_) { /* gone */ }
    return { ok: true, status: 200, message: `${job.name} is closed. Its notes wait until you reopen it.` };
  }
  if (action === 'notify' || action === 'quiet') {
    if (job.parent) return { ok: false, status: 409, message: `${job.name} reports to ${job.parent.name}, not to your phone.` };
    updateJob(home, id, { notify: action === 'notify' });
    return { ok: true, status: 200, message: action === 'notify' ? `Your phone buzzes when ${job.name} replies to you.` : `No buzz when ${job.name} replies to you.` };
  }
  if (action === 'reopen') {
    updateJob(home, id, { status: 'idle', reason: null, paused: null, closed_at: null });
    return { ok: true, status: 200, message: `${job.name} is open again.` };
  }
  return { ok: false, status: 404, message: 'Stop, close or reopen.' };
}

/* -------------------------------------------------------------- the view */

/** What the page gets for one job: who and how, its status and last turn. The brief only for work that is not private. */
function jobView(home, j) {
  const lock = turnLock(home, j.id);
  const brief = j.client_work ? null : readBrief(home, j.id).slice(0, 1200);
  return {
    id: j.id, machine: j.machine, session_id: j.session_id, name: j.name,
    as: j.as, person: j.person, role: j.role,
    model: j.model, model_id: j.model_actual || j.model_id, model_label: j.model_label, effort: j.effort,
    hands: j.hands, hands_label: j.hands_label, cap_min: j.cap_min, place_label: j.client_work ? null : j.place_label,
    client_work: !!j.client_work, origin: j.origin, depth: j.depth || 1,
    parent: j.parent ? { machine: j.parent.machine, session_id: j.parent.session_id, name: j.parent.name, job: j.parent.job || null } : null,
    created_at: j.created_at, status: lock ? 'working' : j.status, reason: j.reason || null, paused: j.paused || null,
    turns: j.turns || 0, steps: (j.steps || 0), turn: j.turn || null, running_since: lock ? lock.started_at : null,
    reported_at: j.reported_at || null, brief, notify: !!j.notify,
    pending: pendingNotes(home, j.session_id),
  };
}

/** Jobs the page shows: anything active, and anything that finished in the last `shown_days`. */
function view(home, now, ctx) {
  const c = loadConfig(ctx && ctx.config);
  const keep = c.limits.shown_days * 24 * 3600 * 1000;
  return listJobs(home)
    .filter((j) => {
      if (['starting', 'working'].includes(j.status) || turnLock(home, j.id)) return true;
      const last = Math.max(j.created_at || 0, (j.turn && (j.turn.ended_at || j.turn.started_at)) || 0, j.closed_at || 0);
      return now - last < keep;
    })
    .map((j) => jobView(home, j));
}

/**
 * Put each job on its session: s.dispatch, its name, its model when the hooks have not said one, and its room (a
 * helper sits in its lead's room, so a team sits together). A job whose session has not reached the floor yet is shown
 * as a desk that is starting. Mutates and returns the sessions.
 */
function decorate(sessions, jobs) {
  const byKey = new Map(sessions.map((s) => [`${s.machine}:${s.id}`, s]));
  for (const j of jobs) {
    if (j.status === 'closed') continue;
    // A start on its way to another computer, or one it refused (mesh-dispatch.js), has no session yet: its own id
    // stands in for one until that computer's feed brings the real desk.
    let s = byKey.get(`${j.machine}:${j.session_id || j.id}`);
    if (!s) {
      const waiting = j.start && (j.status === 'queued' || j.status === 'failed');
      // A computer that stopped reporting has nobody on it starting up.
      if (j.feed_stale || (!waiting && !['starting', 'working'].includes(j.status))) continue;
      s = {
        id: j.session_id || j.id, machine: j.machine, name: j.name, callsign: null, client_work: j.client_work, room: 'Dispatch',
        run: null, lane: null, model: j.model_id, family: familyOf(j.model_id), state: j.status === 'failed' ? 'idle' : 'working', waiting: null,
        repo: null, branch: null, now: { verb: 'working', tool: null, summary: 'Getting started', at: j.created_at }, before: [],
        started_at: j.created_at, last_at: j.created_at, finished_at: null, long_step: null, pace: null,
        helpers: [], returned: [], notes: [], deliverable: false, waker: false, keep_awake: null, nudged_at: null, arriving: true,
      };
      sessions.push(s);
      byKey.set(`${s.machine}:${s.id}`, s);
    }
    s.dispatch = j;
    // The job's turn lock is the word on whether it is at work: a session whose folder has no office hooks never
    // sends its Stop, and its transcript alone would leave it Working after its turn ended.
    if (!j.start && s.state === 'working' && !['starting', 'working'].includes(j.status)) s.state = 'idle';
    // The office starts its turns itself: no idle nudges, no waiter.
    s.keep_awake = null;
    s.waker = false;
    // A private project's session starts in the Hub, so the floor's own private-work test (its folder) cannot see it:
    // the job says so, and everything a model wrote is taken off its desk, as sources.js does for private work.
    if (j.client_work) {
      s.client_work = true;
      s.repo = null;
      s.branch = null;
      if (s.now) s.now = Object.assign({}, s.now, { summary: null });
      s.before = (s.before || []).map((b) => (b ? Object.assign({}, b, { summary: null }) : b));
      if (s.waiting) s.waiting = Object.assign({}, s.waiting, { summary: null });
      s.helpers = (s.helpers || []).map((h) => Object.assign({}, h, { task: null, now: h.now ? Object.assign({}, h.now, { summary: null }) : h.now }));
      s.returned = (s.returned || []).map((r) => Object.assign({}, r, { task: null }));
    }
    s.display = { name: j.name, label: j.role ? `${j.name} · ${j.role}` : j.name, rename: null, person: j.person || null };
    if (!s.model) { s.model = j.model_id; s.family = familyOf(j.model_id); }
    if (!j.client_work && j.place_label && !['The Hub', 'Home folder'].includes(j.place_label)) s.room = j.place_label;
    else if (s.room === 'Hub' || s.room === 'Dispatch') s.room = 'Dispatch';
  }
  // A helper sits with its lead, wherever the lead sits.
  for (const s of sessions) {
    const p = s.dispatch && s.dispatch.parent;
    if (!p) continue;
    const lead = byKey.get(`${p.machine}:${p.session_id}`);
    if (lead) { s.room = lead.room; s.lead_key = `${lead.machine}:${lead.id}`; }
  }
  return sessions;
}

function familyOf(model) {
  const m = String(model || '').toLowerCase();
  for (const f of ['opus', 'fable', 'sonnet', 'haiku']) if (m.includes(f)) return f;
  return 'unknown';
}

/* ------------------------------------------------- its conversation, read */

const TALK_MAX = 40;
const TEXT_MAX = 8000;

/** The words of a user line: its text, or null when it is a tool's result or the harness's own. */
function userText(o) {
  if (!o || o.type !== 'user' || o.isMeta || o.isCompactSummary || !o.message) return null;
  const c = o.message.content;
  let t = null;
  if (typeof c === 'string') t = c;
  else if (Array.isArray(c)) {
    if (c.some((b) => b && b.type === 'tool_result')) return null;
    t = c.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n');
  }
  if (!t || !t.trim()) return null;
  if (/^\s*<(command-|local-command|system-reminder|task-notification)/.test(t)) return null;
  return t;
}

function assistantText(o) {
  if (!o || o.type !== 'assistant' || !o.message || !Array.isArray(o.message.content)) return null;
  const t = o.message.content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n');
  return t.trim() ? t : null;
}

/**
 * The conversation of a session the office started: each prompt it was given (the brief, the notes, a helper's
 * report) and each turn's final reply, oldest first, the last TALK_MAX. Read from its own transcript on request, never
 * kept. Private work: nothing.
 */
function talk(home, id, projectsDir) {
  const job = readJob(home, id);
  if (!job) return { ok: false, status: 404, error: "There's no such session." };
  if (job.client_work) return { ok: true, client_work: true, items: [] };
  const f = S.findTranscript(projectsDir || path.join(ownerClaudeHome(home), 'projects'), job.session_id);
  if (!f) return { ok: true, items: [] };
  let raw = '';
  try { raw = fs.readFileSync(f, 'utf8'); } catch (_) { return { ok: true, items: [] }; }
  const items = [];
  let reply = null;
  let steps = 0;
  const flush = () => {
    if (reply) items.push({ kind: 'reply', at: reply.at, text: reply.text.slice(0, TEXT_MAX), steps });
    reply = null;
    steps = 0;
  };
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line[0] !== '{') continue;
    let o;
    try { o = JSON.parse(line); } catch (_) { continue; }
    if (o.isSidechain) continue;
    const at = Date.parse(o.timestamp) || null;
    const u = userText(o);
    if (u) {
      flush();
      const m = /^(Note from the office \(([^,]+),[^)]*\)|Report from ([^,]+), the helper you handed work to \([^)]*\)):\s*\n*/.exec(u);
      const who = m ? (m[3] ? `report:${m[3]}` : m[2]) : (items.length ? 'owner' : 'brief');
      items.push({ kind: 'prompt', who, at, text: (m ? u.slice(m[0].length) : u).slice(0, TEXT_MAX) });
      continue;
    }
    const a = assistantText(o);
    if (a) reply = { at, text: a };
    if (o.type === 'assistant' && o.message && Array.isArray(o.message.content)) steps += o.message.content.filter((b) => b && b.type === 'tool_use').length;
  }
  flush();
  return { ok: true, items: items.slice(-TALK_MAX) };
}

module.exports = {
  loadConfig, homeDir, dirs, readJob, writeJob, updateJob, listJobs, readBrief, turnLock, alive, workRoot,
  people, personOf, places, isClientPlace, options, findClaude, sessionFreeEnv, nameFromBrief, systemPrompt, noteText,
  vetShared, createJob, startTurn, tick, act, killTurn, view, jobView, decorate, talk, userText, assistantText, pendingNotes,
  file, clock, SESSION_RE, ID_RE, NAME_RE, AGENT_RE, TALK_MAX, TEXT_MAX,
};
