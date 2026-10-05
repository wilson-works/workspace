#!/usr/bin/env node
'use strict';

/**
 * install-suite.js — the one installer behind `node install.js` at the repo root. It takes a
 * computer from nothing to a Hub, the starter skills and a running office, in one command.
 *
 *   node install.js [--dry-run] [--yes] [--hub <dir>] [--machine NAME] [--role command|builder|mobile]
 *                   [--owner <name>] [--office-port <n>] [--skills-scope hub|user]
 *                   [--skills-source <git url or path>] [--fleet none|create|join]
 *                   [--fleet-repo <owner/name|url>] [--create-repo] [--no-start] [--startup]
 *                   [--skip <part,part>] [--remove]
 *
 * The parts, in order. Each prints its plan first, then does it after a yes (or at once under --yes):
 *   check   Node 20+ and git are required; Python 3, gh, Claude Code and Tailscale are optional and
 *           are named with where to get them, never a stop.
 *   hub     the Hub root: --hub, else the folder above 50-AI/workspace when this repo sits there,
 *           else asked (default ~/Hub). Then `node hub/bin/hub.js init` (its own plan, then --yes).
 *   office  workspace.config.json when absent: the owner, this computer as the one machine and the
 *           hub, office.port (4316, or the next free port when 4316 belongs to something else) and
 *           office.home as an absolute path, so a hook from any environment finds the same office.
 *           When present it is kept, and each difference is a `!` line. The office's hooks (the list
 *           in bin/install.js) merged into <Hub>/.claude/settings.json, backed up first. The
 *           workspace-setup skill copied to <Hub>/.claude/skills. The office started unless
 *           --no-start, and waited for up to 20 s. --startup also starts it at login.
 *   skills  the claude_skills pack cloned to <Hub>/50-AI/claude_skills at the pinned commit
 *           (skills/starter.json), and each starter skill copied from that commit's own files to
 *           <Hub>/.claude/skills/<name>, or <claude home>/skills with --skills-scope user.
 *   agents  <Hub>/50-AI/agents with its README, when missing.
 *   fleet   only with --fleet, or a yes to "more than one computer?": fleet init or join, then the
 *           daily sync on offer. --yes alone never joins a fleet.
 *
 * --remove takes out what the record says this installer added, and only that: the hook entries in
 * the Hub's settings, login start, the fleet's daily sync, and each copied skill whose files still
 * match the record. Everything else stays (the zones, your files, the pack clone, the fleet repo,
 * the office's own folder) and is listed.
 *
 * The record is <Hub>/.hub/installed.json: the hook commands it added, each copy it made with the
 * content hash of what it wrote, login start, the fleet's sync. A copy whose files no longer match
 * is yours: `!`, kept, never replaced, never removed. Content hash: "sha256:" + sha256 over the
 * copy's files in path order, each as "<path inside the copy, / separated>\0<sha256 hex of its bytes>\n".
 *
 * Marks: + add, ~ change, = already there, ! yours differs and is kept, - remove.
 * --dry-run writes nothing and starts nothing. A second run prints = for everything and "Nothing changed."
 * Nothing of the user's is overwritten. Under --yes (or with nobody at the keyboard) every question
 * takes its default: keep your files, no fleet.
 * Exit: 0 done or plan shown, 1 a part failed, 2 refused (bad arguments).
 *
 * WORKSPACE_STARTER points at another starter.json (tests). WORKSPACE_CONFIG, WORKSPACE_HOME and
 * CLAUDE_CONFIG_DIR mean what they mean everywhere else in the office.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const readline = require('readline');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PARTS = ['check', 'hub', 'office', 'skills', 'agents', 'fleet'];
const ROLES = ['command', 'builder', 'mobile'];
const DEFAULT_PORT = 4316;
const VALUE_FLAGS = new Set(['--hub', '--machine', '--role', '--owner', '--office-port', '--skills-scope',
  '--skills-source', '--fleet', '--fleet-repo', '--skip']);
const BOOL_FLAGS = new Set(['--dry-run', '--yes', '--create-repo', '--no-start', '--startup', '--remove', '--help']);

const HELP = `The WilsonWorks Workspace installer: your Hub, the starter skills and the office, in one go.

  node install.js                     install, asking before each part
  node install.js --dry-run           show the plan; write nothing
  node install.js --yes               install without questions (keeps every file of yours)
  node install.js --remove            take out what it added; keep everything of yours

Options:
  --hub <folder>             where your Hub is (default: the folder above 50-AI/workspace, else ~/Hub)
  --machine <NAME>           a short name for this computer, like DESK
  --role command|builder|mobile    what this computer is for (default command)
  --owner <name>             what your sessions call you
  --office-port <number>     the office's port (default 4316, or the next free one)
  --skills-scope hub|user    the starter skills in the Hub (default) or for every folder (~/.claude)
  --skills-source <url|path> where to get the skills pack (default: skills/starter.json)
  --fleet none|create|join   more than one computer: start a fleet, or join yours
  --fleet-repo <owner/name>  the fleet repo to join
  --create-repo              make the private fleet repo on your GitHub account
  --no-start                 do not start the office
  --startup                  start the office when you log in
  --skip <parts>             leave out parts: check,hub,office,skills,agents,fleet

Marks: + add  ~ change  = already there  ! yours differs (kept)  - remove`;

class Refusal extends Error {}

const out = (s = '') => process.stdout.write(`${s}\n`);
const fwd = (p) => String(p).replace(/\\/g, '/');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const exists = (p) => { try { fs.statSync(p); return true; } catch (_) { return false; } };
const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } };
const samePath = (a, b) => {
  const n = (p) => fwd(path.resolve(String(p))).replace(/\/+$/, '');
  return process.platform === 'win32' || process.platform === 'darwin'
    ? n(a).toLowerCase() === n(b).toLowerCase() : n(a) === n(b);
};

/* The office's own modules, loaded when first needed (they read settings at load). */
const lazy = (f) => { let m; return () => { if (!m) m = f(); return m; }; };
const config = lazy(() => require('../src/server/config'));
const home = lazy(() => require('../src/server/home'));
const inst = lazy(() => require('./install'));
const hubLib = lazy(() => require('../hub/lib/root'));

/* --------------------------------------------------------------- arguments */

function camel(flag) { return flag.replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }

function parseArgs(argv, opts) {
  const o = { skip: new Set() };
  for (let i = 0; i < argv.length; i += 1) {
    let a = String(argv[i]);
    let v = null;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) { v = a.slice(eq + 1); a = a.slice(0, eq); }
    if (a === '-h') a = '--help';
    if (BOOL_FLAGS.has(a)) {
      if (v !== null) throw new Refusal(`${a} takes no value.`);
      o[camel(a)] = true;
      continue;
    }
    if (!VALUE_FLAGS.has(a)) throw new Refusal(`"${argv[i]}" is not an option this installer knows. node install.js --help lists them.`);
    if (v === null) { v = argv[i + 1]; i += 1; }
    if (v === undefined || String(v).trim() === '' || String(v).startsWith('--')) throw new Refusal(`${a} needs a value.`);
    if (a === '--skip') {
      for (const p of String(v).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)) {
        if (!PARTS.includes(p)) throw new Refusal(`--skip: there is no part called "${p}". The parts are ${PARTS.join(', ')}.`);
        o.skip.add(p);
      }
      continue;
    }
    o[camel(a)] = String(v).trim();
  }
  if (o.role && !ROLES.includes(o.role)) throw new Refusal(`--role is one of ${ROLES.join(', ')}.`);
  if (o.officePort !== undefined) {
    const n = Number(o.officePort);
    if (!Number.isInteger(n) || n < 1024 || n > 65535) throw new Refusal('--office-port is a whole number from 1024 to 65535.');
    o.officePort = n;
  }
  o.skillsScope = o.skillsScope || 'hub';
  if (!['hub', 'user'].includes(o.skillsScope)) throw new Refusal('--skills-scope is hub or user.');
  if (o.fleet && !['none', 'create', 'join'].includes(o.fleet)) throw new Refusal('--fleet is none, create or join.');
  if (o.createRepo) {
    if (o.fleet && o.fleet !== 'create') throw new Refusal('--create-repo goes with --fleet create.');
    o.fleet = 'create';
  }
  if (o.fleetRepo) {
    if (o.fleet && o.fleet !== 'join') throw new Refusal('--fleet-repo goes with --fleet join.');
    o.fleet = 'join';
  }
  const interactive = opts && opts.interactive;
  if (o.fleet === 'join' && !o.fleetRepo && !interactive) throw new Refusal('--fleet join needs --fleet-repo <owner/name>.');
  return o;
}

/* --------------------------------------------------------------- questions */

function makeAsker(o) {
  const interactive = !o.yes && !!process.stdin.isTTY;
  let rl = null;
  const ask = async (question, def) => {
    if (!interactive) return def;
    rl = rl || readline.createInterface({ input: process.stdin, output: process.stdout });
    const hint = def ? ` (press Enter for ${def})` : '';
    const answer = await new Promise((res) => rl.question(`${question}${hint}\n> `, res));
    return String(answer).trim() || def;
  };
  const yesNo = async (question, def) => {
    if (!interactive) return def;
    const a = String(await ask(`${question} ${def ? '[Y/n]' : '[y/N]'}`, '') || '').toLowerCase();
    return a ? a.startsWith('y') : def;
  };
  return { interactive, ask, yesNo, close: () => { if (rl) rl.close(); } };
}

async function goAhead(ctx, part) {
  if (ctx.o.yes || !ctx.asker.interactive) return true;
  return ctx.asker.yesNo(`Go ahead with ${part}?`, true);
}

/* ----------------------------------------------------------------- helpers */

function platformHome() {
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'WorkSpace');
  }
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'WorkSpace');
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'WorkSpace');
}

function expandHome(p) {
  const s = String(p);
  if (s === '~') return os.homedir();
  if (s.startsWith('~/') || s.startsWith('~\\')) return path.join(os.homedir(), s.slice(2));
  return s;
}

/** A path as the person reads it: inside the Hub, relative to it. */
function show(ctx, p) {
  const r = path.relative(ctx.hub, p);
  return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : p;
}

/** How a copy is named in the record: Hub-relative with / when inside the Hub, else absolute. */
function recordKey(ctx, p) {
  const r = path.relative(ctx.hub, p);
  return r && !r.startsWith('..') && !path.isAbsolute(r) ? fwd(r) : fwd(path.resolve(p));
}
function fromKey(ctx, key) { return /^([A-Za-z]:\/|\/)/.test(key) ? path.resolve(key) : path.join(ctx.hub, ...key.split('/')); }

function findOnPath(name) {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of String(process.env.PATH || process.env.Path || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const f = path.join(dir.replace(/^"|"$/g, ''), name + ext);
      try { if (fs.statSync(f).isFile()) return f; } catch (_) { /* next */ }
    }
  }
  return null;
}

/** The first line a tool prints for --version, or '' when it runs but says nothing, or null when absent. */
function versionOf(name, args) {
  const f = findOnPath(name);
  if (!f) return null;
  if (/\.(cmd|bat)$/i.test(f)) return '';
  try {
    const t = execFileSync(f, args || ['--version'], { encoding: 'utf8', timeout: 20000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    return String(t).split(/\r?\n/)[0].trim();
  } catch (_) { return ''; }
}

function git(cwd, args, extra) {
  return execFileSync('git', args, Object.assign({
    cwd, encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }, extra || {}));
}
const gitOk = (cwd, args) => { try { git(cwd, args); return true; } catch (_) { return false; } };

function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port }, () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    s.setTimeout(1500, () => { s.destroy(); resolve(false); });
  });
}

function answers(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', agent: false, timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** The office whose files are in `officeHome`, when it is running on `port`. */
async function ourOfficeOn(officeHome, port) {
  let a = null;
  try { a = JSON.parse(fs.readFileSync(path.join(officeHome, 'office.alive'), 'utf8')); } catch (_) { return false; }
  return !!a && Number(a.port) === port && pidAlive(Number(a.pid)) && portInUse(port);
}

async function pickPort(officeHome) {
  if (!(await portInUse(DEFAULT_PORT)) || (await ourOfficeOn(officeHome, DEFAULT_PORT))) return DEFAULT_PORT;
  for (let p = DEFAULT_PORT + 1; p < DEFAULT_PORT + 80; p += 1) if (!(await portInUse(p))) return p;
  throw new Error(`no free port from ${DEFAULT_PORT} to ${DEFAULT_PORT + 79}; choose one with --office-port.`);
}

/* --------------------------------------------------------- copies and hash */

function hashEntries(entries) {
  const h = crypto.createHash('sha256');
  const sorted = [...entries].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  for (const e of sorted) h.update(`${e.rel}\0${e.sum}\n`);
  return `sha256:${h.digest('hex')}`;
}

function filesUnder(dir, base) {
  const b = base || dir;
  const outList = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) outList.push(...filesUnder(p, b));
    else outList.push(fwd(path.relative(b, p)));
  }
  return outList;
}

/** The content hash of a folder on disk (the same formula as the record). */
function hashDir(dir) {
  return hashEntries(filesUnder(dir).map((rel) => ({ rel, sum: sha(fs.readFileSync(path.join(dir, ...rel.split('/')))) })));
}

/**
 * Plan one copy. `c`: { dest, files: [{rel, buf, exec}], kind, name, from, why }.
 * Prints its line; returns the action that makes it, or null when there is nothing to do.
 */
function planCopy(ctx, c) {
  const key = recordKey(ctx, c.dest);
  const want = hashEntries(c.files.map((f) => ({ rel: f.rel, sum: sha(f.buf) })));
  const label = show(ctx, c.dest);
  const write = () => {
    fs.mkdirSync(c.dest, { recursive: true });
    for (const f of c.files) {
      const p = path.join(c.dest, ...f.rel.split('/'));
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, f.buf);
      if (f.exec && process.platform !== 'win32') fs.chmodSync(p, 0o755);
    }
    ctx.record.copies[key] = { kind: c.kind, name: c.name, hash: want, from: c.from };
    saveRecord(ctx);
  };
  if (!exists(c.dest)) {
    out(`  + ${label}${c.why ? `  ${c.why}` : ''}`);
    return write;
  }
  const have = hashDir(c.dest);
  if (have === want) { out(`  = ${label}`); return null; }
  const rec = ctx.record.copies[key];
  if (rec && rec.hash === have) {
    out(`  ~ ${label}  (updated to ${c.from})`);
    return () => { fs.rmSync(c.dest, { recursive: true, force: true }); write(); };
  }
  out(`  ! ${label}  (yours differs from ${c.from}; kept. To take ours, move yours out of the way and run this again.)`);
  return null;
}

/* ------------------------------------------------------------------ record */

function recordFile(hub) { return path.join(hub, '.hub', 'installed.json'); }

function readRecord(hub) {
  const blank = { format: 1, hooks: { file: '.claude/settings.json', added: {} }, copies: {}, startup: null, fleet_schedule: false };
  const t = readText(recordFile(hub));
  if (t === null) return Object.assign(blank, { _new: true });
  try {
    const r = JSON.parse(t.replace(/^\uFEFF/, ''));
    return Object.assign(blank, r, {
      hooks: Object.assign(blank.hooks, r.hooks || {}),
      copies: r.copies && typeof r.copies === 'object' ? r.copies : {},
    });
  } catch (e) {
    throw new Refusal(`${recordFile(hub)} is not valid JSON (${e.message}). Fix it or move it away; nothing was changed.`);
  }
}

function saveRecord(ctx) {
  const r = Object.assign({}, ctx.record);
  delete r._new;
  r.format = 1;
  inst().writeJson(recordFile(ctx.hub), r);
}

/* -------------------------------------------------------------------- check */

function partCheck(ctx) {
  out('check - the tools this needs');
  const notes = [];
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 20) out(`  = Node.js ${process.versions.node}`);
  else {
    out(`  Node.js ${process.versions.node} is too old: version 20 or newer is needed. Get the LTS from https://nodejs.org`);
    ctx.failed.push('check');
  }
  const g = versionOf('git');
  if (g) out(`  = ${g}`);
  else {
    out('  git was not found, and the installer needs it. Get it from https://git-scm.com/downloads');
    out('    (Windows: winget install --id Git.Git -e   macOS: xcode-select --install)');
    ctx.failed.push('check');
  }
  const py = inst().python();
  if (py) out(`  = Python 3 (${py})`);
  else notes.push('Python 3: the permission hooks and the CTO org use it. https://www.python.org/downloads (on Windows, not the Microsoft Store shortcut)');
  // Found on the PATH, not run: running gh writes a file of its own, and a dry run writes nothing.
  if (findOnPath('gh')) out('  = gh (GitHub\'s command line)');
  else notes.push('gh, GitHub\'s command line: only the fleet (several computers) needs it. https://cli.github.com');
  if (findOnPath('claude')) out('  = Claude Code (the claude command)');
  else notes.push('the claude command: fine if you use Claude Code in VS Code or the Claude desktop app. https://claude.com/claude-code');
  const ts = process.platform === 'win32'
    ? exists(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Tailscale', 'tailscale.exe')) || !!findOnPath('tailscale')
    : (process.platform === 'darwin' && exists('/Applications/Tailscale.app')) || !!findOnPath('tailscale');
  if (ts) out('  = Tailscale');
  else notes.push('Tailscale: puts your phone and other computers on your office. https://tailscale.com/download');
  for (const n of notes) out(`  Not found (optional): ${n}`);
}

/* ---------------------------------------------------------------------- hub */

async function resolveHub(ctx) {
  const o = ctx.o;
  if (o.hub) return path.resolve(expandHome(o.hub));
  if (path.basename(ROOT).toLowerCase() === 'workspace' && path.basename(path.dirname(ROOT)).toLowerCase() === '50-ai') {
    return path.dirname(path.dirname(ROOT));
  }
  let def = path.join(os.homedir(), 'Hub');
  try { const found = hubLib().findHubRoot({ from: ROOT }); if (found) def = found.root; } catch (_) { /* the default */ }
  const a = await ctx.asker.ask('Where should your Hub be? It is the one folder that holds all your work.', def);
  return path.resolve(expandHome(a));
}

function readMarker(hub) {
  try { return hubLib().readHub(hub); } catch (_) { return null; }
}

async function identity(ctx) {
  const o = ctx.o;
  const marker = readMarker(ctx.hub) || {};
  const c = config();
  ctx.machine = o.machine || marker.machine || null;
  if (!ctx.machine) {
    ctx.machine = await ctx.asker.ask('A short name for this computer, shown on the office floor (capitals, like DESK)?', c.thisComputer());
  }
  ctx.machine = c.wallName(ctx.machine);
  ctx.role = o.role || (ROLES.includes(marker.role) ? marker.role : 'command');
  ctx.owner = o.owner || marker.owner || c.ownerName() || null;
  if (!ctx.owner) ctx.owner = (await ctx.asker.ask('What should your sessions call you? Usually a first name. Press Enter to skip.', '')) || null;
}

/** Run one of the suite's own tools (hub, fleet) as a child; returns {status, stdout}. */
function tool(rel, args, inherit) {
  const r = spawnSync(process.execPath, [path.join(ROOT, ...rel.split('/'))].concat(args), {
    cwd: ROOT, encoding: 'utf8', windowsHide: true, stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
  return { status: r.status === null ? 1 : r.status, stdout: `${r.stdout || ''}${r.stderr || ''}` };
}

const isChange = (line) => /^\s*[+~-]\s/.test(line);

async function partHub(ctx) {
  out(`hub - your Hub: ${ctx.hub}`);
  if (ctx.o.skip.has('hub')) {
    out('  (skipped: --skip hub)');
    if (!readMarker(ctx.hub)) out('  ! There is no .hub/hub.json in that folder, so it is not a Hub yet. Run again without --skip hub.');
    return;
  }
  const rel = 'hub/bin/hub.js';
  if (!exists(path.join(ROOT, ...rel.split('/')))) {
    out(`  This copy of the workspace has no ${rel}, so the Hub cannot be set up from it. Update it (git pull), or run again with --skip hub.`);
    ctx.failed.push('hub');
    return;
  }
  const base = ['init', '--root', ctx.hub, '--machine', ctx.machine, '--role', ctx.role].concat(ctx.owner ? ['--owner', ctx.owner] : []);
  const plan = tool(rel, base.concat(['--dry-run']));
  const lines = plan.stdout.split(/\r?\n/).filter((l) => l.trim());
  // The tool's own "Dry run: nothing was written" closes its plan; in a real install the next lines are
  // the doing, so that line would only confuse.
  for (const l of lines) if (ctx.dry || !/^\s*Dry run:/.test(l)) out(`  ${l.replace(/^\s+/, '')}`);
  if (plan.status !== 0) { out(`  The Hub tool stopped (exit ${plan.status}).`); ctx.failed.push('hub'); return; }
  const n = lines.filter(isChange).length;
  if (!n) return;
  if (ctx.dry) { ctx.planned += n; return; }
  if (!(await goAhead(ctx, 'the Hub'))) { out('  Skipped.'); return; }
  const r = tool(rel, base.concat(['--yes']));
  for (const l of r.stdout.split(/\r?\n/).filter((x) => x.trim() && !isChange(x))) out(`  ${l.replace(/^\s+/, '')}`);
  if (r.status !== 0) { out(`  The Hub tool stopped (exit ${r.status}).`); ctx.failed.push('hub'); return; }
  ctx.changes += n;
}

/**
 * NAV.md once more, last: the skills pack, the agents' home and the fleet clone land in 50-AI/ after the
 * hub part wrote it, so without this a second install would find NAV.md out of date and change it.
 */
function navLast(ctx) {
  if (ctx.dry || ctx.o.skip.has('hub') || !readMarker(ctx.hub)) return;
  const rel = 'hub/bin/hub.js';
  if (!exists(path.join(ROOT, ...rel.split('/')))) return;
  const r = tool(rel, ['nav', '--root', ctx.hub]);
  const changed = r.stdout.split(/\r?\n/).filter(isChange);
  if (r.status !== 0) { out(`  NAV.md could not be regenerated (exit ${r.status}); run node hub/bin/hub.js nav later.`); return; }
  if (changed.length) {
    out('nav - the map of your Hub, now that everything is in place');
    for (const l of changed) out(`  ${l.replace(/^\s+/, '')}`);
    out();
    ctx.changes += changed.length;
  }
}

/* ------------------------------------------------------------------- office */

async function partOffice(ctx) {
  const { o, hub } = ctx;
  out('office - the office every session opened on the Hub shows up in');
  const actions = [];
  const c = config();
  const cfgFile = c.file();
  const envHome = process.env.WORKSPACE_HOME && process.env.WORKSPACE_HOME.trim();
  const wantHome = envHome ? path.resolve(envHome) : platformHome();
  let port;
  let officeHome;

  // 1. workspace.config.json: written when absent, never edited when present.
  if (!exists(cfgFile)) {
    port = o.officePort || await pickPort(wantHome);
    // A port chosen with --office-port that something else holds would be written into the settings
    // and then kept on every later run: refuse it now, before this part writes anything.
    if (o.officePort && !o.noStart && await portInUse(port) && !(await ourOfficeOn(wantHome, port))) {
      out(`  ! port ${port} is in use by something else, so the office could not start there. Nothing in this part was changed: run this again with another --office-port (any free number from 1024 up).`);
      ctx.failed.push('office');
      return;
    }
    officeHome = wantHome;
    const fresh = {
      _readme: 'Your WorkSpace settings, written by install.js. Say "set up my WorkSpace" in a chat on your Hub to add your brand, other computers and private folders (workspace.config.example.json lists every setting). Never commit this file: it names you and your computers.',
      owner: { name: ctx.owner || '' },
      machines: [{ name: ctx.machine, computer: c.thisComputer(), hub: true }],
      office: { port, home: wantHome },
    };
    out(`  + ${show(ctx, cfgFile)}: ${ctx.owner ? `${ctx.owner}'s office, ` : ''}this computer as ${ctx.machine} (the hub), port ${port}, the office's files in ${wantHome}`);
    actions.push(() => inst().writeJson(cfgFile, fresh));
  } else {
    let raw;
    try { raw = JSON.parse(fs.readFileSync(cfgFile, 'utf8').replace(/^\uFEFF/, '')); } catch (e) {
      out(`  ! ${cfgFile} is not valid JSON (${e.message}). It is kept as it is: fix it, then run this again.`);
      ctx.failed.push('office');
      return;
    }
    const cur = c.normalize(raw);
    const kept = [];
    if (ctx.owner && cur.owner.name !== ctx.owner) kept.push(`owner.name: yours is ${cur.owner.name ? `"${cur.owner.name}"` : 'not set'}; the installer would use "${ctx.owner}"`);
    else if (cur.owner.name) out(`  = owner.name ${cur.owner.name}`);
    const mine = cur.machines.find((m) => m.name === ctx.machine);
    if (mine) out(`  = machines: this computer is ${ctx.machine}${mine.hub ? ' (the hub)' : ''}`);
    else kept.push(`machines: yours has ${cur.machines.map((m) => m.name).join(', ')}, not ${ctx.machine}`);
    port = cur.office.port || DEFAULT_PORT;
    if (o.officePort && o.officePort !== port) kept.push(`office.port: yours is ${port}; the installer would use ${o.officePort}. The office uses yours.`);
    else out(`  = office.port ${port}`);
    const curHome = cur.office.home || platformHome();
    if (!samePath(curHome, wantHome)) kept.push(`office.home: yours is ${curHome}; the installer would use ${wantHome}`);
    else out(`  = office.home ${curHome}`);
    for (const k of kept) out(`  ! ${k}`);
    if (kept.length) out(`    (${show(ctx, cfgFile)} is yours and is kept as it is. To change it, say "set up my WorkSpace" in a chat.)`);
    officeHome = envHome ? path.resolve(envHome) : curHome;
  }
  ctx.port = port;
  ctx.officeHome = officeHome;

  // 2. The office's hooks in the Hub's own settings, so every session opened on the Hub reports.
  const sFile = path.join(hub, '.claude', 'settings.json');
  let settings = null;
  try { settings = inst().readJson(sFile); } catch (e) {
    out(`  ! ${show(ctx, sFile)} is not valid JSON (${e.message}). It is kept as it is, and the hooks were not added: fix it, then run this again.`);
    ctx.failed.push('office');
  }
  if (settings) {
    const missing = {};
    let total = 0;
    let n = 0;
    for (const [ev, list] of Object.entries(inst().officeHooks())) {
      for (const h of list) {
        total += 1;
        if (!inst().commandsIn(settings, ev).includes(h.command)) { (missing[ev] = missing[ev] || []).push(h); n += 1; }
      }
    }
    if (!n) out(`  = ${show(ctx, sFile)}: the office's ${total} hooks`);
    else {
      const had = exists(sFile);
      out(`  + ${show(ctx, sFile)}: ${n === total ? '' : `${n} of `}the office's ${total} hooks, so every session opened on the Hub shows on the floor${had ? ' (yours is backed up first)' : ''}`);
      actions.push(() => {
        const b = inst().backup(sFile);
        inst().addHooks(settings, missing);
        inst().writeJson(sFile, settings);
        for (const [ev, list] of Object.entries(missing)) {
          const added = ctx.record.hooks.added[ev] || [];
          for (const h of list) if (!added.includes(h.command)) added.push(h.command);
          ctx.record.hooks.added[ev] = added;
        }
        ctx.record.hooks.file = fwd(path.relative(hub, sFile));
        saveRecord(ctx);
        if (b) out(`  Your old settings are in ${path.basename(b)}.`);
      });
    }
  }

  // 3. The setup interview, where a session on the Hub finds it.
  const src = path.join(ROOT, '.claude', 'skills', 'workspace-setup');
  const files = filesUnder(src).map((rel) => ({ rel, buf: fs.readFileSync(path.join(src, ...rel.split('/'))) }));
  const a = planCopy(ctx, { dest: path.join(hub, '.claude', 'skills', 'workspace-setup'), files, kind: 'skill', name: 'workspace-setup', from: 'this workspace', why: '"set up my WorkSpace" in any chat on the Hub' });
  if (a) actions.push(a);

  // 4. Login start, when asked for.
  if (o.startup) {
    const t = inst().startupTarget();
    const cur = readText(t.file);
    const writeIt = () => {
      fs.mkdirSync(path.dirname(t.file), { recursive: true });
      fs.writeFileSync(t.file, t.text, 'utf8');
      ctx.record.startup = { file: fwd(t.file), hash: `sha256:${sha(t.text)}` };
      saveRecord(ctx);
    };
    if (cur === t.text) out(`  = login start: ${t.file}`);
    else if (cur === null) { out(`  + login start: ${t.file} (the office starts when you log in)`); actions.push(writeIt); }
    else if (ctx.record.startup && ctx.record.startup.hash === `sha256:${sha(cur)}`) { out(`  ~ login start: ${t.file}`); actions.push(writeIt); }
    else out(`  ! login start: ${t.file} is there and differs from ours; kept.`);
  }

  // 5. Start it, unless asked not to.
  let start = null;
  if (o.noStart) out('  The office is not started (--no-start). Start it with: node bin/office-start.js');
  else if (await ourOfficeOn(officeHome, port)) { out(`  = the office is running: http://127.0.0.1:${port}/`); ctx.officeUp = true; }
  else if (await portInUse(port)) {
    out(`  ! port ${port} is in use by something else, so the office cannot start there. Set office.port in ${show(ctx, cfgFile)} to a free port (any number from 1024 up), then run this again.`);
    ctx.failed.push('office');
  } else {
    out(`  + start the office: http://127.0.0.1:${port}/`);
    start = () => startOffice(ctx, port);
  }

  const n = actions.length + (start ? 1 : 0);
  if (!n) return;
  if (ctx.dry) { ctx.planned += n; return; }
  if (!(await goAhead(ctx, 'the office'))) { out('  Skipped.'); return; }
  for (const act of actions) act();
  ctx.changes += actions.length;
  if (start) { await start(); ctx.changes += 1; }
}

async function startOffice(ctx, port) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'office-start.js')], {
    cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 150000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const said = `${r.stdout || ''}${r.stderr || ''}`.trim();
  if (said) for (const l of said.split(/\r?\n/)) out(`  ${l}`);
  for (let i = 0; i < 40; i += 1) {
    if (await answers(port)) { out(`  The office answered: http://127.0.0.1:${port}/`); ctx.officeUp = true; return; }
    await new Promise((res) => setTimeout(res, 500));
  }
  out(`  The office did not answer within 20 seconds. Read office.log in ${ctx.officeHome}, then run node bin/office-start.js.`);
  ctx.failed.push('office');
}

/* ------------------------------------------------------------------- skills */

function readStarter() {
  const f = process.env.WORKSPACE_STARTER || path.join(ROOT, 'skills', 'starter.json');
  let s;
  try { s = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch (e) {
    throw new Refusal(`the starter list ${f} cannot be read (${e.message}).`);
  }
  if (!s || !/^[0-9a-f]{40}$/.test(String(s.ref)) || !Array.isArray(s.skills) || !s.pack) {
    throw new Refusal(`the starter list ${f} needs pack, ref (a full 40-character commit id) and skills.`);
  }
  s.path = s.path || 'skills';
  return s;
}

function normRemote(s) {
  let t = String(s || '').trim();
  if (!t) return '';
  const scp = /^[^/\\@]+@([^:/\\]+):(.+)$/.exec(t);
  if (scp) t = `https://${scp[1]}/${scp[2]}`;
  t = t.replace(/^ssh:\/\/[^@/]+@/i, 'https://');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) && !/^file:/i.test(t)) return t.toLowerCase().replace(/\/+$/, '').replace(/\.git$/, '');
  const p = fwd(path.resolve(t.replace(/^file:\/\//i, ''))).replace(/\/+$/, '').replace(/\/\.git$/, '');
  return process.platform === 'win32' || process.platform === 'darwin' ? p.toLowerCase() : p;
}

/** The files of one skill at the pinned commit, read from git's own objects (not the working tree). */
function packFiles(packDir, ref, sub) {
  const raw = git(packDir, ['ls-tree', '-r', '-z', ref, '--', `${sub}/`]);
  const files = [];
  for (const line of raw.split('\0').filter(Boolean)) {
    const m = /^(\d+) (\w+) ([0-9a-f]+)\t([\s\S]*)$/.exec(line);
    if (!m || m[2] !== 'blob') continue;
    const buf = execFileSync('git', ['cat-file', 'blob', m[3]], { cwd: packDir, windowsHide: true, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    files.push({ rel: m[4].slice(sub.length + 1), buf, exec: m[1] === '100755' });
  }
  return files;
}

const hasCommit = (dir, ref) => gitOk(dir, ['cat-file', '-e', `${ref}^{commit}`]);

async function partSkills(ctx) {
  const { o, hub } = ctx;
  const starter = readStarter();
  const source = o.skillsSource ? (/^[a-z][a-z0-9+.-]*:\/\/|^[^/\\@]+@[^:/\\]+:/i.test(o.skillsSource) ? o.skillsSource : path.resolve(expandHome(o.skillsSource))) : starter.pack;
  const ref = starter.ref;
  const short = ref.slice(0, 7);
  const packDir = path.join(hub, '50-AI', 'claude_skills');
  const dest = o.skillsScope === 'user' ? path.join(home().claudeHome(), 'skills') : path.join(hub, '.claude', 'skills');
  ctx.skillsDest = dest;
  ctx.packDir = packDir;
  out(`skills - ${starter.skills.length} starter skills from the claude_skills pack, pinned at commit ${short}`);

  const packActions = [];
  let ready = false; // the pinned commit can be read from packDir right now
  if (!exists(packDir)) {
    out(`  + ${show(ctx, packDir)}: a clone of ${source}, at ${short}`);
    packActions.push(() => {
      fs.mkdirSync(path.dirname(packDir), { recursive: true });
      git(path.dirname(packDir), ['clone', '-q', '--no-checkout', '--no-hardlinks', source, packDir]);
      if (!hasCommit(packDir, ref)) git(packDir, ['fetch', '-q', 'origin', ref]);
      git(packDir, ['checkout', '-q', '--detach', ref]);
    });
  } else if (!gitOk(packDir, ['rev-parse', '--git-dir']) || !exists(path.join(packDir, '.git'))) {
    out(`  ! ${show(ctx, packDir)} is there but is not a git clone; kept as it is. The starter skills come from it, so they were not copied.`);
    ctx.failed.push('skills');
    return;
  } else {
    let remote = '';
    try { remote = git(packDir, ['remote', 'get-url', 'origin']).trim(); } catch (_) { /* none */ }
    const head = (() => { try { return git(packDir, ['rev-parse', 'HEAD']).trim(); } catch (_) { return ''; } })();
    const dirty = (() => { try { return !!git(packDir, ['status', '--porcelain']).trim(); } catch (_) { return true; } })();
    const same = normRemote(remote) === normRemote(source);
    ready = hasCommit(packDir, ref);
    const at = head ? head.slice(0, 7) : 'no commit';
    if (head === ref) {
      out(`  = ${show(ctx, packDir)} at ${short}`);
      if (!same) out(`  ! ${show(ctx, packDir)} came from ${remote || 'somewhere unknown'}, not ${source}; kept. It is at the pinned commit, so its skills are the same.`);
    } else if (dirty) {
      out(`  ! ${show(ctx, packDir)} has changes of yours (it is at ${at}); kept as it is. The starter skills still come from ${short}.`);
    } else if (!same) {
      out(`  ! ${show(ctx, packDir)} is a clone of ${remote || 'something unknown'}, not ${source}; kept as it is (at ${at}).`);
    } else {
      out(`  ~ ${show(ctx, packDir)}: from ${at} to ${short}`);
      packActions.push(() => {
        if (!hasCommit(packDir, ref)) git(packDir, ['fetch', '-q', 'origin']);
        if (!hasCommit(packDir, ref)) git(packDir, ['fetch', '-q', 'origin', ref]);
        git(packDir, ['checkout', '-q', '--detach', ref]);
      });
    }
    if (!ready && !packActions.length) {
      // The commit is missing from a clone we keep as it is: fetching adds objects and changes no file of yours.
      packActions.push(() => { git(packDir, ['fetch', '-q', 'origin']); if (!hasCommit(packDir, ref)) git(packDir, ['fetch', '-q', 'origin', ref]); });
      out(`  + fetch ${short} into ${show(ctx, packDir)} (adds git objects; changes none of your files)`);
    }
  }

  const planCopies = (quietNew) => {
    const acts = [];
    for (const s of starter.skills) {
      const target = path.join(dest, s.name);
      let files;
      try { files = packFiles(packDir, ref, `${starter.path}/${s.name}`); } catch (e) { files = []; }
      if (!files.length) {
        out(`  ! ${s.name} is not in the pack at ${short}; skipped.`);
        ctx.failed.push('skills');
        continue;
      }
      if (quietNew && !exists(target)) {
        acts.push(() => {
          const a = planCopyQuiet(ctx, target, files, s, short);
          if (a) a();
        });
        continue;
      }
      const a = planCopy(ctx, { dest: target, files, kind: 'skill', name: s.name, from: `claude_skills@${short}`, why: s.why });
      if (a) acts.push(a);
    }
    return acts;
  };

  let copyActions = [];
  if (ready) copyActions = planCopies(false);
  else {
    for (const s of starter.skills) {
      const target = path.join(dest, s.name);
      if (!exists(target)) out(`  + ${show(ctx, target)}  ${s.why}`);
      else out(`  ! ${show(ctx, target)} is already there: kept unless it matches the pack's copy (checked once the pack is here)`);
    }
  }

  const n = packActions.length + (ready ? copyActions.length : starter.skills.filter((s) => !exists(path.join(dest, s.name))).length);
  if (!n) return;
  if (ctx.dry) { ctx.planned += n; return; }
  if (!(await goAhead(ctx, 'the skills'))) { out('  Skipped.'); return; }
  try {
    for (const act of packActions) act();
  } catch (e) {
    out(`  Could not get the pack from ${source}: ${String((e && e.stderr) || (e && e.message) || e).trim().split(/\r?\n/).pop()}`);
    ctx.failed.push('skills');
    return;
  }
  if (!ready) copyActions = planCopies(true);
  for (const act of copyActions) act();
  ctx.changes += n;
}

/** A copy into an empty place, planned after the pack arrived: its + line was printed already. */
function planCopyQuiet(ctx, target, files, s, short) {
  const write = () => {
    fs.mkdirSync(target, { recursive: true });
    for (const f of files) {
      const p = path.join(target, ...f.rel.split('/'));
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, f.buf);
      if (f.exec && process.platform !== 'win32') fs.chmodSync(p, 0o755);
    }
    ctx.record.copies[recordKey(ctx, target)] = {
      kind: 'skill', name: s.name, hash: hashEntries(files.map((f) => ({ rel: f.rel, sum: sha(f.buf) }))), from: `claude_skills@${short}`,
    };
    saveRecord(ctx);
  };
  return exists(target) ? null : write;
}

/* ------------------------------------------------------------------- agents */

const AGENTS_README = `# Your agents

One folder per specialist agent. Each one holds an \`agent.json\` that gives the agent an office in
the Agents' wing of your WorkSpace office: the office finds it by itself, with no list to edit.

Make a new one (run these from your Hub folder):

    node 50-AI/workspace/agents/bin/new-agent.js <key> --name <Name> --title "<What it does>"

Install one you were given (one of ours, or one a friend built):

    node 50-AI/workspace/agents/bin/install-agent.js <the package folder or file>

The guide: 50-AI/workspace/guides/08-agents.md
`;

async function partAgents(ctx) {
  const dir = path.join(ctx.hub, '50-AI', 'agents');
  const readme = path.join(dir, 'README.md');
  out('agents - the home of your specialist agents');
  if (exists(readme)) { out(`  = ${show(ctx, dir)}`); return; }
  out(`  + ${show(ctx, readme)}`);
  if (ctx.dry) { ctx.planned += 1; return; }
  if (!(await goAhead(ctx, 'the agents folder'))) { out('  Skipped.'); return; }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(readme, AGENTS_README, 'utf8');
  ctx.changes += 1;
}

/* -------------------------------------------------------------------- fleet */

async function partFleet(ctx) {
  const { o, asker } = ctx;
  let mode = o.fleet;
  if (!mode) {
    if (await asker.yesNo('Do you use more than one computer for this?', false)) {
      const first = await asker.yesNo('Is this the first of them (a new fleet)? Say no to join the fleet you started on another computer.', true);
      mode = first ? 'create' : 'join';
    } else mode = 'none';
  }
  if (mode === 'none') {
    out('fleet - not set up: one computer. Add more later with --fleet create, then --fleet join on each other one.');
    return;
  }
  out(`fleet - your computers working together (${mode === 'create' ? 'a new fleet' : 'joining your fleet'})`);
  const rel = 'fleet/bin/fleet.js';
  if (!exists(path.join(ROOT, ...rel.split('/')))) {
    out(`  This copy of the workspace has no ${rel}, so the fleet cannot be set up from it. Update it (git pull), or run again with --skip fleet.`);
    ctx.failed.push('fleet');
    return;
  }
  const fleetDir = path.join(ctx.hub, '50-AI', 'fleet-ops');
  const joined = exists(path.join(fleetDir, 'fleet.json')) && exists(path.join(fleetDir, 'machines', `${ctx.machine}.json`));
  const who = ['--hub', ctx.hub, '--machine', ctx.machine, '--role', ctx.role];
  let args = null;
  if (joined) out(`  = ${ctx.machine} is in the fleet (${show(ctx, fleetDir)})`);
  else if (mode === 'create') {
    let create = !!o.createRepo;
    if (!create && !ctx.dry) create = await asker.yesNo('Make the fleet\'s private repo (fleet-ops) on your GitHub account now? It stays private.', false);
    args = ['init'].concat(create ? ['--create-repo'] : [], who);
  } else {
    let repo = o.fleetRepo;
    if (!repo) repo = await asker.ask('Which fleet repo? (owner/name, for example alex-example/fleet-ops)', '');
    if (!repo) { out('  No fleet repo given, so this computer did not join. Run again with --fleet join --fleet-repo <owner/name>.'); ctx.failed.push('fleet'); return; }
    args = ['join', repo].concat(who);
  }
  if (args) out(`  + node ${rel} ${args.map((x) => (/\s/.test(x) ? `"${x}"` : x)).join(' ')}`);
  const sched = !ctx.record.fleet_schedule;
  if (!sched) out('  = the daily sync is scheduled');
  let wantSched = false;
  if (sched) {
    wantSched = ctx.dry ? true : await asker.yesNo('Set up the daily sync (this computer pulls and pushes the fleet repo once a day)?', true);
    if (wantSched) out(`  + node ${rel} schedule  (the daily sync)`);
  }
  const n = (args ? 1 : 0) + (wantSched ? 1 : 0);
  if (!n) return;
  if (ctx.dry) { ctx.planned += n; return; }
  if (!(await goAhead(ctx, 'the fleet'))) { out('  Skipped.'); return; }
  if (args) {
    const r = tool(rel, args, true);
    if (r.status !== 0) { out(`  The fleet tool stopped (exit ${r.status}).`); ctx.failed.push('fleet'); return; }
    ctx.changes += 1;
  }
  if (wantSched) {
    const r = tool(rel, ['schedule'], true);
    if (r.status !== 0) { out(`  The daily sync was not set up (exit ${r.status}).`); ctx.failed.push('fleet'); return; }
    ctx.record.fleet_schedule = true;
    saveRecord(ctx);
    ctx.changes += 1;
  }
}

/* ------------------------------------------------------------------- remove */

async function partRemove(ctx) {
  const { hub, o } = ctx;
  const r = ctx.record;
  out('remove - takes out what this installer added; everything that is yours stays');
  if (r._new) {
    out(`  There is no record of an install in this Hub (${show(ctx, recordFile(hub))}), so nothing is taken out.`);
    return;
  }
  const actions = [];
  const kept = [];

  // The hook entries it added, by their exact commands.
  const added = (r.hooks && r.hooks.added) || {};
  const sFile = path.join(hub, ...String((r.hooks && r.hooks.file) || '.claude/settings.json').split('/'));
  const count = Object.values(added).reduce((a, l) => a + l.length, 0);
  if (count && !o.skip.has('office')) {
    let settings = null;
    try { settings = inst().readJson(sFile); } catch (e) {
      out(`  ! ${show(ctx, sFile)} is not valid JSON (${e.message}); kept as it is, with the office's hooks still in it.`);
      ctx.failed.push('remove');
    }
    if (settings) {
      let n = 0;
      for (const [ev, cmds] of Object.entries(added)) n += inst().commandsIn(settings, ev).filter((cmd) => cmds.includes(cmd)).length;
      if (n) {
        out(`  - ${show(ctx, sFile)}: the office's ${n} hooks (yours stay; the file is backed up first)`);
        actions.push(() => {
          inst().backup(sFile);
          for (const [ev, cmds] of Object.entries(added)) {
            const groups = (settings.hooks && settings.hooks[ev]) || [];
            for (const g of groups) if (g && Array.isArray(g.hooks)) g.hooks = g.hooks.filter((h) => !(h && cmds.includes(h.command)));
            if (settings.hooks && settings.hooks[ev]) {
              settings.hooks[ev] = groups.filter((g) => !g || !Array.isArray(g.hooks) || g.hooks.length);
              if (!settings.hooks[ev].length) delete settings.hooks[ev];
            }
          }
          if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
          inst().writeJson(sFile, settings);
          r.hooks.added = {};
          saveRecord(ctx);
        });
      } else {
        actions.push(() => { r.hooks.added = {}; saveRecord(ctx); });
        out(`  = ${show(ctx, sFile)}: the office's hooks are not in it any more`);
      }
    }
  }

  // Login start, when it is still ours.
  if (r.startup && r.startup.file && !o.skip.has('office')) {
    const f = path.resolve(r.startup.file);
    const cur = readText(f);
    if (cur === null) { out(`  = login start: ${f} is gone already`); actions.push(() => { r.startup = null; saveRecord(ctx); }); }
    else if (`sha256:${sha(cur)}` === r.startup.hash) {
      out(`  - login start: ${f}`);
      actions.push(() => { fs.unlinkSync(f); r.startup = null; saveRecord(ctx); });
    } else { out(`  ! login start: ${f} was changed after the install; kept.`); kept.push(f); }
  }

  // The fleet's daily sync.
  if (r.fleet_schedule && !o.skip.has('fleet')) {
    const rel = 'fleet/bin/fleet.js';
    if (exists(path.join(ROOT, ...rel.split('/')))) {
      out(`  - the fleet's daily sync (node ${rel} schedule --remove)`);
      actions.push(() => {
        const t = tool(rel, ['schedule', '--remove'], true);
        if (t.status !== 0) { out(`  The daily sync was not removed (exit ${t.status}).`); ctx.failed.push('remove'); return; }
        r.fleet_schedule = false;
        saveRecord(ctx);
      });
    } else { out(`  ! the fleet's daily sync: this copy has no ${rel} to remove it with; kept.`); ctx.failed.push('remove'); }
  }

  // Each copy whose files still match what was written.
  if (!o.skip.has('skills')) {
    for (const [key, c] of Object.entries(r.copies || {})) {
      const p = fromKey(ctx, key);
      if (!exists(p)) { out(`  = ${show(ctx, p)} is gone already`); actions.push(() => { delete r.copies[key]; saveRecord(ctx); }); continue; }
      if (hashDir(p) === c.hash) {
        out(`  - ${show(ctx, p)}`);
        actions.push(() => { fs.rmSync(p, { recursive: true, force: true }); delete r.copies[key]; saveRecord(ctx); });
      } else { out(`  ! ${show(ctx, p)}  (you changed it; kept)`); kept.push(show(ctx, p)); }
    }
  }

  const changes = actions.length;
  if (changes && !ctx.dry) {
    if (await goAhead(ctx, 'the removal')) {
      for (const act of actions) act();
      ctx.changes += changes;
    } else out('  Skipped.');
  } else if (changes) ctx.planned += changes;

  out();
  out('Kept (yours, or yours to decide about):');
  out(`  ${hub}: the zones, CLAUDE.md, NAV.md and .hub/ (this computer's Hub marker and the install record)`);
  out(`  ${config().file()}: your office settings`);
  if (exists(path.join(hub, '50-AI', 'claude_skills'))) out(`  ${show(ctx, path.join(hub, '50-AI', 'claude_skills'))}: the skills pack clone`);
  if (exists(path.join(hub, '50-AI', 'agents'))) out(`  ${show(ctx, path.join(hub, '50-AI', 'agents'))}: your agents`);
  if (exists(path.join(hub, '50-AI', 'fleet-ops'))) out(`  ${show(ctx, path.join(hub, '50-AI', 'fleet-ops'))}: your fleet repo (still private, still on GitHub)`);
  out(`  ${platformHomeFor()}: the office's own files (notes, questions, chat)`);
  for (const k of kept) out(`  ${k}: changed by you`);
  out('  A running office keeps running until you restart the computer.');
}

function platformHomeFor() {
  try { return home().homeDir(); } catch (_) { return platformHome(); }
}

/* --------------------------------------------------------------------- main */

function summary(ctx) {
  const addr = ctx.port ? `http://127.0.0.1:${ctx.port}/` : null;
  out(ctx.dry ? 'After the install:' : 'What is where:');
  out(`  Your Hub              ${ctx.hub}`);
  if (addr) out(`  The office            ${addr}${ctx.dry || ctx.officeUp ? '' : '   (not running: node bin/office-start.js in the workspace folder)'}`);
  if (ctx.officeHome) out(`  The office's files    ${ctx.officeHome}`);
  out(`  Office settings       ${config().file()}`);
  if (ctx.skillsDest) out(`  Starter skills        ${ctx.skillsDest}`);
  if (ctx.packDir) out(`  The skills pack       ${ctx.packDir}`);
  out(`  Your agents           ${path.join(ctx.hub, '50-AI', 'agents')}`);
  out(`  The install record    ${recordFile(ctx.hub)}`);
  out();
  out('Next:');
  out(`  1. Open your Hub folder in VS Code (File, Open Folder, then ${ctx.hub}), or in the Claude desktop app`);
  out('     (the Code tab, then choose that folder), and start a chat.');
  out(`  2. Open ${addr || 'the office'} in your browser. Your chat is a person at a desk on the Floor.`);
  out('  3. In the chat, say "set up my WorkSpace". Then open the Work tab and start Get started.');
}

async function run(o, asker) {
  const ctx = { o, asker, dry: !!o.dryRun, changes: 0, planned: 0, failed: [] };
  if (o.remove) out(`Taking out the WilsonWorks Workspace parts this installer added.${ctx.dry ? ' Dry run: nothing is written.' : ''}`);
  else out(`Installing the WilsonWorks Workspace.${ctx.dry ? ' Dry run: this shows the plan and writes nothing.' : ''}`);
  if (!asker.interactive && !o.yes) out('Nobody is at the keyboard to answer, so every question takes its default: your files are kept, and no fleet is set up.');
  out();

  if (!o.remove && !o.skip.has('check')) {
    partCheck(ctx);
    out();
    if (ctx.failed.includes('check')) { out('Install what is missing above, then run this again.'); return 1; }
  }

  ctx.hub = await resolveHub(ctx);
  ctx.record = readRecord(ctx.hub);

  if (o.remove) await partRemove(ctx);
  else {
    await identity(ctx);
    await partHub(ctx); out();
    if (o.skip.has('office')) out('office - skipped (--skip office)'); else await partOffice(ctx);
    out();
    if (o.skip.has('skills')) out('skills - skipped (--skip skills)'); else await partSkills(ctx);
    out();
    if (o.skip.has('agents')) out('agents - skipped (--skip agents)'); else await partAgents(ctx);
    out();
    if (o.skip.has('fleet')) out('fleet - skipped (--skip fleet)'); else await partFleet(ctx);
    out();
    navLast(ctx);
    summary(ctx);
  }

  out();
  const failed = [...new Set(ctx.failed)];
  if (ctx.dry) out(ctx.planned ? `Dry run: nothing was written. ${ctx.planned} change(s) planned.` : 'Dry run: nothing to change.');
  else out(ctx.changes ? `${ctx.changes} change(s) made.` : 'Nothing changed.');
  if (failed.length) { out(`Not finished: ${failed.join(', ')}. Each one says why above.`); return 1; }
  return 0;
}

async function main(argv) {
  let o;
  try { o = parseArgs(argv || [], { interactive: !!process.stdin.isTTY }); } catch (e) {
    if (e instanceof Refusal) { out(`NOT DONE: ${e.message}`); return 2; }
    throw e;
  }
  if (o.help) { out(HELP); return 0; }
  const asker = makeAsker(o);
  try {
    return await run(o, asker);
  } catch (e) {
    if (e instanceof Refusal) { out(`NOT DONE: ${e.message}`); return 2; }
    out(`FAILED: ${(e && e.message) || e}`);
    return 1;
  } finally {
    asker.close();
  }
}

if (require.main === module) main(process.argv.slice(2)).then((code) => { process.exitCode = code; });

module.exports = { main, parseArgs, hashDir, hashEntries, normRemote };
