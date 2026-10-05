'use strict';

/**
 * fleet.js (the API; fleet/bin/fleet.js is its command line) — several computers working together
 * through one private git repo of the person's own, cloned at <Hub>/50-AI/fleet-ops on each of them.
 * The repo's shape is in docs/ARCHITECTURE.md ("The fleet repo"); its seed is fleet/template/.
 *
 *   init      the first computer: create the private repo on GitHub (only after a typed yes, or
 *             --create-repo; never public), seed it, push main, clone it into the Hub, register.
 *   join      each further computer: clone it, check it is a fleet, register.
 *   sync      the daily sync (after hub-sync): heartbeat first; stage only this computer's own files
 *             and stop on anything else (exit 3); commit; pull --rebase, and on a conflict abort it
 *             (exit 4), never leaving a half-rebased clone; push, once more after a rejection.
 *   post, handoff, pickup, done, board, claim, finish, archive, status, schedule, remove.
 *
 * A computer writes only its own files: machines/<NAME>.json, heartbeats/<NAME>.json,
 * comms/<NAME>.md, and the work orders and handoffs whose front matter names it (from, filed_by,
 * taken_by, claimed_by, archived_by). The sync commits nothing else.
 *
 * The Hub is opts.hub, else hub/lib/root.js. This computer's fleet name is opts.machine, else the one
 * it joined under (.sync/self.json in the clone, never shared), else the registered machine whose
 * `computer` is this one, else .hub/hub.json `machine`, else the computer's own name. The role
 * defaults the same way, then to command (init) or builder (join). Commits use the person's own git
 * identity; when none is set, a repo-local one: `<NAME> fleet`, `<name>@fleet.invalid`.
 *
 * Every command is async and resolves to its exit code: 0 done (or plan shown), 1 failed, 2 refused,
 * 3 stopped on files that are not this computer's, 4 stopped on a conflict. opts.dryRun writes and
 * runs nothing. opts.out prints a line; opts.ask(question) resolves true, false or null (no one to
 * ask). opts.gh replaces the GitHub command line (tests). FLEET_SCHEDULER=print makes `schedule`
 * and `remove` print the scheduler commands and run none. FLEET_OFFICE_PROBE=0 skips asking the
 * local office whether it answers.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const root = require('../../hub/lib/root');
const view = require('../../src/server/fleet');
const officeConfig = require('../../src/server/config');

const OK = 0;
const FAILED = 1;
const REFUSED = 2;
const DIRTY = 3;
const CONFLICT = 4;

const TEMPLATE_DIR = path.join(__dirname, '..', 'template');
const CLI = path.join(__dirname, '..', 'bin', 'fleet.js');
const TASK_NAME = 'WilsonWorks Fleet Sync';
const PLIST_LABEL = 'com.wilsonworks.fleet-sync';
const DESCRIPTION = 'Private fleet repo: how my computers share work (WilsonWorks Workspace)';
const ROLES = ['command', 'builder', 'mobile'];
const NAME_RE = /^[A-Z0-9][A-Z0-9-]{0,23}$/;
const REPO_NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;
const OWNER_REPO_RE = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const ITEM_RE = /^(board\/(backlog|doing|done|archive)|handoffs\/(open|taken|done))\/[^/]+\.md$/;
const OWNER_KEYS = ['from', 'filed_by', 'taken_by', 'claimed_by', 'archived_by'];
const MAX_NOTE_BYTES = 64 * 1024;

class Stop extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/* ----------------------------------------------------------------------------- small helpers */

const p2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const compact = (d) => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;

/** The computer's local time with its zone: "2026-10-05 14:30 CDT". */
function localStamp(d) {
  let zone = '';
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(d).find((x) => x.type === 'timeZoneName');
    zone = part ? part.value : '';
  } catch (_) { /* no Intl: the time alone */ }
  return `${ymd(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}${zone ? ` ${zone}` : ''}`;
}

function slug(t) {
  return String(t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'note';
}

const firstLine = (s) => String(s || '').trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || 'no reason given';
const posix = (p) => String(p).split(path.sep).join('/');

/** An environment variable, case-insensitively on Windows (a copied env keeps "Path" as written). */
function envGet(env, key) {
  if (env[key] != null) return env[key];
  if (process.platform !== 'win32') return undefined;
  const k = Object.keys(env).find((x) => x.toUpperCase() === key);
  return k ? env[k] : undefined;
}

function readIf(file) { try { return fs.readFileSync(file, 'utf8').replace(/^﻿/, ''); } catch (_) { return null; } }
function readJsonIf(file) { const t = readIf(file); if (t == null) return null; try { return JSON.parse(t); } catch (_) { return null; } }
function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}
const writeJson = (file, obj) => writeText(file, `${JSON.stringify(obj, null, 2)}\n`);

/** A front matter value, quoted when YAML would read it as something else. */
function yamlValue(v) {
  const s = String(v == null ? '' : v);
  if (s === '') return '';
  return /^[A-Za-z0-9_.\/ -]+$/.test(s) && s.trim() === s && !/^(true|false|null|yes|no|on|off|~)$/i.test(s) ? s : JSON.stringify(s);
}

/** Set `key: value` lines in a markdown file's front matter, keeping the rest as it is. */
function setFront(text, values) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const lines = m ? m[1].split(/\r?\n/) : [];
  for (const [k, v] of Object.entries(values)) {
    const line = `${k}:${v == null || v === '' ? '' : ` ${yamlValue(v)}`}`;
    const i = lines.findIndex((l) => l.startsWith(`${k}:`));
    if (i >= 0) lines[i] = line; else lines.push(line);
  }
  return `---\n${lines.join('\n')}\n---${m ? text.slice(m[0].length) : `\n${text}`}`;
}

/** A file from fleet/template/templates, comments dropped, {{placeholders}} filled. */
function render(name, values) {
  const t = fs.readFileSync(path.join(TEMPLATE_DIR, 'templates', name), 'utf8').replace(/\r\n/g, '\n')
    .replace(/<!--[\s\S]*?-->\n?/g, '');
  return t.replace(/\{\{(\w+)\}\}/g, (_, k) => (values[k] == null ? '' : String(values[k])));
}

/** Text a person typed, made safe to sit under a `## ` heading of its own. */
const noteText = (t) => String(t || '').replace(/\r\n/g, '\n').trim().replace(/^(#{1,6}[ \t])/gm, '\\$1');

/* ------------------------------------------------------------------------- running programs */

function run(cmd, args, o) {
  const opt = o || {};
  const r = spawnSync(cmd, args || [], {
    cwd: opt.cwd, env: opt.env || process.env, encoding: 'utf8', windowsHide: true,
    timeout: opt.timeout || 180000, shell: !!opt.shell,
  });
  return { status: typeof r.status === 'number' ? r.status : -1, stdout: r.stdout || '', stderr: `${r.stderr || ''}${r.error ? r.error.message : ''}` };
}

/** Where a command is on PATH (with PATHEXT on Windows, so a gh.cmd counts), or null. */
function which(cmd, env) {
  const e = env || process.env;
  const dirs = String(envGet(e, 'PATH') || '').split(path.delimiter).filter(Boolean);
  const exts = process.platform === 'win32' ? String(envGet(e, 'PATHEXT') || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : [''];
  for (const d of dirs) {
    for (const x of exts) {
      const f = path.join(d.replace(/^"|"$/g, ''), cmd + x);
      try { if (fs.statSync(f).isFile()) return f; } catch (_) { /* the next one */ }
    }
  }
  return null;
}

/** One argument for cmd.exe: bare when it is plain, else in double quotes. */
const cmdQuote = (a) => (/^[A-Za-z0-9_\-./:\\=@,+]+$/.test(String(a)) ? String(a) : `"${String(a).replace(/"/g, '""')}"`);

/** A function that runs the GitHub command line, or null when it is not installed. */
function ghRunner(env) {
  const file = which('gh', env);
  if (!file) return null;
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(file)) {
    return (args) => run([file].concat(args).map(cmdQuote).join(' '), [], { env, shell: true });
  }
  return (args) => run(file, args, { env });
}

/** A command line as you would type it (Windows quoting rules, which macOS shells also accept here). */
function display(cmd, args) {
  return [cmd].concat(args).map((a) => {
    const s = String(a);
    if (s && !/[\s"]/.test(s)) return s;
    return `"${s.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
  }).join(' ');
}

/* --------------------------------------------------------------------------------- context */

function readSelf(dir) {
  const j = readJsonIf(path.join(dir, '.sync', 'self.json'));
  return j && typeof j.name === 'string' ? j.name : null;
}

function context(o, defaults) {
  const env = o.env || process.env;
  let hub;
  if (o.hub) {
    hub = path.resolve(o.hub);
    if (!root.isHub(hub)) throw new Stop(REFUSED, `${hub} is not a Hub: it has no .hub/hub.json. Point --hub at your Hub folder, or run the installer first.`);
  } else {
    try { hub = root.resolveHubRoot({ env }); } catch (e) { throw new Stop(REFUSED, `${e.message} Or pass --hub <your Hub folder>.`); }
  }
  const hubJson = root.readHub(hub) || {};
  const dir = path.join(hub, '50-AI', 'fleet-ops');
  const computer = officeConfig.wallName(o.computer || envGet(env, 'COMPUTERNAME') || os.hostname());
  const name = officeConfig.wallName(o.machine || readSelf(dir) || view.selfIn(dir, null, computer) || hubJson.machine || computer);
  if (!NAME_RE.test(name)) throw new Stop(REFUSED, `"${name}" can't be a computer's name here. Use capitals, digits and hyphens, at most 24 (for example DESK or MINI-2).`);
  const mine = readJsonIf(path.join(dir, 'machines', `${name}.json`));
  const role = String(o.role || (!(defaults && defaults.fresh) && mine && mine.role) || hubJson.role || (defaults && defaults.role) || 'builder').toLowerCase();
  if (!ROLES.includes(role)) throw new Stop(REFUSED, `The role must be command, builder or mobile, not "${role}".`);
  return {
    env, gitEnv: Object.assign({}, env, { GIT_TERMINAL_PROMPT: '0' }),
    hub, hubJson, dir, computer, name, role,
    out: o.out || ((s) => process.stdout.write(`${s}\n`)),
    ask: o.ask || (async () => null),
    now: () => new Date(),
    dryRun: !!o.dryRun, yes: !!o.yes, quiet: !!o.quiet,
    gh: o.gh, probe: o.probe,
  };
}

function git(ctx, args, o) { return run('git', ['-C', ctx.dir].concat(args), Object.assign({ env: ctx.gitEnv }, o)); }
function gitOk(ctx, args, what) {
  const r = git(ctx, args);
  if (r.status !== 0) throw new Stop(FAILED, `git could not ${what || args[0]} in ${ctx.dir}: ${firstLine(r.stderr || r.stdout)}`);
  return r;
}

const hasClone = (ctx) => view.isFleet(ctx.dir);
function needClone(ctx) {
  if (!hasClone(ctx)) {
    throw new Stop(REFUSED, 'This Hub has no fleet yet. On your first computer, start one with: fleet init. '
      + 'On each of the others: fleet join <your GitHub name>/fleet-ops.');
  }
}
const relHub = (ctx, p) => posix(path.relative(ctx.hub, p)) || '.';

/** The person's own git identity; when none is set, a repo-local one named for this computer. */
function ensureIdentity(ctx) {
  const name = git(ctx, ['config', 'user.name']).stdout.trim();
  const email = git(ctx, ['config', 'user.email']).stdout.trim();
  if (!name) gitOk(ctx, ['config', 'user.name', `${ctx.name} fleet`], 'set a commit name');
  if (!email) gitOk(ctx, ['config', 'user.email', `${ctx.name.toLowerCase()}@fleet.invalid`], 'set a commit email');
}

function writeSelf(ctx) {
  try { writeJson(path.join(ctx.dir, '.sync', 'self.json'), { name: ctx.name }); } catch (_) { /* the other ways still find the name */ }
}

/* ------------------------------------------------------------------------------- the sync */

/** Every changed path in the clone: [{ xy, path, from }] (from: the old name of a move). */
function changes(ctx) {
  const r = gitOk(ctx, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], 'read what changed');
  const parts = r.stdout.split('\0');
  const out = [];
  for (let i = 0; i < parts.length; i += 1) {
    const e = parts[i];
    if (!e || e.length < 4) continue;
    const xy = e.slice(0, 2);
    const p = e.slice(3);
    if (xy[0] === 'R' || xy[0] === 'C') { out.push({ xy, path: p, from: parts[i + 1] }); i += 1; } else out.push({ xy, path: p });
  }
  return out.filter((c) => !c.path.startsWith('.sync/'));
}

const fixedFiles = (name) => [`machines/${name}.json`, `heartbeats/${name}.json`, `comms/${name}.md`];

/** Is this change this computer's to send? An item is judged by its front matter where it is now. */
function ownChange(ctx, ch, all) {
  for (const p of [ch.path, ch.from].filter(Boolean)) {
    if (fixedFiles(ctx.name).includes(p)) continue;
    if (!ITEM_RE.test(p)) return false;
    let text = readIf(path.join(ctx.dir, ch.path));
    if (text == null) {
      const twin = all.find((c) => c !== ch && path.posix.basename(c.path) === path.posix.basename(p) && fs.existsSync(path.join(ctx.dir, c.path)));
      if (twin) text = readIf(path.join(ctx.dir, twin.path));
    }
    if (text == null) text = git(ctx, ['show', `HEAD:${p}`]).stdout;
    const f = view.parseFront(text || '').front;
    if (!OWNER_KEYS.some((k) => f[k] === ctx.name)) return false;
  }
  return true;
}

function stage(ctx, list) {
  const paths = [...new Set(list.flatMap((c) => [c.path, c.from].filter(Boolean)))];
  const here = paths.filter((p) => fs.existsSync(path.join(ctx.dir, p)));
  const gone = paths.filter((p) => !here.includes(p));
  if (here.length) gitOk(ctx, ['add', '--'].concat(here), 'stage this computer\'s files');
  if (gone.length) gitOk(ctx, ['rm', '--cached', '--quiet', '--ignore-unmatch', '--'].concat(gone), 'stage the moved files');
}

function gitDir(ctx) {
  const r = git(ctx, ['rev-parse', '--git-dir']);
  return path.resolve(ctx.dir, r.stdout.trim() || '.git');
}
function rebasing(ctx) {
  const g = gitDir(ctx);
  return fs.existsSync(path.join(g, 'rebase-merge')) || fs.existsSync(path.join(g, 'rebase-apply'));
}

/** git pull --rebase. A conflict is aborted at once: the clone is left exactly as it was. */
function pullRebase(ctx) {
  const r = git(ctx, ['pull', '--rebase', '--quiet', 'origin', 'main']);
  if (r.status === 0) return { ok: true };
  if (!rebasing(ctx)) return { ok: false, error: firstLine(r.stderr || r.stdout) };
  const paths = git(ctx, ['diff', '--name-only', '--diff-filter=U']).stdout.split(/\r?\n/).filter(Boolean);
  git(ctx, ['rebase', '--abort']);
  if (rebasing(ctx)) git(ctx, ['rebase', '--abort']);
  return { ok: false, conflict: true, paths: paths.length ? paths : ['(git did not name the files)'], stuck: rebasing(ctx) };
}

const rejected = (s) => /\[rejected\]|non-fast-forward|fetch first|updates were rejected/i.test(s);

function record(ctx, result, exit, note, paths) {
  const d = ctx.now();
  try {
    writeJson(path.join(ctx.dir, '.sync', 'last.json'), { at: d.toISOString(), local: localStamp(d), result, exit, note: note || null });
    for (const flag of ['DIRTY', 'CONFLICT']) {
      const f = path.join(ctx.dir, '.sync', flag);
      if (result === flag.toLowerCase()) writeText(f, `${localStamp(d)}\n${note}\n${(paths || []).map((p) => `  ${p}`).join('\n')}\n`);
      else if (result === 'ok') fs.rmSync(f, { force: true });
    }
  } catch (_) { /* the exit code still says it */ }
}

/** Does the office on this computer answer? 'up', 'down', or null when not asked. */
function officeState(ctx) {
  if (ctx.probe === false || /^(0|off|no|false)$/i.test(String(envGet(ctx.env, 'FLEET_OFFICE_PROBE') || ''))) return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: officeConfig.officePort(), path: '/manifest.webmanifest', timeout: 1500 }, (res) => { res.resume(); resolve('up'); });
    req.on('timeout', () => { req.destroy(); resolve('down'); });
    req.on('error', () => resolve('down'));
  });
}

/** Counts only: never a title, so the heartbeat says nothing about private work. */
function writeHeartbeat(ctx, office) {
  const d = ctx.now();
  const prev = readJsonIf(path.join(ctx.dir, '.sync', 'last.json'));
  const open = view.readItems(ctx.dir, 'handoffs', 'open').items;
  const board = {};
  for (const s of view.BOARD) board[s] = view.readItems(ctx.dir, 'board', s, 0).count;
  writeJson(path.join(ctx.dir, 'heartbeats', `${ctx.name}.json`), {
    machine: ctx.name, role: ctx.role, at: d.toISOString(), local: localStamp(d),
    last_sync: prev && prev.result ? { at: prev.at || null, result: prev.result } : null,
    handoffs_waiting: open.filter((h) => h.to === ctx.name || h.to === 'any').length,
    handoffs_open: open.length,
    board,
    office,
  });
}

/** The sync itself. message: the commit message. */
async function syncCore(ctx, opts) {
  const o = opts || {};
  const say = (s) => { if (!ctx.quiet) ctx.out(s); };
  ensureIdentity(ctx);
  writeHeartbeat(ctx, await officeState(ctx));

  const all = changes(ctx);
  const foreign = all.filter((c) => !ownChange(ctx, c, all));
  if (foreign.length) {
    const paths = foreign.map((c) => (c.from ? `${c.from} -> ${c.path}` : c.path));
    record(ctx, 'dirty', DIRTY, `files that are not ${ctx.name}'s changed`, paths);
    ctx.out(`Sync stopped. These files changed, and they are not ${ctx.name}'s to send:`);
    for (const p of paths) ctx.out(`  ${p}`);
    ctx.out('Nothing was committed. Put each one back as it was, or leave it for the computer it belongs to, then run fleet sync again.');
    return DIRTY;
  }
  stage(ctx, all);
  if (git(ctx, ['diff', '--cached', '--quiet']).status === 1) {
    gitOk(ctx, ['commit', '--quiet', '-m', o.message || `fleet[${ctx.name}]: sync ${ymd(ctx.now())}`], 'commit');
  }

  const stopConflict = (paths, stuck) => {
    record(ctx, 'conflict', CONFLICT, 'another computer changed the same file', paths);
    ctx.out(`Sync stopped. Another computer changed the same file${paths.length > 1 ? 's' : ''}: ${paths.join(', ')}.`);
    ctx.out(stuck
      ? `The pull could not be undone by itself. Nothing was pushed. Ask a person to look at ${ctx.dir} before anything else touches it.`
      : 'The pull was undone, so this copy is exactly as it was before. Nothing was pushed. Write one line about it in your comms file, leave that file alone, and ask a person to sort it out.');
    return CONFLICT;
  };
  const stopFailed = (what, why) => {
    record(ctx, 'failed', FAILED, `could not ${what}: ${why}`);
    ctx.out(`Sync failed: could not ${what} (${why}). Your changes are committed here and go out with the next sync.`);
    if (what.startsWith('push') && /auth|credential|permission|403|could not read username/i.test(why)) {
      ctx.out('If GitHub asked who you are: run gh auth setup-git once, then fleet sync again.');
    }
    return FAILED;
  };

  let p = pullRebase(ctx);
  if (!p.ok) return p.conflict ? stopConflict(p.paths, p.stuck) : stopFailed('pull from GitHub', p.error);
  let r = git(ctx, ['push', '--quiet', 'origin', 'HEAD:main']);
  if (r.status !== 0) {
    if (!rejected(r.stderr)) return stopFailed('push to GitHub', firstLine(r.stderr));
    // Another computer pushed in between: pull and push once more.
    p = pullRebase(ctx);
    if (!p.ok) return p.conflict ? stopConflict(p.paths, p.stuck) : stopFailed('pull from GitHub', p.error);
    r = git(ctx, ['push', '--quiet', 'origin', 'HEAD:main']);
    if (r.status !== 0) {
      return rejected(r.stderr) ? stopConflict(['(GitHub refused the push twice: another computer kept pushing)'], false)
        : stopFailed('push to GitHub', firstLine(r.stderr));
    }
  }
  record(ctx, 'ok', OK, null);
  const machines = view.registeredMachines(ctx.dir).filter((m) => m.status !== 'left').length;
  const waiting = view.readItems(ctx.dir, 'handoffs', 'open').items.filter((h) => h.to === ctx.name || h.to === 'any').length;
  say(`Synced ${ctx.name}. ${machines} computer${machines === 1 ? '' : 's'} in the fleet; ${waiting} handoff${waiting === 1 ? '' : 's'} waiting for ${ctx.name}.`);
  return OK;
}

/** The latest from GitHub before reading: a plain pull when there is nothing of ours to send, else a sync. */
async function refresh(ctx) {
  const ahead = Number(git(ctx, ['rev-list', '--count', '@{u}..HEAD']).stdout.trim()) || 0;
  if (changes(ctx).length || ahead) return syncCore(Object.assign({}, ctx, { quiet: true }), {});
  const p = pullRebase(ctx);
  if (p.ok) return OK;
  ctx.out(p.conflict ? 'Could not pull: a conflict (undone; nothing changed here).' : `Could not reach GitHub (${p.error}).`);
  return p.conflict ? CONFLICT : FAILED;
}

/* ------------------------------------------------------------------------- init, join, seed */

/** Every file of the template, as paths relative to it ('/'-separated). */
function templateFiles() {
  const out = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(TEMPLATE_DIR, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(r); else if (e.isFile()) out.push(r);
    }
  };
  walk('');
  return out.sort();
}

function templateText(rel, date) {
  const t = fs.readFileSync(path.join(TEMPLATE_DIR, rel), 'utf8').replace(/\r\n/g, '\n');
  return rel === 'fleet.json' ? t.replace('{{date}}', date) : t;
}

/** The seed, file by file: + to add, = there, ! yours differs (kept). */
function seedPlan(ctx) {
  const date = ymd(ctx.now());
  return templateFiles().map((rel) => {
    const want = templateText(rel, date);
    const have = readIf(path.join(ctx.dir, rel));
    let mark = '+';
    if (have != null) {
      if (rel === 'fleet.json') { const j = readJsonIf(path.join(ctx.dir, rel)); mark = j && j.format === 1 ? '=' : '!'; } else mark = have.replace(/\r\n/g, '\n') === want ? '=' : '!';
    }
    const shown = rel.endsWith('/.gitkeep') ? rel.slice(0, -'.gitkeep'.length) : rel;
    return { rel, want, mark, shown };
  });
}

function codeZoneRel(ctx) {
  try { return posix(path.relative(ctx.hub, root.codeZone(ctx.hub))); } catch (_) { return ctx.hubJson.code_zone || root.DEFAULT_CODE_ZONE; }
}

/** This computer in machines/, its comms file and its heartbeat; then sync. */
async function register(ctx, opts) {
  const o = opts || {};
  const file = path.join(ctx.dir, 'machines', `${ctx.name}.json`);
  const mine = readJsonIf(file);
  if (mine && mine.computer && officeConfig.wallName(mine.computer) !== ctx.computer && mine.status !== 'left') {
    throw new Stop(REFUSED, `${ctx.name} is already the name of another computer in this fleet. Give this one its own name with --machine <NAME>.`);
  }
  const others = view.registeredMachines(ctx.dir).filter((m) => m.name !== ctx.name && m.status !== 'left');
  const officeHub = mine && mine.status !== 'left' ? mine.office_hub === true
    : !others.some((m) => m.office_hub) && (o.first || ctx.role === 'command');
  const want = {
    name: ctx.name, role: ctx.role, computer: ctx.computer, os: process.platform, hub_root: ctx.hub,
    code_zone: codeZoneRel(ctx), office_hub: officeHub, joined: (mine && mine.joined) || ymd(ctx.now()), status: 'active',
  };
  const same = !!mine && Object.keys(want).every((k) => mine[k] === want[k]) && !mine.left;
  const comms = path.join(ctx.dir, 'comms', `${ctx.name}.md`);
  const hasComms = fs.existsSync(comms);
  const hb = path.join(ctx.dir, 'heartbeats', `${ctx.name}.json`);
  ctx.out(`  ${same ? '=' : mine ? '~' : '+'} machines/${ctx.name}.json  (${ctx.role}${officeHub ? ', the office hub' : ''})`);
  ctx.out(`  ${hasComms ? '=' : '+'} comms/${ctx.name}.md`);
  if (same && hasComms) {
    ctx.out(`  ${fs.existsSync(hb) ? '=' : '+'} heartbeats/${ctx.name}.json  (written by every sync)`);
    if (!ctx.dryRun) writeSelf(ctx);
    ctx.out('Nothing changed.');
    return OK;
  }
  ctx.out(`  ${fs.existsSync(hb) ? '~' : '+'} heartbeats/${ctx.name}.json`);
  if (ctx.dryRun) { ctx.out('Dry run: nothing was written.'); return OK; }
  const keep = mine ? Object.fromEntries(Object.entries(mine).filter(([k]) => !(k in want) && k !== 'left')) : {};
  writeJson(file, Object.assign(want, keep));
  if (!hasComms) {
    const d = ctx.now();
    writeText(comms, `# ${ctx.name}: comms\n\nNotes from ${ctx.name}, newest at the bottom. Only ${ctx.name} writes in this file.\n\n`
      + render('comms-entry.md', { when: localStamp(d), text: `Joined the fleet as ${ctx.role}.` }));
  }
  writeSelf(ctx);
  return syncCore(ctx, { message: `fleet[${ctx.name}]: join ${ymd(ctx.now())}` });
}

function needGh(ctx) {
  const gh = ctx.gh || ghRunner(ctx.env);
  if (!gh) {
    throw new Stop(REFUSED, 'The GitHub command line (gh) is not installed. Get it from https://cli.github.com, sign in with: '
      + 'gh auth login, then run this again. Or name the repo yourself with --remote <url>.');
  }
  if (gh(['auth', 'status']).status !== 0) {
    throw new Stop(REFUSED, 'gh is installed but not signed in to GitHub. Sign in with: gh auth login, then run this again.');
  }
  return gh;
}

function ghLogin(gh) {
  const r = gh(['api', 'user', '--jq', '.login']);
  const login = r.stdout.trim();
  if (r.status !== 0 || !/^[A-Za-z0-9-]{1,39}$/.test(login)) throw new Stop(FAILED, `Could not read your GitHub user name (gh api user): ${firstLine(r.stderr)}. Check: gh auth status`);
  return login;
}

/** 'PRIVATE', 'PUBLIC', 'INTERNAL', or null when the repo is not there. */
function visibility(gh, full) {
  const r = gh(['repo', 'view', full, '--json', 'visibility', '--jq', '.visibility']);
  if (r.status === 0) return r.stdout.trim().toUpperCase() || 'UNKNOWN';
  if (/could not resolve|not found|404/i.test(`${r.stderr}${r.stdout}`)) return null;
  throw new Stop(FAILED, `Could not ask GitHub about ${full}: ${firstLine(r.stderr)}`);
}

function refusePublic(full, vis) {
  throw new Stop(REFUSED, `${full} is ${String(vis).toLowerCase()} on GitHub. A fleet repo must be private: it names your computers `
    + 'and your work. Make it private on github.com (Settings, then Change visibility), or use another name with --name.');
}

function cloneInto(ctx, how) {
  const r = how.gh ? how.gh(['repo', 'clone', how.full, ctx.dir]) : run('git', ['clone', '--quiet', how.remote, ctx.dir], { env: ctx.gitEnv });
  if (r.status !== 0 || !fs.existsSync(path.join(ctx.dir, '.git'))) {
    throw new Stop(FAILED, `Could not clone ${how.full || how.remote}: ${firstLine(r.stderr || r.stdout)}`);
  }
}

function folderInTheWay(ctx) {
  let names = [];
  try { names = fs.readdirSync(ctx.dir); } catch (_) { return false; }
  return names.length > 0;
}

/** Commit and push the seed files that were added. */
function pushSeed(ctx, added, message) {
  if (!added.length) return;
  gitOk(ctx, ['add', '--'].concat(added), 'stage the fleet\'s files');
  gitOk(ctx, ['commit', '--quiet', '-m', message], 'commit the fleet\'s files');
  const r = git(ctx, ['push', '--quiet', '-u', 'origin', 'main']);
  if (r.status !== 0) {
    throw new Stop(FAILED, `Could not push to GitHub: ${firstLine(r.stderr)}. If GitHub asked who you are, run gh auth setup-git once, then run this again.`);
  }
}

async function initImpl(o) {
  const ctx = context(o, { role: 'command', fresh: true });
  const repoName = o.name || 'fleet-ops';
  if (!REPO_NAME_RE.test(repoName)) throw new Stop(REFUSED, `"${repoName}" can't be a GitHub repo name. Use letters, digits, dots, hyphens and underscores.`);
  ctx.out(`fleet init: ${ctx.name} (${ctx.role}), Hub ${ctx.hub}${ctx.dryRun ? '  (dry run: nothing is written)' : ''}`);

  if (hasClone(ctx)) {
    // A second run: the clone is here. Add any template file it lacks; keep every one that differs.
    const origin = git(ctx, ['remote', 'get-url', 'origin']).stdout.trim();
    ctx.out(`  = ${relHub(ctx, ctx.dir)}  (the fleet clone, from ${origin || 'no origin'})`);
    const plan = seedPlan(ctx);
    for (const f of plan) ctx.out(`  ${f.mark} ${f.shown}${f.mark === '!' ? '  (yours differs; kept)' : ''}`);
    const added = plan.filter((f) => f.mark === '+');
    if (added.length && !ctx.dryRun) {
      ensureIdentity(ctx);
      for (const f of added) writeText(path.join(ctx.dir, f.rel), f.want);
      pullRebase(ctx);
      pushSeed(ctx, added.map((f) => f.rel), 'fleet: add the new template files');
    }
    return register(ctx, { first: true });
  }
  if (folderInTheWay(ctx)) {
    throw new Stop(REFUSED, `${ctx.dir} is already there and is not a fleet clone. Move it into 90-Archive/_DumpQueue, then run this again.`);
  }

  let how;
  if (o.remote) {
    how = { remote: o.remote };
    ctx.out(`  = the repo at ${o.remote}  (given with --remote)`);
  } else {
    const gh = needGh(ctx);
    const full = `${ghLogin(gh)}/${repoName}`;
    const vis = visibility(gh, full);
    if (vis && vis !== 'PRIVATE') refusePublic(full, vis);
    how = { gh, full };
    if (vis) ctx.out(`  = GitHub repo ${full}  (private, already there)`);
    else {
      ctx.out(`  + GitHub repo ${full}  (private)`);
      if (!ctx.dryRun) {
        let yes = !!o.createRepo;
        if (!yes) {
          const a = await ctx.ask(`Create a private repo ${full} on your GitHub account? Type yes to create it: `);
          if (a == null) throw new Stop(REFUSED, `Nothing was changed. To create ${full}, run this again with --create-repo, or in a terminal where you can answer yes.`);
          yes = a === true;
        }
        if (!yes) throw new Stop(REFUSED, `Not created, so nothing was changed. Run fleet init again when you want the fleet.`);
        const r = gh(['repo', 'create', full, '--private', '--description', DESCRIPTION]);
        if (r.status !== 0) throw new Stop(FAILED, `GitHub did not create ${full}: ${firstLine(r.stderr)}`);
        const now = visibility(gh, full);
        if (now !== 'PRIVATE') refusePublic(full, now || 'missing');
      }
    }
  }
  ctx.out(`  + ${relHub(ctx, ctx.dir)}  (the clone)`);
  if (ctx.dryRun) {
    for (const f of seedPlan(ctx)) ctx.out(`  + ${f.shown}`);
    ctx.out(`  + machines/${ctx.name}.json  (${ctx.role}, the office hub)`);
    ctx.out(`  + comms/${ctx.name}.md`);
    ctx.out(`  + heartbeats/${ctx.name}.json`);
    ctx.out('Dry run: nothing was written.');
    return OK;
  }

  fs.mkdirSync(path.dirname(ctx.dir), { recursive: true });
  cloneInto(ctx, how);
  if (hasClone(ctx)) {
    ctx.out('That repo is already a fleet, so this computer joins it.');
    return register(ctx, { first: false });
  }
  ensureIdentity(ctx);
  if (git(ctx, ['rev-parse', '--verify', '--quiet', 'HEAD']).status === 0) {
    throw new Stop(REFUSED, `${how.full || how.remote} already has files in it and is not a fleet. Use another name with --name. `
      + `(It was cloned to ${ctx.dir}; move that folder aside.)`);
  }
  gitOk(ctx, ['symbolic-ref', 'HEAD', 'refs/heads/main'], 'start the main branch');
  const plan = seedPlan(ctx);
  for (const f of plan) {
    writeText(path.join(ctx.dir, f.rel), f.want);
    ctx.out(`  + ${f.shown}`);
  }
  pushSeed(ctx, plan.map((f) => f.rel), 'fleet: start the fleet');
  const code = await register(ctx, { first: true });
  if (code === OK) {
    const target = how.full || how.remote;
    ctx.out('');
    ctx.out('Next:');
    ctx.out(`  1. On each other computer: fleet join ${target} --role builder   (or --role mobile)`);
    ctx.out('  2. Sync every day on this computer: fleet schedule');
    ctx.out('  3. The office shows the fleet on its Fleet tab.');
  }
  return code;
}

/** Is this clone's origin the repo the person named? */
function sameRepo(origin, target) {
  const norm = (s) => String(s || '').trim().replace(/\\/g, '/').replace(/\/+$/, '').replace(/\.git$/i, '').toLowerCase();
  const a = norm(origin);
  const b = norm(target);
  if (!a || !b) return false;
  if (a === b) return true;
  if (OWNER_REPO_RE.test(target)) return a.endsWith(`/${b}`) || a.endsWith(`:${b}`);
  try { return norm(path.resolve(origin)) === norm(path.resolve(target)); } catch (_) { return false; }
}

async function joinImpl(o) {
  const ctx = context(o, { role: 'builder' });
  const target = String(o.target || '').trim();
  if (!target) throw new Stop(REFUSED, 'Say which fleet to join: fleet join <your GitHub name>/fleet-ops (or the repo\'s address).');
  ctx.out(`fleet join: ${ctx.name} (${ctx.role}), Hub ${ctx.hub}${ctx.dryRun ? '  (dry run: nothing is written)' : ''}`);

  if (hasClone(ctx)) {
    const origin = git(ctx, ['remote', 'get-url', 'origin']).stdout.trim();
    if (!sameRepo(origin, target)) {
      throw new Stop(REFUSED, `This Hub already has a fleet clone, from ${origin}. One Hub belongs to one fleet. Remove that one first (fleet remove) if you mean to switch.`);
    }
    ctx.out(`  = ${relHub(ctx, ctx.dir)}  (the fleet clone, from ${origin})`);
    return register(ctx, { first: false });
  }
  if (folderInTheWay(ctx)) {
    throw new Stop(REFUSED, `${ctx.dir} is already there and is not a fleet clone. Move it into 90-Archive/_DumpQueue, then run this again.`);
  }
  let how = { remote: target };
  if (OWNER_REPO_RE.test(target) && !fs.existsSync(target)) {
    const gh = needGh(ctx);
    const vis = visibility(gh, target);
    if (!vis) throw new Stop(REFUSED, `GitHub has no repo ${target} that this computer can see. Check the name, and that gh is signed in to the same account (gh auth status).`);
    if (vis !== 'PRIVATE') refusePublic(target, vis);
    how = { gh, full: target };
  }
  ctx.out(`  + ${relHub(ctx, ctx.dir)}  (a clone of ${target})`);
  if (ctx.dryRun) {
    ctx.out(`  + machines/${ctx.name}.json  (${ctx.role})`);
    ctx.out(`  + comms/${ctx.name}.md`);
    ctx.out(`  + heartbeats/${ctx.name}.json`);
    ctx.out('Dry run: nothing was written.');
    return OK;
  }
  fs.mkdirSync(path.dirname(ctx.dir), { recursive: true });
  cloneInto(ctx, how);
  const marker = readJsonIf(path.join(ctx.dir, 'fleet.json'));
  if (!marker) {
    throw new Stop(REFUSED, `${target} is not a fleet repo (it has no fleet.json). It was cloned to ${ctx.dir}: move that folder aside. `
      + 'On your first computer, start a fleet with: fleet init');
  }
  if (marker.format !== 1) throw new Stop(REFUSED, `This fleet was made by a newer version of the Workspace (format ${marker.format}). Update the Workspace on this computer, then join again.`);
  // The commit identity is set by the sync, after register has checked the name is this computer's.
  return register(ctx, { first: false });
}

/* ----------------------------------------------------------- notes, handoffs and the board */

function appendComms(ctx, text) {
  const file = path.join(ctx.dir, 'comms', `${ctx.name}.md`);
  let have = readIf(file);
  if (have == null) have = `# ${ctx.name}: comms\n\nNotes from ${ctx.name}, newest at the bottom. Only ${ctx.name} writes in this file.\n`;
  const entry = render('comms-entry.md', { when: localStamp(ctx.now()), text: noteText(text) });
  writeText(file, `${have.replace(/\s*$/, '\n')}\n${entry}`);
}

async function postImpl(o) {
  const ctx = context(o);
  needClone(ctx);
  const text = String(o.text || '').trim();
  if (!text) throw new Stop(REFUSED, 'Say what to post: fleet post "what happened, in a line or two"');
  if (ctx.dryRun) { ctx.out(`  ~ comms/${ctx.name}.md  (one note added)`); ctx.out('Dry run: nothing was written.'); return OK; }
  appendComms(ctx, text);
  ctx.out(`Posted to comms/${ctx.name}.md.`);
  return syncCore(ctx, { message: `fleet[${ctx.name}]: note ${ymd(ctx.now())}` });
}

/** Item files directly in one status folder. */
function itemNames(ctx, kind, status) {
  try { return fs.readdirSync(path.join(ctx.dir, kind, status)).filter((f) => f.endsWith('.md')).sort(); } catch (_) { return []; }
}

function findItem(ctx, kind, id) {
  const noun = kind === 'board' ? 'work order' : 'handoff';
  const want = String(id || '').trim().replace(/\.md$/i, '');
  if (!want) throw new Stop(REFUSED, `Say which ${noun}: its id, as fleet ${kind === 'board' ? 'board' : 'pickup'} lists it.`);
  const hits = [];
  for (const status of kind === 'board' ? view.BOARD : view.HANDOFFS) {
    for (const f of itemNames(ctx, kind, status)) {
      const n = f.replace(/\.md$/, '');
      const hit = { status, id: n, rel: `${kind}/${status}/${f}` };
      if (n === want) return hit;
      if (n.startsWith(want)) hits.push(hit);
    }
  }
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) throw new Stop(REFUSED, `More than one ${noun} starts with ${want}: ${hits.map((h) => h.id).join(', ')}. Give more of the id.`);
  throw new Stop(REFUSED, `There is no ${noun} called ${want}. fleet ${kind === 'board' ? 'board' : 'pickup'} lists them.`);
}

function uniqueId(ctx, kind, base) {
  const taken = new Set((kind === 'board' ? view.BOARD : view.HANDOFFS).flatMap((s) => itemNames(ctx, kind, s)).map((f) => f.replace(/\.md$/, '')));
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  return id;
}

/** Move an item to another status folder (git mv, so the history follows it) and set its front matter. */
function moveItem(ctx, item, kind, status, front, extra) {
  const to = `${kind}/${status}/${item.id}.md`;
  fs.mkdirSync(path.join(ctx.dir, kind, status), { recursive: true });
  const r = git(ctx, ['mv', '--', item.rel, to]);
  if (r.status !== 0) fs.renameSync(path.join(ctx.dir, item.rel), path.join(ctx.dir, to));
  const file = path.join(ctx.dir, to);
  let text = setFront(readIf(file) || '', Object.assign({ status }, front));
  if (extra) text = `${text.replace(/\s*$/, '\n')}\n${extra}`;
  writeText(file, text);
  return to;
}

function machineNames(ctx) { return view.registeredMachines(ctx.dir).filter((m) => m.status !== 'left').map((m) => m.name); }

function targetName(ctx, raw, what) {
  if (String(raw || '').trim().toLowerCase() === 'any') return 'any';
  const n = officeConfig.wallName(raw);
  const known = machineNames(ctx);
  if (!raw || !known.includes(n)) {
    throw new Stop(REFUSED, `${raw ? `There is no computer called ${n} in this fleet` : `Say which computer ${what}`}. `
      + `The computers are: ${known.join(', ') || 'none yet'} (or any).`);
  }
  return n;
}

async function handoffImpl(o) {
  const ctx = context(o);
  needClone(ctx);
  // Pull first: the computer it is for may have joined since this one last synced.
  if (!ctx.dryRun) await refresh(ctx);
  const to = targetName(ctx, o.to, 'it is for, with --to <NAME>');
  const title = String(o.title || '').trim();
  if (!title) throw new Stop(REFUSED, 'Give the handoff a title: fleet handoff --to MINI "Finish the tip buttons" --body "..."');
  let body = o.body;
  if (body == null && o.bodyFile) {
    const f = path.resolve(o.bodyFile);
    let size = -1;
    try { size = fs.statSync(f).size; } catch (_) { /* below */ }
    if (size < 0) throw new Stop(REFUSED, `There is no file ${f}.`);
    if (size > MAX_NOTE_BYTES) throw new Stop(REFUSED, `${f} is over 64 KB. A handoff is a short note: name the files, never paste them.`);
    body = readIf(f);
  }
  body = String(body || '').replace(/\r\n/g, '\n').trim();
  if (!body) {
    throw new Stop(REFUSED, 'Say what the other computer needs to know, with --body "..." or --body-file note.md: what is done, what is next, how to check it.');
  }
  const repo = String(o.repo || '').trim();
  const branch = String(o.branch || '').trim();
  const d = ctx.now();
  const id = uniqueId(ctx, 'handoffs', `HO-${compact(d)}-${p2(d.getHours())}${p2(d.getMinutes())}-${ctx.name}-${slug(title)}`);
  const where = repo && branch ? `\`${repo}\`, on the branch \`${branch}\` (pushed to GitHub).`
    : repo ? `\`${repo}\`. No branch was named.`
      : branch ? `The branch \`${branch}\` (pushed to GitHub).` : 'No branch: this handoff is not about code.';
  const text = setFront(render('handoff.md', { title, body, where }),
    { id, from: ctx.name, to, created: localStamp(d), status: 'open', repo, branch });
  const rel = `handoffs/open/${id}.md`;
  ctx.out(`  + ${rel}  (for ${to})`);
  if (ctx.dryRun) { ctx.out('Dry run: nothing was written.'); return OK; }
  writeText(path.join(ctx.dir, rel), text);
  ctx.out(`Handed to ${to}: ${title}`);
  return syncCore(ctx, { message: `fleet[${ctx.name}]: handoff to ${to}` });
}

async function pickupImpl(o) {
  const ctx = context(o);
  needClone(ctx);
  const fresh = ctx.dryRun ? OK : await refresh(ctx);
  if (!o.id) {
    const open = view.readItems(ctx.dir, 'handoffs', 'open').items;
    const mine = open.filter((h) => h.to === ctx.name || h.to === 'any');
    if (fresh !== OK) ctx.out('This list is from the last sync, not from GitHub.');
    if (!mine.length) ctx.out(`No handoffs waiting for ${ctx.name}.`);
    else {
      ctx.out(`Waiting for ${ctx.name}: ${mine.length}`);
      for (const h of mine) {
        ctx.out(`  ${h.id}`);
        ctx.out(`      from ${h.from || '?'}${h.created ? `, ${h.created}` : ''}: ${h.title}${h.branch ? `  (branch ${h.branch})` : ''}`);
      }
      ctx.out('Take one with: fleet pickup <id>');
    }
    const others = open.length - mine.length;
    if (others) ctx.out(`${others} more open for other computers.`);
    return OK;
  }
  if (fresh !== OK) { ctx.out('Not taken: this computer could not get the latest from GitHub, so another computer may already have it.'); return fresh; }
  const item = findItem(ctx, 'handoffs', o.id);
  const front = view.parseFront(readIf(path.join(ctx.dir, item.rel)) || '').front;
  if (item.status !== 'open') {
    throw new Stop(REFUSED, `That handoff is already ${item.status}${front.taken_by ? ` (taken by ${front.taken_by}${front.taken_at ? `, ${front.taken_at}` : ''})` : ''}.`);
  }
  if (front.to !== ctx.name && front.to !== 'any' && !o.any) {
    throw new Stop(REFUSED, `That handoff is for ${front.to || 'another computer'}, not ${ctx.name}. Take it anyway with --any, if its owner agrees.`);
  }
  ctx.out(`  ~ ${item.rel} -> handoffs/taken/${item.id}.md  (taken by ${ctx.name})`);
  if (ctx.dryRun) { ctx.out('Dry run: nothing was written.'); return OK; }
  const to = moveItem(ctx, item, 'handoffs', 'taken', { taken_by: ctx.name, taken_at: localStamp(ctx.now()) });
  const code = await syncCore(ctx, { message: `fleet[${ctx.name}]: take ${item.id}` });
  if (code === OK) {
    ctx.out('');
    ctx.out(view.parseFront(readIf(path.join(ctx.dir, to)) || '').body.trim());
    ctx.out('');
    ctx.out(`When it is finished: fleet done ${item.id} --note "what happened"`);
  }
  return code;
}

async function doneImpl(o) {
  const ctx = context(o);
  needClone(ctx);
  const item = findItem(ctx, 'handoffs', o.id);
  const front = view.parseFront(readIf(path.join(ctx.dir, item.rel)) || '').front;
  if (item.status !== 'taken') {
    throw new Stop(REFUSED, item.status === 'open' ? 'That handoff has not been taken yet. Take it first: fleet pickup <id>.' : 'That handoff is already done.');
  }
  if (front.taken_by !== ctx.name && !o.any) throw new Stop(REFUSED, `${front.taken_by || 'Another computer'} took that handoff, so it is theirs to close.`);
  ctx.out(`  ~ ${item.rel} -> handoffs/done/${item.id}.md`);
  if (ctx.dryRun) { ctx.out('Dry run: nothing was written.'); return OK; }
  const d = ctx.now();
  const note = o.note ? `## Done (${ctx.name}, ${localStamp(d)})\n\n${noteText(o.note)}\n` : null;
  moveItem(ctx, item, 'handoffs', 'done', { done_by: ctx.name, done_at: localStamp(d) }, note);
  return syncCore(ctx, { message: `fleet[${ctx.name}]: done ${item.id}` });
}

const COLUMN_WORDS = { backlog: 'Backlog', doing: 'Doing', done: 'Done', archive: 'Archive' };

async function boardImpl(o) {
  const ctx = context(o);
  needClone(ctx);
  if (o.add == null) {
    const fresh = ctx.dryRun ? OK : await refresh(ctx);
    if (fresh !== OK) ctx.out('This board is from the last sync, not from GitHub.');
    for (const s of view.BOARD) {
      const { count, items } = view.readItems(ctx.dir, 'board', s);
      ctx.out(`${COLUMN_WORDS[s]} (${count})`);
      for (const w of items) {
        const who = s === 'backlog' ? (w.for && w.for !== 'any' ? `for ${w.for}` : 'for any computer') : w.claimed_by ? `by ${w.claimed_by}` : '';
        ctx.out(`  ${w.id}  ${w.title}${who ? `  (${who})` : ''}`);
      }
    }
    return OK;
  }
  if (!ctx.dryRun) await refresh(ctx);
  const title = String(o.add || '').trim();
  if (!title) throw new Stop(REFUSED, 'Give the work order a title: fleet board --add "Add tip buttons to the checkout" --for MINI');
  const forWho = o.for ? targetName(ctx, o.for, 'it is for') : 'any';
  const d = ctx.now();
  const id = uniqueId(ctx, 'board', `WO-${compact(d)}-${slug(title)}`);
  const text = setFront(render('work-order.md', { title }),
    { id, title, for: forWho, status: 'backlog', filed_by: ctx.name, created: localStamp(d), repo: '' });
  const rel = `board/backlog/${id}.md`;
  ctx.out(`  + ${rel}  (for ${forWho === 'any' ? 'any computer' : forWho})`);
  if (ctx.dryRun) { ctx.out('Dry run: nothing was written.'); return OK; }
  writeText(path.join(ctx.dir, rel), text);
  ctx.out(`On the board: ${title}. Fill in its goal and how to check it in ${rel}, then sync.`);
  return syncCore(ctx, { message: `fleet[${ctx.name}]: work order ${id}` });
}

async function claimImpl(o) {
  const ctx = context(o);
  needClone(ctx);
  if (!ctx.dryRun) { const fresh = await refresh(ctx); if (fresh !== OK) { ctx.out('Not claimed: could not get the latest board from GitHub.'); return fresh; } }
  const item = findItem(ctx, 'board', o.id);
  const front = view.parseFront(readIf(path.join(ctx.dir, item.rel)) || '').front;
  if (item.status !== 'backlog') throw new Stop(REFUSED, `That work order is already in ${item.status}${front.claimed_by ? `, claimed by ${front.claimed_by}` : ''}.`);
  if (front.for && front.for !== 'any' && front.for !== ctx.name && !o.any) {
    throw new Stop(REFUSED, `That work order is for ${front.for}, not ${ctx.name}. Claim it anyway with --any, if the owner agrees.`);
  }
  ctx.out(`  ~ ${item.rel} -> board/doing/${item.id}.md  (claimed by ${ctx.name})`);
  if (ctx.dryRun) { ctx.out('Dry run: nothing was written.'); return OK; }
  moveItem(ctx, item, 'board', 'doing', { claimed_by: ctx.name, claimed_at: localStamp(ctx.now()) });
  return syncCore(ctx, { message: `fleet[${ctx.name}]: claim ${item.id}` });
}

async function finishImpl(o) {
  const ctx = context(o);
  needClone(ctx);
  const item = findItem(ctx, 'board', o.id);
  const front = view.parseFront(readIf(path.join(ctx.dir, item.rel)) || '').front;
  if (item.status !== 'doing') throw new Stop(REFUSED, `That work order is in ${item.status}, not doing. Claim it first: fleet claim ${item.id}.`);
  if (front.claimed_by !== ctx.name && !o.any) throw new Stop(REFUSED, `${front.claimed_by || 'Another computer'} claimed that work order, so it is theirs to finish.`);
  ctx.out(`  ~ ${item.rel} -> board/done/${item.id}.md`);
  if (ctx.dryRun) { ctx.out('Dry run: nothing was written.'); return OK; }
  const set = { finished_at: localStamp(ctx.now()) };
  if (o.branch) set.branch = String(o.branch).trim();
  moveItem(ctx, item, 'board', 'done', set);
  ctx.out('Make sure its Result section names the branch and says how to check it. A different session checks it before it is merged.');
  return syncCore(ctx, { message: `fleet[${ctx.name}]: finish ${item.id}` });
}

async function archiveImpl(o) {
  const ctx = context(o);
  needClone(ctx);
  const item = findItem(ctx, 'board', o.id);
  if (item.status !== 'done') throw new Stop(REFUSED, `That work order is in ${item.status}. Only a done one, merged and checked, is archived.`);
  ctx.out(`  ~ ${item.rel} -> board/archive/${item.id}.md`);
  if (ctx.dryRun) { ctx.out('Dry run: nothing was written.'); return OK; }
  moveItem(ctx, item, 'board', 'archive', { archived_by: ctx.name, archived_at: localStamp(ctx.now()) });
  return syncCore(ctx, { message: `fleet[${ctx.name}]: archive ${item.id}` });
}

/* ------------------------------------------------------------------------------- status */

function ageWords(ms) {
  if (ms == null) return 'never';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

const RESULT_WORDS = {
  ok: 'ok', dirty: 'stopped on files that are not this computer\'s', conflict: 'stopped on a conflict', failed: 'could not reach GitHub',
};

async function statusImpl(o) {
  const ctx = context(o);
  needClone(ctx);
  const v = view.fleetView(ctx.dir, ctx.name);
  const me = v.machines.find((m) => m.self);
  ctx.out(`This computer: ${ctx.name} (${(me && me.role) || ctx.role}). Hub: ${ctx.hub}`);
  const last = v.last_sync;
  ctx.out(last ? `Last sync: ${last.local || ''} (${ageWords(last.at ? Date.now() - last.at : null)}), ${RESULT_WORDS[last.result] || last.result}.` : 'Last sync: not yet on this computer.');
  if (last && last.result !== 'ok' && last.note) ctx.out(`  ${last.note}. Details: ${posix(path.join(relHub(ctx, ctx.dir), '.sync'))}`);
  ctx.out('Computers:');
  for (const m of v.machines) {
    const hb = m.heartbeat;
    const bits = [
      (m.role || '?').padEnd(8),
      m.status === 'left' ? 'left the fleet' : hb ? `synced ${ageWords(hb.age_ms)}${hb.ok ? '' : ' (late)'}` : 'has not synced yet',
    ];
    if (hb && hb.office) bits.push(hb.office === 'up' ? 'office answering' : 'office not running');
    if (m.waiting) bits.push(`${m.waiting} handoff${m.waiting === 1 ? '' : 's'} waiting`);
    ctx.out(`  ${m.name.padEnd(10)} ${bits.join('   ')}${m.self ? '   (this one)' : ''}`);
  }
  const waiting = v.handoffs.open.filter((h) => h.to === ctx.name || h.to === 'any');
  ctx.out(`Waiting for ${ctx.name}: ${waiting.length} handoff${waiting.length === 1 ? '' : 's'}${waiting.length ? ' (fleet pickup lists them)' : ''}.`);
  for (const h of waiting) ctx.out(`  ${h.id}  from ${h.from}: ${h.title}`);
  const sent = v.handoffs.open.filter((h) => h.from === ctx.name).map((h) => ({ h, state: `waiting for ${h.to}` }))
    .concat(v.handoffs.taken.filter((h) => h.from === ctx.name).map((h) => ({ h, state: `taken by ${h.taken_by}${h.taken_at ? `, ${h.taken_at}` : ''}` })));
  if (sent.length) {
    ctx.out(`Sent by ${ctx.name}:`);
    for (const { h, state } of sent) ctx.out(`  ${h.id}  ${h.title}: ${state}`);
  }
  const taken = v.handoffs.taken.filter((h) => h.taken_by === ctx.name);
  if (taken.length) {
    ctx.out(`Taken by ${ctx.name}, not done yet:`);
    for (const h of taken) ctx.out(`  ${h.id}  ${h.title}`);
  }
  ctx.out(`Board: ${view.BOARD.map((s) => `${s} ${v.board[s].count}`).join(' · ')}`);
  return OK;
}

/* ----------------------------------------------------------------------- the daily schedule */

/**
 * The exact scheduler commands for one platform: { kind, describe, create, remove, file?, text?, line? }.
 * create/remove are [{ cmd, args, mayFail }].
 */
function scheduleSpec(platform, s) {
  const at = s.at || '08:30';
  const [hh, mm] = at.split(':').map(Number);
  const hub = s.hub;
  if (platform === 'win32') {
    const tr = `"${s.node}" "${s.script}" sync --quiet --hub "${hub}"`;
    return {
      kind: 'schtasks',
      describe: `Windows Task Scheduler, "${TASK_NAME}", every day at ${at}`,
      tr,
      create: [{ cmd: 'schtasks', args: ['/Create', '/SC', 'DAILY', '/ST', at, '/TN', TASK_NAME, '/TR', tr, '/F'] }],
      remove: [{ cmd: 'schtasks', args: ['/Delete', '/TN', TASK_NAME, '/F'] }],
    };
  }
  if (platform === 'darwin') {
    const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // macOS paths, whichever computer works them out (a test on Windows gets the same answer).
    const file = path.posix.join(s.home, 'Library', 'LaunchAgents', `${PLIST_LABEL}.plist`);
    const log = path.posix.join(hub, '50-AI', 'fleet-ops', '.sync', 'scheduled.log');
    const text = '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
      + '<plist version="1.0"><dict>\n'
      + `  <key>Label</key><string>${PLIST_LABEL}</string>\n`
      + `  <key>ProgramArguments</key><array>${[s.node, s.script, 'sync', '--quiet', '--hub', hub].map((a) => `<string>${esc(a)}</string>`).join('')}</array>\n`
      + `  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>${hh}</integer><key>Minute</key><integer>${mm}</integer></dict>\n`
      + '  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>\n'
      + `  <key>StandardOutPath</key><string>${esc(log)}</string>\n`
      + `  <key>StandardErrorPath</key><string>${esc(log)}</string>\n`
      + '</dict></plist>\n';
    return {
      kind: 'launchd',
      describe: `a LaunchAgent (${PLIST_LABEL}), every day at ${at}`,
      file,
      text,
      create: [{ cmd: 'launchctl', args: ['unload', file], mayFail: true }, { cmd: 'launchctl', args: ['load', '-w', file] }],
      remove: [{ cmd: 'launchctl', args: ['unload', '-w', file], mayFail: true }],
    };
  }
  return {
    kind: 'cron',
    describe: `a crontab line, every day at ${at}`,
    line: `${mm} ${hh} * * * "${s.node}" "${s.script}" sync --quiet --hub "${hub}"`,
    create: [],
    remove: [],
  };
}

function specFor(ctx, at) {
  const home = envGet(ctx.env, 'HOME') || envGet(ctx.env, 'USERPROFILE') || os.homedir();
  return scheduleSpec(process.platform, { node: process.execPath, script: CLI, hub: ctx.hub, at, home });
}

const printOnly = (ctx) => /^print$/i.test(String(envGet(ctx.env, 'FLEET_SCHEDULER') || ''));

/** Take the daily sync out. Returns true when it was there (or might have been). */
function unschedule(ctx, spec) {
  const print = printOnly(ctx) || ctx.dryRun;
  if (spec.kind === 'cron') {
    ctx.out('  On Linux, take the fleet line out of your crontab yourself: crontab -e');
    return true;
  }
  if (print) {
    if (printOnly(ctx)) ctx.out('FLEET_SCHEDULER=print: the exact commands; none was run.');
    for (const st of spec.remove) ctx.out(`  ${display(st.cmd, st.args)}`);
    if (spec.file) ctx.out(`  then delete ${spec.file}`);
    return true;
  }
  let gone = false;
  for (const st of spec.remove) gone = run(st.cmd, st.args).status === 0 || gone;
  if (spec.file && fs.existsSync(spec.file)) { fs.rmSync(spec.file, { force: true }); gone = true; }
  ctx.out(gone ? '  The daily sync is off.' : '  There was no daily sync scheduled.');
  return gone;
}

async function scheduleImpl(o) {
  const ctx = context(o);
  needClone(ctx);
  const at = String(o.at || '08:30').trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(at)) throw new Stop(REFUSED, `"${at}" is not a time. Give it as HH:MM, 24-hour, for example --at 08:30.`);
  const spec = specFor(ctx, at);
  const print = printOnly(ctx);
  if (o.remove) {
    ctx.out(`fleet schedule --remove: ${ctx.name}`);
    ctx.out(`  - the daily sync (${spec.describe.replace(/, every day at .*$/, '')})`);
    unschedule(ctx, spec);
    return OK;
  }
  ctx.out(`fleet schedule: ${ctx.name}`);
  if (spec.kind === 'cron') {
    ctx.out(`  + ${spec.describe}. On Linux the fleet changes no crontab itself, so none was run. Add this line with: crontab -e`);
    ctx.out(`  ${spec.line}`);
    return OK;
  }
  if (spec.kind === 'schtasks' && spec.tr.length > 261) {
    throw new Stop(REFUSED, 'The folders are too deep for Windows Task Scheduler (its command is limited to 261 characters). Move the Hub to a shorter path.');
  }
  let mark = '+';
  if (spec.file) {
    const have = readIf(spec.file);
    mark = have == null ? '+' : have === spec.text ? '=' : '~';
  }
  ctx.out(`  ${mark} ${spec.describe}: fleet sync --quiet`);
  if (print || ctx.dryRun) {
    if (print) ctx.out('FLEET_SCHEDULER=print: the exact commands; none was run.');
    if (spec.file) {
      ctx.out(`  write ${spec.file}:`);
      for (const l of spec.text.trimEnd().split('\n')) ctx.out(`    ${l}`);
    }
    for (const st of spec.create) ctx.out(`  ${display(st.cmd, st.args)}`);
    if (ctx.dryRun && !print) ctx.out('Dry run: nothing was run.');
    return OK;
  }
  if (spec.file) {
    fs.mkdirSync(path.dirname(spec.file), { recursive: true });
    fs.writeFileSync(spec.file, spec.text, 'utf8');
  }
  for (const st of spec.create) {
    const r = run(st.cmd, st.args);
    if (r.status !== 0 && !st.mayFail) throw new Stop(FAILED, `The scheduler refused it (${display(st.cmd, st.args)}): ${firstLine(r.stderr || r.stdout)}`);
  }
  ctx.out(`Done. This computer syncs the fleet every day at ${at}. Take it out with: fleet schedule --remove`);
  return OK;
}

/* ----------------------------------------------------------------------------- removing */

/** Move a folder; across drives, copy it, check the copy, then remove the original. */
function moveDir(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try { fs.renameSync(from, to); return; } catch (e) { if (e.code !== 'EXDEV') throw e; }
  fs.cpSync(from, to, { recursive: true });
  const count = (d) => fs.readdirSync(d, { recursive: true }).length;
  if (count(from) !== count(to)) throw new Stop(FAILED, `The copy at ${to} does not match ${from}. Nothing was removed; look at both.`);
  fs.rmSync(from, { recursive: true, force: true, maxRetries: 3 });
}

async function removeImpl(o) {
  const ctx = context(o);
  needClone(ctx);
  ctx.out(`fleet remove: ${ctx.name}, Hub ${ctx.hub}${ctx.dryRun ? '  (dry run: nothing is changed)' : ''}`);
  const pending = changes(ctx);
  const ahead = Number(git(ctx, ['rev-list', '--count', '@{u}..HEAD']).stdout.trim()) || 0;
  if (pending.length || ahead) {
    const what = pending.slice(0, 8).map((c) => c.path).concat(ahead ? [`${ahead} commit${ahead === 1 ? '' : 's'} not pushed`] : []);
    throw new Stop(REFUSED, `This computer has fleet work that is not on GitHub yet: ${what.join(', ')}. Run fleet sync, then remove again.`);
  }
  const d = ctx.now();
  const queue = path.join(ctx.hub, '90-Archive', '_DumpQueue');
  let dest = path.join(queue, `fleet-ops-${ymd(d)}`);
  for (let n = 2; fs.existsSync(dest); n += 1) dest = path.join(queue, `fleet-ops-${ymd(d)}-${n}`);
  const spec = specFor(ctx, '08:30');
  ctx.out(`  - the daily sync (${spec.describe.replace(/, every day at .*$/, '')})`);
  ctx.out(`  ~ machines/${ctx.name}.json  (marked as left)`);
  ctx.out(`  - ${relHub(ctx, ctx.dir)}  (moved to ${relHub(ctx, dest)}, not deleted)`);
  if (ctx.dryRun) { ctx.out('Dry run: nothing was changed.'); return OK; }

  unschedule(ctx, spec);
  const file = path.join(ctx.dir, 'machines', `${ctx.name}.json`);
  const mine = readJsonIf(file) || { name: ctx.name };
  writeJson(file, Object.assign(mine, { status: 'left', left: ymd(d) }));
  appendComms(ctx, `Left the fleet. This computer no longer syncs.`);
  const code = await syncCore(ctx, { message: `fleet[${ctx.name}]: leave ${ymd(d)}` });
  if (code !== OK) { ctx.out('Stopped before moving the clone. Fix what the sync said, then run fleet remove again.'); return code; }
  moveDir(ctx.dir, dest);
  ctx.out(`Removed ${ctx.name} from the fleet. Its copy is in ${dest}, waiting for you to delete it.`);
  ctx.out('Your fleet repo on GitHub stays private, and it is yours: keep it for your other computers, or delete it on github.com '
    + '(the repo\'s Settings, then Delete this repository) once no computer uses it.');
  return OK;
}

/* ---------------------------------------------------------------------------- the commands */

/** Run one command: its exit code, with a refusal or failure said in plain words instead of thrown. */
function command(impl) {
  return async (opts) => {
    const o = opts || {};
    const out = o.out || ((s) => process.stdout.write(`${s}\n`));
    try {
      return await impl(Object.assign({}, o, { out }));
    } catch (e) {
      if (e instanceof Stop) { out(e.message); return e.code; }
      throw e;
    }
  };
}

const sync = command(async (o) => {
  const ctx = context(o);
  needClone(ctx);
  return syncCore(ctx, { message: `fleet[${ctx.name}]: sync ${ymd(ctx.now())}` });
});

module.exports = {
  OK, FAILED, REFUSED, DIRTY, CONFLICT, TASK_NAME, PLIST_LABEL, CLI, TEMPLATE_DIR,
  init: command(initImpl),
  join: command(joinImpl),
  sync,
  post: command(postImpl),
  handoff: command(handoffImpl),
  pickup: command(pickupImpl),
  done: command(doneImpl),
  board: command(boardImpl),
  claim: command(claimImpl),
  finish: command(finishImpl),
  archive: command(archiveImpl),
  status: command(statusImpl),
  schedule: command(scheduleImpl),
  remove: command(removeImpl),
  scheduleSpec, display, localStamp, slug, setFront, which,
};
