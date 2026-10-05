'use strict';

/**
 * hub.js — make a Hub, keep its NAV.md true, add a project, and check the Hub. The API behind hub/bin/hub.js.
 *
 *   plan(root, opts)              the items `hub init` would do, each { mark, path, note, line }; writes nothing
 *   init(root, opts)              does them: a Promise of { items, changed }
 *   generateNav(root, opts)       the text of NAV.md for this Hub, stamp line included
 *   writeNav(root, opts)          writes NAV.md, but only when its body (everything but the stamp) changed
 *   newProject(root, name, opts)  a project folder in the code zone, then NAV.md again
 *   doctor(root, opts)            a read-only report: { items: [{ level: ok|note|fix, text }], fixes }
 *
 * init makes the zones and their skeleton folders (the folders inside hub/templates/zones/ are the list; the code
 * zone stands in for 20-Coding/Projects), .hub/hub.json (the contract in docs/ARCHITECTURE.md), .hub/nav.json (only
 * when absent: it is yours to edit), CLAUDE.md and each zone's README.md from the templates, then NAV.md.
 * opts: { machine, role, owner, codeZone, workspace, date, dryRun, yes, replace, ask }.
 * Marks: + add, ~ change, = already there, ! yours differs and is kept. A file of yours that differs is replaced only
 * when opts.replace is set or opts.ask(question) resolves true; under opts.yes nothing is asked and nothing replaced.
 * A value asked for that differs from one already in .hub/hub.json is the same: the file wins unless replaced, and
 * the templates are filled from what is really there.
 *
 * NAV.md is bounded by design: the zone roots and the folders directly inside them, the projects in the code zone,
 * the company folders in 10-Business and the agents in 50-AI/agents. It reads no file contents except .hub/*.json,
 * the name and title in each agent.json, and `git -C <project> remote get-url origin`. It never recurses. The doctor
 * keeps to the same bounds.
 *
 * A mistake the person can fix (a bad name, no Hub, a project that exists already) throws HubError, exitCode 2.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const rootLib = require('./root');

const { ZONES, MARKER, DEFAULT_CODE_ZONE } = rootLib;
const TEMPLATES = path.join(__dirname, '..', 'templates');
const ROLES = ['command', 'builder', 'mobile'];
const FIELDS = ['machine', 'role', 'code_zone', 'workspace', 'owner'];
const DEFAULT_WORKSPACE = '50-AI/workspace';
const NAV_FILE = 'NAV.md';
const NAV_JSON = path.join('.hub', 'nav.json');
const STAMP_RE = /^<!-- regenerated (\d{4}-\d{2}-\d{2}) by hub nav\. Edit \.hub\/nav\.json, not this file\. -->\n?/m;
const STALE_DAYS = 8;
const TREE_MAX = 30;
const ROOT_BELONGS = new Set([...ZONES.map((z) => z.dir), 'CLAUDE.md', NAV_FILE, '.hub', '.claude']);
const OS_JUNK = new Set(['.ds_store', 'desktop.ini', 'thumbs.db']);
const DUMP_PILES = [/^migration-/i, /^_work$/i, /^sort[-_ ]?later$/i, /^misc$/i];
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/;
const GIT_OPTS = { encoding: 'utf8', windowsHide: true, timeout: 30000 };

const GITIGNORE = [
  '# Secrets: never commit them.',
  '.env',
  '.env.*',
  '!.env.example',
  '*.pem',
  '*.key',
  '',
  '# Installed packages and build output.',
  'node_modules/',
  'dist/',
  'build/',
  '__pycache__/',
  '.venv/',
  '',
  '# Logs and system files.',
  '*.log',
  '.DS_Store',
  'Thumbs.db',
  '',
].join('\n');

class HubError extends Error {
  constructor(message) {
    super(message);
    this.name = 'HubError';
    this.exitCode = 2;
  }
}

/* ------------------------------------------------------------------ small helpers */

const fwd = (p) => String(p).replace(/\\/g, '/');
const abs = (root, rel) => path.join(root, ...fwd(rel).split('/').filter(Boolean));
const given = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function byName(a, b) {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x !== y) return x < y ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Today on this computer's clock, as YYYY-MM-DD. */
function today(d) {
  const t = d || new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

/** Whole days from one YYYY-MM-DD to another. */
function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/** A text file with LF line ends and no byte-order mark, or null when it cannot be read as a file. */
function readText(file) {
  try { return fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n'); } catch (_) { return null; }
}

/** Parsed JSON, null when the file is not there; throws when it is there but is not JSON. */
function readJson(file) {
  const text = readText(file);
  return text === null ? null : JSON.parse(text);
}

function exists(p) { try { fs.lstatSync(p); return true; } catch (_) { return false; } }
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch (_) { return false; } }

/** What is directly inside a folder: one listing, never deeper. [] when the folder is not there. */
function entries(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return []; }
}

/** The folders directly inside a folder (a link to a folder counts), hidden ones left out, sorted by name. */
function folders(dir) {
  return entries(dir)
    .filter((d) => !d.name.startsWith('.') && (d.isDirectory() || (d.isSymbolicLink() && isDir(path.join(dir, d.name)))))
    .map((d) => d.name)
    .sort(byName);
}

function template(rel) {
  const text = readText(path.join(TEMPLATES, ...rel.split('/')));
  if (text === null) throw new Error(`The template ${rel} is missing from ${TEMPLATES}.`);
  return text;
}

/** Fills every {{key}}. A key with no value is a mistake in the template, so it throws rather than leave {{key}} in. */
function render(text, values) {
  return text.replace(/\{\{(\w+)\}\}/g, (m, key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) throw new Error(`A template uses {{${key}}}, which has no value.`);
    return String(values[key]);
  });
}

function setLine(item) {
  item.line = `${item.mark} ${item.path}${item.note ? `  ${item.note}` : ''}`;
  return item;
}

/* ------------------------------------------------------------------ git (only ever on one named folder) */

let gitFound;
function hasGit() {
  if (gitFound === undefined) {
    const r = spawnSync('git', ['--version'], GIT_OPTS);
    gitFound = !r.error && r.status === 0;
  }
  return gitFound;
}

/** The origin of one project, with any user:password@ taken out; null when there is none. */
function originOf(dir) {
  if (!hasGit()) return null;
  const r = spawnSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], GIT_OPTS);
  if (r.error || r.status !== 0) return null;
  const url = String(r.stdout || '').trim().replace(/\/\/[^@/\s]+@/, '//');
  return url || null;
}

/** owner/name when the origin is on GitHub; null otherwise. */
function githubName(url) {
  const m = /github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(url || '');
  return m ? `${m[1]}/${m[2]}` : null;
}

function gitInit(dir) {
  let r = spawnSync('git', ['init', '-b', 'main'], Object.assign({ cwd: dir }, GIT_OPTS));
  if (r.error || r.status !== 0) {
    // git older than 2.28 has no -b: make the repository, then point it at main.
    r = spawnSync('git', ['init'], Object.assign({ cwd: dir }, GIT_OPTS));
    if (!r.error && r.status === 0) r = spawnSync('git', ['symbolic-ref', 'HEAD', 'refs/heads/main'], Object.assign({ cwd: dir }, GIT_OPTS));
  }
  return !r.error && r.status === 0;
}

/* ------------------------------------------------------------------ the settings in .hub/hub.json */

function cleanRel(value, what) {
  const rel = fwd(String(value).trim()).replace(/^(\.\/)+/, '').replace(/\/+$/, '');
  const bad = !rel || path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel) || /\s/.test(rel)
    || rel.split('/').some((s) => s === '' || s === '.' || s === '..');
  if (bad) throw new HubError(`${what} must be a folder inside the Hub, written like 20-Coding/Projects (no spaces, no "..").`);
  return rel;
}

function defaultMachine() {
  const name = String(os.hostname() || '').toUpperCase().replace(/[^A-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  return name || 'THIS-COMPUTER';
}

function defaultOwner() {
  try { return os.userInfo().username || 'the owner'; } catch (_) { return 'the owner'; }
}

/** Where this workspace repo sits inside the Hub, when it does (the installed case); else the usual place. */
function workspaceGuess(root) {
  const rel = path.relative(path.resolve(root), path.resolve(__dirname, '..', '..'));
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return fwd(rel);
  return DEFAULT_WORKSPACE;
}

function checkValues(v) {
  if (given(v.machine) && !/^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/.test(v.machine)) {
    throw new HubError(`"${v.machine}" cannot be a computer name. Use letters, digits and hyphens, like DESK or MINI.`);
  }
  if (given(v.role) && !ROLES.includes(v.role)) {
    throw new HubError(`The role must be command, builder or mobile, not "${v.role}".`);
  }
  if (given(v.owner) && /[\r\n]/.test(v.owner)) {
    throw new HubError('The owner must be a name on one line, like Alex.');
  }
}

/** A Hub is its own folder: never a whole drive, never the user folder itself. */
function checkPlace(root) {
  if (path.parse(root).root === root) {
    throw new HubError(`A Hub cannot be a whole drive (${root}). Use a folder on it, like ${path.join(root, 'Hub')}.`);
  }
  const caseless = process.platform === 'win32' || process.platform === 'darwin';
  const same = (a, b) => (caseless ? a.toLowerCase() === b.toLowerCase() : a === b);
  const homes = [os.homedir(), process.env.USERPROFILE, process.env.HOME].filter(Boolean).map((h) => path.resolve(h));
  if (homes.some((h) => same(h, root))) {
    throw new HubError(`A Hub cannot be your user folder itself (${root}). Use a folder inside it, like ${path.join(root, 'Hub')}.`);
  }
  if (exists(root) && !isDir(root)) throw new HubError(`${root} is a file, not a folder.`);
}

/**
 * What .hub/hub.json holds now (`have`: null when absent, false when it cannot be read), what init would write
 * (`want`), which values asked for differ from what is there (`conflicts`), and which are missing from it.
 */
function settings(root, opts) {
  const o = opts || {};
  const asked = {
    machine: given(o.machine) ? String(o.machine).trim() : undefined,
    role: given(o.role) ? String(o.role).trim() : undefined,
    owner: given(o.owner) ? String(o.owner).trim() : undefined,
    code_zone: given(o.codeZone) ? cleanRel(o.codeZone, 'The code zone') : undefined,
    workspace: given(o.workspace) ? cleanRel(o.workspace, 'The workspace folder') : undefined,
  };
  checkValues(asked);
  const date = given(o.date) ? String(o.date) : today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HubError(`The date must be written YYYY-MM-DD, not "${date}".`);

  let have = null;
  if (exists(path.join(root, MARKER))) {
    try { have = readJson(path.join(root, MARKER)); } catch (_) { have = false; }
    if (have !== false && (!have || typeof have !== 'object' || Array.isArray(have))) have = false;
  }
  const base = {
    machine: defaultMachine(), role: 'command', owner: defaultOwner(),
    code_zone: DEFAULT_CODE_ZONE, workspace: workspaceGuess(root),
  };
  const held = (k) => (have && given(have[k]) ? have[k] : undefined);
  const want = {};
  const real = {};
  for (const k of FIELDS) {
    want[k] = asked[k] !== undefined ? asked[k] : held(k) !== undefined ? held(k) : base[k];
    real[k] = held(k) !== undefined ? held(k) : want[k];
  }
  const conflicts = have ? FIELDS.filter((k) => asked[k] !== undefined && held(k) !== undefined && String(held(k)) !== asked[k]) : [];
  const missing = have ? [...FIELDS, 'format', 'created'].filter((k) => !given(have[k])) : [];
  return { have, want, real, conflicts, missing, date };
}

function markerText(obj) {
  const ordered = {};
  for (const k of ['format', 'machine', 'role', 'code_zone', 'workspace', 'owner', 'created']) {
    if (obj[k] !== undefined) ordered[k] = obj[k];
  }
  return `${JSON.stringify(Object.assign(ordered, obj), null, 2)}\n`;
}

/* ------------------------------------------------------------------ init */

/** The folders every Hub has: each zone, then the folders inside its template (the code zone for 20-Coding/Projects). */
function skeleton(codeZoneRel) {
  const out = [];
  for (const z of ZONES) {
    out.push(z.dir);
    for (const k of folders(path.join(TEMPLATES, 'zones', z.dir))) {
      const rel = `${z.dir}/${k}`;
      out.push(rel === DEFAULT_CODE_ZONE ? codeZoneRel || DEFAULT_CODE_ZONE : rel);
    }
  }
  return [...new Set(out)];
}

function buildPlan(rootIn, opts, yes) {
  const o = opts || {};
  const root = path.resolve(rootIn);
  checkPlace(root);
  const replaceAll = !!o.replace;
  const said = yes || new Set();
  const replacing = (rel) => replaceAll || said.has(rel);
  const items = [];
  const add = (mark, rel, note, extra) => items.push(Object.assign({ mark, path: rel, note: note || '' }, extra || {}));

  if (!exists(root)) add('+', root, 'the Hub folder', { kind: 'root' });

  // 1. The marker. What it really says decides the values every template is filled with.
  const s = settings(root, o);
  let values = s.real;
  const markerRel = '.hub/hub.json';
  if (s.have === null) {
    const fresh = Object.assign({ format: 1 }, s.want, { created: s.date });
    add('+', markerRel, `this computer: ${s.want.machine}, ${s.want.role}, code in ${s.want.code_zone}`, { kind: 'file', content: markerText(fresh) });
    values = s.want;
  } else if (s.have === false || s.conflicts.length) {
    if (replacing(markerRel)) {
      const merged = Object.assign({}, s.have || {}, { format: 1 }, s.want, { created: (s.have && s.have.created) || s.date });
      add('~', markerRel, `now: ${s.want.machine}, ${s.want.role}, code in ${s.want.code_zone}`, { kind: 'file', content: markerText(merged) });
      values = s.want;
    } else if (s.have === false) {
      add('!', markerRel, 'cannot be read (it is not valid JSON); kept. Fix it, or rename it and run hub init again.',
        { ask: 'Your .hub/hub.json cannot be read. Replace it with a new one?' });
      values = s.want;
    } else {
      const diff = s.conflicts.map((k) => `${k} is ${s.have[k]} (asked: ${s.want[k]})`).join(', ');
      add('!', markerRel, `yours differs: ${diff}; kept. To change it, edit .hub/hub.json.`,
        { ask: `Your .hub/hub.json says ${diff}. Replace those values with the ones asked for?` });
    }
  } else if (s.missing.length) {
    const filled = Object.assign({}, s.have);
    for (const k of s.missing) filled[k] = k === 'format' ? 1 : k === 'created' ? s.date : s.want[k];
    add('~', markerRel, `adds ${s.missing.join(', ')}`, { kind: 'file', content: markerText(filled) });
  } else {
    add('=', markerRel);
  }
  const fill = {
    owner: values.owner, machine: values.machine, role: values.role, code_zone: values.code_zone,
    workspace: values.workspace, date: (s.have && given(s.have.created) && s.have.created) || s.date,
  };

  // 2. The plain-English rows: seeded once, then yours.
  if (exists(path.join(root, NAV_JSON))) add('=', '.hub/nav.json', 'yours to edit');
  else add('+', '.hub/nav.json', 'the plain-English rows NAV.md is built from', { kind: 'file', content: render(template('nav.json'), fill) });

  // 3. The zones and their skeleton folders.
  for (const rel of skeleton(fill.code_zone)) {
    const p = abs(root, rel);
    if (isDir(p)) add('=', `${rel}/`);
    else if (exists(p)) add('!', `${rel}/`, 'is a file where this folder belongs; kept. Rename it, then run hub init again.');
    else add('+', `${rel}/`, '', { kind: 'dir' });
  }

  // 4. Each zone's README.md and the constitution, from the templates.
  const file = (rel, content, label) => {
    const p = abs(root, rel);
    const old = readText(p);
    if (old === null && !exists(p)) add('+', rel, label, { kind: 'file', content });
    else if (old === null) add('!', rel, 'cannot be read as a file; kept.');
    else if (old === content) add('=', rel);
    else if (replacing(rel)) add('~', rel, 'replaced with the template', { kind: 'file', content });
    else {
      add('!', rel, 'yours differs from the template; kept. To use the template, rename yours and run hub init again.',
        { ask: `Your ${rel} is different from the template. Replace it with the template?` });
    }
  };
  for (const z of ZONES) file(`${z.dir}/README.md`, render(template(`zones/${z.dir}/README.md`), fill), 'what goes in this zone');
  file('CLAUDE.md', render(template('CLAUDE.hub.md'), fill), 'the constitution');

  // 5. NAV.md, last: it describes everything above.
  const nav = readText(path.join(root, NAV_FILE));
  if (nav !== null && !STAMP_RE.test(nav)) {
    if (replacing(NAV_FILE)) add('~', NAV_FILE, 'replaced with a generated one', { kind: 'nav', own: true });
    else {
      add('!', NAV_FILE, 'was not made by hub nav (no stamp line); kept. To have it generated, rename yours and run hub init again.',
        { ask: 'Your NAV.md was not made by hub nav. Replace it with a generated one?' });
    }
  } else if (nav === null) {
    add('+', NAV_FILE, 'generated', { kind: 'nav' });
  } else {
    const pending = items.some((i) => i.mark === '+' || i.mark === '~');
    const same = !pending && stripStamp(nav) === navBody(root);
    add(same ? '=' : '~', NAV_FILE, same ? '' : 'regenerated', { kind: 'nav' });
  }
  items.forEach(setLine);
  return { root, items };
}

/** The items `hub init` would do, each with its printed line. Writes nothing and asks nothing. */
function plan(root, opts) {
  return buildPlan(root, opts).items;
}

const changing = (i) => i.mark === '+' || i.mark === '~';

/** Makes or updates the Hub at root. Resolves to { items, changed }. */
async function init(rootIn, opts) {
  const o = Object.assign({}, opts);
  const root = path.resolve(rootIn);
  let { items } = buildPlan(root, o);
  if (!o.dryRun && !o.yes && !o.replace && typeof o.ask === 'function') {
    const yes = new Set();
    // The marker first: its answer decides what every template is filled with, so the rest is planned again.
    const marker = items.find((i) => i.path === '.hub/hub.json' && i.ask);
    if (marker && await o.ask(marker.ask)) {
      yes.add(marker.path);
      ({ items } = buildPlan(root, o, yes));
    }
    for (const it of items) {
      if (it.ask && it.path !== '.hub/hub.json' && await o.ask(it.ask)) yes.add(it.path);
    }
    if (yes.size) ({ items } = buildPlan(root, o, yes));
  }
  if (o.dryRun) return { items, changed: items.filter(changing).length, dryRun: true };

  fs.mkdirSync(root, { recursive: true });
  for (const it of items) {
    if (it.kind === 'dir' && it.mark === '+') fs.mkdirSync(abs(root, it.path), { recursive: true });
  }
  for (const it of items) {
    if (it.kind === 'file' && changing(it)) {
      const p = abs(root, it.path);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, it.content);
    }
  }
  const nav = items.find((i) => i.kind === 'nav');
  if (nav) {
    const r = writeNav(root, { replace: !!nav.own, date: o.date });
    nav.mark = r.changed ? (r.created ? '+' : '~') : '=';
    nav.note = r.changed ? (r.created ? 'generated' : 'regenerated') : '';
    setLine(nav);
  }
  return { items, changed: items.filter(changing).length };
}

/* ------------------------------------------------------------------ NAV.md */

function stampLine(date) {
  return `<!-- regenerated ${date} by hub nav. Edit .hub/nav.json, not this file. -->`;
}

function stripStamp(text) {
  return text.replace(STAMP_RE, '');
}

const cell = (s) => String(s).replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|');

/** The rows in .hub/nav.json. Throws when the file is there but is not JSON. */
function navRows(root) {
  const j = readJson(path.join(root, NAV_JSON));
  if (j === null) return { rows: [], skipped: 0 };
  const list = Array.isArray(j) ? j : Array.isArray(j && j.rows) ? j.rows : [];
  const rows = [];
  let skipped = 0;
  for (const r of list) {
    const say = r && (Array.isArray(r.say) ? r.say : typeof r.say === 'string' ? [r.say] : null);
    if (!say || !say.length || !say.every((x) => typeof x === 'string') || typeof r.path !== 'string' || !r.path.trim()) {
      skipped += 1;
      continue;
    }
    rows.push({ say, path: fwd(r.path.trim()) });
  }
  return { rows, skipped };
}

/** The code zone relative to the root (forward slashes), or null when the Hub has none yet. */
function codeZoneRel(root) {
  try { return fwd(path.relative(root, rootLib.codeZone(root))); } catch (_) { return null; }
}

/** NAV.md without its stamp line. Never throws for a half-made Hub: it says what is missing instead. */
function navBody(rootIn) {
  const root = path.resolve(rootIn);
  const hub = rootLib.readHub(root) || {};
  const machine = given(hub.machine) ? hub.machine : 'this computer';
  const workspace = given(hub.workspace) ? hub.workspace : DEFAULT_WORKSPACE;
  const zone = codeZoneRel(root);
  const L = [];

  L.push(`# NAV: ${machine}`);
  L.push('');
  L.push(`Where things are on ${machine}, in plain English. The Hub is \`${root}\`; every path below is inside it.`);
  L.push('Read this first, then work inside the one folder you need. Never search or list the whole Hub, a drive or the user folder.');
  L.push('');

  // Plain English to path.
  L.push('## Plain English to path');
  L.push('');
  L.push('| You say | It lives in |');
  L.push('|---|---|');
  const row = (say, where, here) => L.push(`| ${say.map((x) => `"${cell(x)}"`).join(', ')} | \`${cell(where)}\`${here ? '' : ' (not here yet)'} |`);
  let rows = [];
  let problem = '';
  try {
    const r = navRows(root);
    rows = r.rows;
    if (r.skipped) problem = `${plural(r.skipped, 'row', 'rows')} in \`.hub/nav.json\` skipped: each row needs "say" and "path".`;
  } catch (e) {
    problem = `\`.hub/nav.json\` could not be read (${cell(e.message)}). Fix it, then run hub nav again.`;
  }
  for (const r of rows) {
    const known = r.path.split('<')[0];
    row(r.say, r.path, !known || exists(abs(root, known)));
  }
  const projects = zone ? folders(abs(root, zone)) : [];
  const origins = {};
  for (const name of projects) {
    const dir = abs(root, `${zone}/${name}`);
    origins[name] = exists(path.join(dir, '.git')) ? { git: true, url: originOf(dir) } : { git: false, url: null };
    const gh = githubName(origins[name].url);
    row(gh && gh !== name ? [name, gh] : [name], `${zone}/${name}/`, true);
  }
  for (const company of folders(abs(root, '10-Business'))) {
    const spaced = company.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').toLowerCase();
    row(spaced !== company.toLowerCase() ? [company, spaced] : [company], `10-Business/${company}/`, true);
  }
  for (const key of folders(abs(root, '50-AI/agents'))) {
    let a = null;
    try { a = readJson(abs(root, `50-AI/agents/${key}/agent.json`)); } catch (_) { a = null; }
    const say = [a && typeof a.name === 'string' && a.name, a && typeof a.title === 'string' && a.title].filter(Boolean);
    row(say.length ? say : [key], `50-AI/agents/${key}/`, true);
  }
  if (problem) {
    L.push('');
    L.push(problem);
  }
  L.push('');

  // The zone tree: each zone and the folders directly inside it, names only.
  L.push('## The zone tree');
  L.push('');
  L.push(`Each zone and the folders directly inside it (at most ${TREE_MAX} shown per zone).`);
  L.push('');
  L.push('```text');
  for (const z of ZONES) {
    const p = abs(root, z.dir);
    if (!isDir(p)) {
      L.push(`${z.dir}/  (missing: run hub init)`);
      continue;
    }
    L.push(`${z.dir}/`);
    const kids = folders(p);
    if (kids.length) {
      const more = kids.length > TREE_MAX ? `  and ${kids.length - TREE_MAX} more` : '';
      L.push(`    ${kids.slice(0, TREE_MAX).map((k) => `${k}/`).join('  ')}${more}`);
    }
  }
  L.push('```');
  L.push('');

  // Projects.
  L.push('## Projects');
  L.push('');
  if (!zone) {
    L.push('This Hub has no code zone yet. Run hub init.');
  } else {
    L.push(`Code zone: \`${zone}/\`. One folder per project, each its own git repository with its own CLAUDE.md.`);
    L.push('');
    if (!projects.length) {
      L.push(`No projects yet. Make one with \`node ${workspace}/hub/bin/hub.js new-project <kebab-name>\`.`);
    } else {
      L.push('| Folder | Git repository | Remote (origin) |');
      L.push('|---|---|---|');
      for (const name of projects) {
        const o = origins[name];
        const remote = !o.git ? '' : o.url ? `\`${cell(o.url)}\`` : hasGit() ? 'none' : 'unknown (git is not installed)';
        L.push(`| \`${cell(name)}\` | ${o.git ? 'yes' : 'no'} | ${remote} |`);
      }
    }
  }
  L.push('');
  return L.join('\n');
}

/** The text of NAV.md for this Hub, stamped with opts.date (default today). */
function generateNav(root, opts) {
  const date = (opts && opts.date) || today();
  const body = navBody(root);
  const cut = body.indexOf('\n');
  return `${body.slice(0, cut + 1)}${stampLine(date)}\n${body.slice(cut + 1)}`;
}

/**
 * Writes NAV.md when its body changed; a second run with nothing new leaves the file alone. A NAV.md without the
 * stamp line was not made here: it is kept unless opts.replace. Returns { file, changed, created, kept }.
 * opts: { date, dryRun, replace }.
 */
function writeNav(rootIn, opts) {
  const o = opts || {};
  const root = path.resolve(rootIn);
  const file = path.join(root, NAV_FILE);
  const old = readText(file);
  if (old !== null && !STAMP_RE.test(old) && !o.replace) return { file, changed: false, kept: true };
  const text = generateNav(root, { date: o.date });
  if (old !== null && STAMP_RE.test(old) && stripStamp(old) === stripStamp(text)) return { file, changed: false };
  if (!o.dryRun) fs.writeFileSync(file, text);
  return { file, changed: true, created: old === null };
}

/* ------------------------------------------------------------------ new-project */

/** Makes <code zone>/<name>/ with CLAUDE.md, README.md and .gitignore, a git repository on main, then NAV.md. */
function newProject(rootIn, nameIn, opts) {
  const o = opts || {};
  const root = path.resolve(rootIn);
  if (!rootLib.isHub(root)) throw new HubError(`There is no Hub at ${root} (no .hub/hub.json). Run hub init first.`);
  const name = String(nameIn || '').trim();
  if (!name) throw new HubError('Give the project a name, like: hub new-project garden-planner');
  if (!KEBAB.test(name) || name.length > 64) {
    throw new HubError(`"${name}" is not a kebab-case name. Use lower-case letters and digits, in words joined by hyphens, like garden-planner.`);
  }
  if (RESERVED.test(name)) throw new HubError(`"${name}" is a name Windows keeps for itself. Pick another.`);
  let zoneAbs;
  try { zoneAbs = rootLib.codeZone(root); } catch (e) { throw new HubError(`${e.message} Run hub init first.`); }
  let there = null;
  try { there = rootLib.projectDir(root, name); } catch (_) { /* the name is free */ }
  if (there) throw new HubError(`A project called ${name} already exists at ${there}. Pick another name, or work in that one.`);

  const dir = path.join(zoneAbs, name);
  const rel = `${fwd(path.relative(root, zoneAbs))}/${name}`;
  const date = given(o.date) ? String(o.date) : today();
  const files = [
    ['CLAUDE.md', render(template('CLAUDE.project.md'), { name, date })],
    ['README.md', `# ${name}\n\n<What ${name} is, in a sentence or two.>\n`],
    ['.gitignore', GITIGNORE],
  ];
  const items = [{ mark: '+', path: `${rel}/` }, ...files.map(([f]) => ({ mark: '+', path: `${rel}/${f}` }))];
  const notes = [];
  const git = hasGit();
  if (git) items.push({ mark: '+', path: `${rel}/.git/`, note: 'a git repository on branch main' });
  else notes.push('git is not installed, so no repository was made. Install git, then run: git init -b main');

  if (o.dryRun) {
    items.push({ mark: '~', path: NAV_FILE, note: 'regenerated' });
    items.forEach(setLine);
    return { dir, items, notes, dryRun: true };
  }
  fs.mkdirSync(dir);
  for (const [f, content] of files) fs.writeFileSync(path.join(dir, f), content);
  if (git && !gitInit(dir)) {
    items.pop();
    notes.push(`git init did not work in ${dir}. Run it there yourself: git init -b main`);
  }
  const nav = writeNav(root, { date: o.date });
  if (nav.kept) items.push({ mark: '!', path: NAV_FILE, note: 'was not made by hub nav; kept, so the new project is not in it' });
  else items.push({ mark: nav.changed ? '~' : '=', path: NAV_FILE, note: nav.changed ? 'regenerated' : '' });
  items.forEach(setLine);
  return { dir, items, notes };
}

/* ------------------------------------------------------------------ doctor */

/** A read-only report on the Hub at root, within the same bounds as NAV.md. */
function doctor(rootIn, opts) {
  const o = opts || {};
  const root = path.resolve(rootIn);
  const now = given(o.date) ? String(o.date) : today();
  const items = [];
  const say = (level) => (text) => items.push({ level, text });
  const ok = say('ok');
  const note = say('note');
  const fix = say('fix');

  // The marker.
  let hub = null;
  if (!exists(path.join(root, MARKER))) {
    fix(`No .hub/hub.json, so this folder is not marked as a Hub. Run: hub init --root "${root}"`);
  } else {
    try { hub = readJson(path.join(root, MARKER)); } catch (e) { fix(`.hub/hub.json cannot be read (${e.message}). Fix it, or rename it and run hub init.`); }
    if (hub) {
      const gaps = ['machine', 'role', 'code_zone'].filter((k) => !given(hub[k]));
      if (gaps.length) fix(`.hub/hub.json has no ${gaps.join(', ')}. Run hub init to fill ${gaps.length === 1 ? 'it' : 'them'} in.`);
      else if (!ROLES.includes(hub.role)) fix(`.hub/hub.json says the role is "${hub.role}". It must be command, builder or mobile.`);
      else ok(`.hub/hub.json: ${hub.machine}, ${hub.role}, code in ${hub.code_zone}.`);
    }
  }

  // The zones and the code zone.
  const missing = ZONES.filter((z) => !isDir(path.join(root, z.dir))).map((z) => z.dir);
  if (missing.length) fix(`Missing ${missing.length === 1 ? 'zone' : 'zones'}: ${missing.join(', ')}. Run hub init to make ${missing.length === 1 ? 'it' : 'them'}.`);
  else ok(`All ${ZONES.length} zones are here.`);
  const zone = codeZoneRel(root);
  if (!zone) fix('There is no code zone. Run hub init to make it.');

  // The constitution.
  if (readText(path.join(root, 'CLAUDE.md')) === null) fix('No CLAUDE.md at the Hub root. Run hub init to write it.');
  else ok('CLAUDE.md is here.');

  // The rows and NAV.md.
  try { navRows(root); } catch (e) { fix(`.hub/nav.json cannot be read (${e.message}). Fix it, then run hub nav.`); }
  const nav = readText(path.join(root, NAV_FILE));
  if (nav === null) {
    fix('No NAV.md. Run hub nav to make it.');
  } else {
    const m = STAMP_RE.exec(nav);
    if (!m) {
      note('NAV.md was not made by hub nav (it has no stamp line), so nothing keeps it true. To have it generated, rename it and run hub nav.');
    } else {
      const age = daysBetween(m[1], now);
      const ago = `${m[1]}, ${plural(age, 'day', 'days')} ago`;
      if (stripStamp(nav) === navBody(root)) ok(`NAV.md matches the Hub (last changed ${ago}).`);
      else if (age > STALE_DAYS) fix(`NAV.md is stale: it no longer matches the Hub and was last made ${ago} (stale after ${STALE_DAYS} days). Run hub nav.`);
      else note(`NAV.md no longer matches the Hub (made ${ago}; stale after ${STALE_DAYS} days). Run hub nav.`);
    }
  }

  // The root: only the zones, CLAUDE.md, NAV.md, .hub and .claude belong there.
  const rootEntries = entries(root).filter((d) => !OS_JUNK.has(d.name.toLowerCase()));
  const strays = rootEntries.filter((d) => !ROOT_BELONGS.has(d.name));
  for (const d of strays) {
    fix(`${d.name}${d.isDirectory() ? '/' : ''} does not belong at the Hub root. Move it into its zone (unsure where: 00-Inbox/).`);
  }
  if (!strays.length) ok('Nothing at the Hub root that does not belong there.');

  // Dump piles and spaces: the root, each zone's own folder, and the code zone. Never deeper.
  const scope = rootEntries.map((d) => ({ rel: d.name, d, zone: '' }));
  for (const z of ZONES) {
    for (const d of entries(path.join(root, z.dir))) scope.push({ rel: `${z.dir}/${d.name}`, d, zone: z.dir });
  }
  if (zone && !ZONES.some((z) => z.dir === zone)) {
    for (const d of entries(abs(root, zone))) scope.push({ rel: `${zone}/${d.name}`, d, zone });
  }
  const piles = scope.filter((x) => x.d.isDirectory() && DUMP_PILES.some((re) => re.test(x.d.name)));
  for (const x of piles) {
    fix(`${x.rel}/ looks like a dump pile. Move each thing in it to its zone home (unsure: 00-Inbox/), then remove the empty folder.`);
  }
  if (!piles.length) ok('No dump-pile folders (Migration-*, _work, sort-later, misc).');
  // Unsorted downloads keep their names until they are sorted, so 00-Inbox is not held to the naming rule.
  const spaced = scope.filter((x) => x.zone !== '00-Inbox' && !OS_JUNK.has(x.d.name.toLowerCase()) && /\s/.test(x.d.name));
  for (const x of spaced) {
    fix(`"${x.rel}" has a space in its name. Rename it without spaces (PascalCase for folders, kebab-case for projects).`);
  }
  if (!spaced.length) ok('No names with spaces.');

  // Projects: every folder in the code zone is a git repository.
  if (zone) {
    const projects = folders(abs(root, zone));
    const loose = projects.filter((p) => !exists(abs(root, `${zone}/${p}/.git`)));
    for (const p of loose) fix(`${zone}/${p}/ is not a git repository. Run git init -b main there, or move it out of the code zone.`);
    if (!loose.length) ok(`Every project in ${zone}/ is a git repository (${projects.length}).`);
  }

  return { root, items, fixes: items.filter((i) => i.level === 'fix').length };
}

module.exports = {
  HubError, ROLES, STALE_DAYS, TEMPLATES,
  plan, init, generateNav, writeNav, newProject, doctor, skeleton, today,
};
