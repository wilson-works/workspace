'use strict';

/**
 * agents.js — the agent contract (agents/CONTRACT.md) in code. Node built-ins only.
 *
 * A specialist agent is a folder, <agents dir>/<key>/, holding an agent.json manifest. Writing that
 * file into an agents folder IS the registration: the office finds it by itself, so nobody edits
 * config/agents.json to add one.
 *
 *   validateManifest(obj)            { ok, errors }: the checks CONTRACT.md lists, in plain words
 *   listAgents(dirs)                 every <dir>/<key>/agent.json, one level down, never deeper:
 *                                    [{ key, dir, file, manifest, ok, errors }]
 *   freePort(dirs, from)             Promise of the first port from `from` (default 7600) that no
 *                                    agent.json uses and nothing listens on
 *   scaffold(dir, opts)              a new agent from agents/template/: { lines, manifest }
 *   installPackage(src, agentsDir, opts)  a package (folder, .zip or git URL) into the agents folder:
 *                                    Promise of { ok, refused, errors, key, target, lines, started, ... }
 *   startAgent(dir) / stopAgent(dir) its dashboard, detached; the pid is kept in dashboard/.pid and
 *                                    a stop only ever stops that pid
 *   autostart(dirs, note)            the office's start: every agent with autostart: true that is down
 *   registerSubagent(...), moveToDumpQueue(...), probeLocal(...), waitUp(...), ask(...)
 *
 * Rules this file keeps:
 *   - Nothing from a package runs while it is installed. Only `git clone`, and tar, ditto or unzip
 *     for a .zip, touch it, into a temporary folder; its `start` runs later, after a yes.
 *   - `start` runs without a shell: a program and its arguments ("node dashboard/server.js").
 *   - Nothing is deleted. A replaced or removed agent folder is moved to
 *     <Hub>/90-Archive/_DumpQueue/agent-<key>-<YYYY-MM-DD>/ for its owner to delete.
 *   - A symbolic link inside a package is never copied, and never followed.
 */

const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { startDetached, readPid } = require('../../bin/detach');

const MANIFEST = 'agent.json';
const KEY_RE = /^[a-z][a-z0-9-]{0,30}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const IMAGE_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*\.(svg|png)$/i;
const LOCAL_DOOR_RE = /^http:\/\/(127\.0\.0\.1|localhost):(\d{1,5})(\/\S*)?$/;
const PHONE_DOOR_RE = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.ts\.net(:\d{1,5})?(\/\S*)?$/i;
const COLORS = ['bg', 'panel', 'ink', 'accent', 'accent2'];
const STATUSES = ['live', 'building', 'planned'];
const PORT_FROM = 7600;
const TEMPLATE = path.join(__dirname, '..', 'template');
// Files a running agent writes for itself: never part of a package, never compared or copied.
const RUNTIME = new Set(['dashboard/.pid', 'dashboard/dashboard.log']);
const SKIP_DIRS = new Set(['.git']);
// Accent colours for an agent made without --color, picked by its key so the same key gets the same one.
const ACCENTS = ['#38BDF8', '#F472B6', '#34D399', '#FBBF24', '#A78BFA', '#FB923C', '#22D3EE', '#F87171'];

const portOk = (n) => Number.isInteger(n) && n >= 1024 && n <= 65535;
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const fwd = (p) => String(p).replace(/\\/g, '/');

/** A plain image file name: no folders, no "..", ending .svg or .png. */
function isImageName(name) {
  return typeof name === 'string' && IMAGE_RE.test(name) && !name.includes('..');
}

/** The port of a door.local address, or null when it is not one. */
function doorPort(url) {
  const m = LOCAL_DOOR_RE.exec(String(url || ''));
  return m && portOk(Number(m[2])) ? Number(m[2]) : null;
}

function urlPath(u) {
  try { return new URL(u).pathname; } catch (_) { return null; }
}

/* --------------------------------------------------------------- the contract */

/** { ok, errors } for one agent.json. Each error is a plain sentence naming the field. */
function validateManifest(m) {
  const errors = [];
  const bad = (s) => errors.push(s);
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { ok: false, errors: ['agent.json must hold one JSON object.'] };

  if (typeof m.key !== 'string' || !KEY_RE.test(m.key)) {
    bad('key must start with a lower-case letter and use only a-z, 0-9 and "-", at most 31 characters.');
  }
  if (!isStr(m.name) || m.name.length > 40) bad('name is required, at most 40 characters.');
  if (m.title != null && (typeof m.title !== 'string' || m.title.length > 60)) bad('title must be text, at most 60 characters.');
  if (m.line != null && (typeof m.line !== 'string' || m.line.length > 200)) bad('line must be text, at most 200 characters.');
  if (m.status != null && !STATUSES.includes(m.status)) bad(`status must be one of ${STATUSES.join(', ')}.`);

  const door = m.door;
  if (door != null && (typeof door !== 'object' || Array.isArray(door))) bad('door must be an object with local and phone.');
  const local = door && typeof door === 'object' ? door.local : null;
  const phone = door && typeof door === 'object' ? door.phone : null;
  if (local != null && doorPort(local) == null) {
    bad('door.local must be http://127.0.0.1:<port>/... or http://localhost:<port>/..., with a port from 1024 to 65535.');
  }
  if (phone != null && !PHONE_DOOR_RE.test(String(phone))) bad('door.phone must be https://<name>.ts.net/... (your tailnet address) or null.');

  const probe = m.probe;
  if (probe != null) {
    if (typeof probe !== 'object' || Array.isArray(probe)) bad('probe must be {"port", "path"}, {"url"} or null.');
    else if (probe.url != null) {
      if (probe.port != null) bad('probe has both a url and a port: give one.');
      if (!PHONE_DOOR_RE.test(String(probe.url))) bad('probe.url must be an https://<name>.ts.net/... address.');
    } else {
      if (!portOk(probe.port)) bad('probe.port must be a whole number from 1024 to 65535.');
      if (typeof probe.path !== 'string' || !probe.path.startsWith('/') || probe.path.startsWith('//')) bad('probe.path must start with "/", for example "/health".');
    }
    // The probe rule: the office checks this address every 20 seconds, so it must never be a page
    // that hands out a login or a token (a dashboard's /open often does, as a redirect).
    const probePath = probe && typeof probe === 'object' ? (probe.url ? urlPath(probe.url) : probe.path) : null;
    const doorPaths = [local, phone].filter((d) => typeof d === 'string').map(urlPath).filter(Boolean);
    if (probePath && /^\/open(\/|$)/i.test(probePath)) bad('probe must not be /open: that page hands out a login token.');
    else if (probePath && doorPaths.includes(probePath)) bad(`probe ${probePath} is also a door. Probe a page that hands out no login, such as /health.`);
    if (probe && typeof probe === 'object' && portOk(probe.port) && doorPort(local) != null && doorPort(local) !== probe.port) {
      bad(`probe.port ${probe.port} and the port in door.local (${doorPort(local)}) must be the same.`);
    }
  }

  const brand = m.brand;
  if (!brand || typeof brand !== 'object' || Array.isArray(brand)) bad(`brand is required, with the colours ${COLORS.join(', ')} as #rrggbb.`);
  else {
    for (const c of COLORS) if (!HEX_RE.test(String(brand[c] || ''))) bad(`brand.${c} must be a colour written #rrggbb.`);
    if (brand.font != null && typeof brand.font !== 'string') bad('brand.font must be text.');
    if (brand.mark != null && !isImageName(brand.mark)) bad('brand.mark must be a file name in the agent folder ending .svg or .png (no folders, no "..").');
  }
  if (m.art != null && !isImageName(m.art)) bad('art must be a file name in the agent folder ending .svg or .png (no folders, no "..").');

  if (m.jokes != null) {
    if (!Array.isArray(m.jokes) || m.jokes.length > 12) bad('jokes must be a list of at most 12.');
    else if (m.jokes.some((j) => !isStr(j) || j.length > 160)) bad('each joke must be text of at most 160 characters.');
  }
  if (m.match != null && (!Array.isArray(m.match) || m.match.some((w) => !isStr(w)))) bad('match must be a list of words.');
  if (m.start != null && !isStr(m.start)) bad('start must be the command that starts its dashboard, for example "node dashboard/server.js".');
  if (m.autostart != null && typeof m.autostart !== 'boolean') bad('autostart must be true or false.');
  if (m.autostart === true) {
    if (!isStr(m.start)) bad('autostart is true, so start is needed.');
    if (!probe || typeof probe !== 'object' || !portOk(probe.port)) bad('autostart is true, so a probe with a port is needed (that is how the office sees it is up).');
  }
  return { ok: errors.length === 0, errors };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch (_) { return false; } }
function isPlainFile(p) { try { return fs.lstatSync(p).isFile(); } catch (_) { return false; } }

/** The images a manifest names that are missing from its folder. */
function missingFiles(dir, m) {
  const named = [m && m.brand && m.brand.mark, m && m.art].filter(isImageName);
  return named.filter((f) => !isPlainFile(path.join(dir, f))).map((f) => `${f} is named in agent.json but is not in the folder.`);
}

/**
 * Every <dir>/<key>/agent.json: one level down, never deeper. A folder whose name differs from its
 * key, a key already found in an earlier folder, or a missing image is an error on that entry.
 */
function listAgents(dirs) {
  const out = [];
  const seen = new Map();
  for (const d of [].concat(dirs || []).filter(Boolean)) {
    let names = [];
    try { names = fs.readdirSync(d).sort(); } catch (_) { continue; }
    for (const name of names) {
      const dir = path.join(d, name);
      const file = path.join(dir, MANIFEST);
      if (!isDir(dir) || !fs.existsSync(file)) continue;
      let manifest = null;
      let errors;
      try {
        manifest = readJson(file);
        errors = validateManifest(manifest).errors;
        if (manifest && manifest.key !== name) errors.push(`key "${manifest && manifest.key}" must be the same as its folder name "${name}".`);
        errors.push(...missingFiles(dir, manifest));
      } catch (e) {
        errors = [`agent.json is not valid JSON (${e.message}).`];
      }
      if (seen.has(name)) errors.push(`an agent called ${name} is already in ${seen.get(name)}.`);
      else seen.set(name, d);
      out.push({ key: name, dir, file, manifest, ok: errors.length === 0, errors });
    }
  }
  return out;
}

/* ------------------------------------------------------------------- ports */

/** The ports agent.json files already claim (probe.port and door.local), except one key's own. */
function usedPorts(dirs, except) {
  const used = new Set();
  for (const a of listAgents(dirs)) {
    if (a.key === except || !a.manifest) continue;
    const p = a.manifest.probe && a.manifest.probe.port;
    if (portOk(p)) used.add(p);
    const d = a.manifest.door && doorPort(a.manifest.door.local);
    if (d) used.add(d);
  }
  return used;
}

/** True when something on this computer already listens on 127.0.0.1:<port>. */
function listening(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(true));
    s.once('listening', () => s.close(() => resolve(false)));
    s.listen(port, '127.0.0.1');
  });
}

/** The first port from `from` (default 7600) that no agent.json uses and nothing listens on. */
async function freePort(dirs, from, opts) {
  const used = usedPorts(dirs, opts && opts.except);
  for (let p = from || PORT_FROM; p <= 65535; p += 1) {
    if (used.has(p)) continue;
    if (!(await listening(p))) return p;
  }
  throw new Error(`No free port from ${from || PORT_FROM} up.`);
}

/** A copy of a manifest moved to another port: probe.port and the port in door.local. */
function withPort(m, port) {
  const c = JSON.parse(JSON.stringify(m));
  if (c.probe && portOk(c.probe.port)) c.probe.port = port;
  if (c.door && doorPort(c.door.local)) c.door.local = c.door.local.replace(/^(http:\/\/(?:127\.0\.0\.1|localhost):)\d+/, `$1${port}`);
  return c;
}

const manifestPort = (m) => (m.probe && portOk(m.probe.port) ? m.probe.port : (m.door && doorPort(m.door.local)) || null);

/* ---------------------------------------------------------------- template */

function mix(hex, toward, t) {
  const a = hex.slice(1).match(/../g).map((x) => parseInt(x, 16));
  const b = toward.slice(1).match(/../g).map((x) => parseInt(x, 16));
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** The five brand colours from one accent: a dark room in its colour, light ink. */
function palette(accent) {
  const a = accent.toUpperCase();
  return { bg: mix(a, '#05070D', 0.88), panel: mix(a, '#05070D', 0.68), ink: '#EEF2F8', accent: a, accent2: mix(a, '#FFFFFF', 0.35) };
}

function accentFor(key) {
  const h = crypto.createHash('sha256').update(String(key)).digest();
  return ACCENTS[h[0] % ACCENTS.length];
}

const ESCAPE = {
  json: (s) => JSON.stringify(String(s)).slice(1, -1),
  xml: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])),
  raw: (s) => String(s),
};

/** Fill {{word}} placeholders. Unknown ones stay as they are ({{agent_dir}} is filled on registration). */
function fill(text, values, kind) {
  const esc = ESCAPE[kind] || ESCAPE.raw;
  let t = text;
  if (kind === 'json' && values.port != null) t = t.split('"{{port}}"').join(String(values.port));
  return t.replace(/\{\{(\w+)\}\}/g, (all, k) => (Object.prototype.hasOwnProperty.call(values, k) ? esc(values[k]) : all));
}

const kindOf = (file) => (/\.json$/i.test(file) ? 'json' : /\.svg$/i.test(file) ? 'xml' : 'raw');

/** Every file under a folder, as forward-slash relative paths. Symbolic links are left out. */
function walk(root, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) out.push(...walk(root, r)); } else if (e.isFile()) out.push(r);
  }
  return out.sort();
}

function today(d) {
  const x = d || new Date();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/** The values a new agent's template is filled with. */
function templateValues(o) {
  const name = String(o.name).trim();
  const title = String(o.title || '').trim();
  const line = String(o.line || '').trim();
  const pal = palette(o.color && HEX_RE.test(o.color) ? o.color : accentFor(o.key));
  const initial = (/[A-Za-z0-9]/.exec(name) || [o.key[0]])[0].toUpperCase();
  const description = `${name}, ${title || 'a specialist agent'}.${line ? ` ${line}` : ''} Use for ${name}'s work.`;
  // The second word that finds its sessions on the floor: its name, or its title when the name is its key.
  const matchWord = name.toLowerCase() !== o.key ? name.toLowerCase() : (title.toLowerCase().replace(/^the\s+/, '') || o.key);
  return Object.assign({
    key: o.key, name, title, line, port: o.port, initial, date: o.date || today(),
    match_word: matchWord, description_yaml: JSON.stringify(description),
  }, pal);
}

/**
 * A new agent in `dir` (its own folder, which must not exist yet) from agents/template/.
 * opts { key, name, title, line, color, port, date, dryRun }. Returns { lines, manifest }.
 * Everything is checked before the first file is written.
 */
function scaffold(dir, opts) {
  const o = opts || {};
  if (!KEY_RE.test(String(o.key || ''))) throw new Error(`"${o.key}" is not a key: use a-z, 0-9 and "-", starting with a letter.`);
  if (!portOk(o.port)) throw new Error('A port from 1024 to 65535 is needed.');
  if (fs.existsSync(dir)) throw new Error(`${dir} already exists.`);
  const values = templateValues(o);
  const files = walk(TEMPLATE).map((rel) => ({ rel, text: fill(fs.readFileSync(path.join(TEMPLATE, rel), 'utf8'), values, kindOf(rel)) }));
  const manifest = JSON.parse(files.find((f) => f.rel === MANIFEST).text);
  const v = validateManifest(manifest);
  if (!v.ok) throw new Error(`The new agent.json would not pass the contract: ${v.errors.join(' ')}`);
  const lines = files.map((f) => `+ ${fwd(path.join(dir, f.rel))}`);
  if (!o.dryRun) {
    for (const f of files) {
      const to = path.join(dir, ...f.rel.split('/'));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, f.text, 'utf8');
    }
  }
  return { lines, manifest };
}

/* ------------------------------------------------------- subagent registration */

/**
 * The Claude Code subagent for an agent: its own subagent.md (read from `readFrom`, default its
 * folder), else one from the template, with {{agent_dir}} filled in as the agent's folder.
 */
function subagentText(agentDir, manifest, readFrom) {
  const own = path.join(readFrom || agentDir, 'subagent.md');
  const m = manifest || readJson(path.join(readFrom || agentDir, MANIFEST));
  const text = isPlainFile(own)
    ? fs.readFileSync(own, 'utf8')
    : fill(fs.readFileSync(path.join(TEMPLATE, 'subagent.md'), 'utf8'), templateValues({ key: m.key, name: m.name, title: m.title, line: m.line }), 'raw');
  return text.split('{{agent_dir}}').join(fwd(path.resolve(agentDir)));
}

/**
 * <subagentsDir>/<key>.md: absent, written (+); the same (=); different, kept (!) unless replace (~).
 * Returns the plan line.
 */
function registerSubagent(subagentsDir, key, text, opts) {
  const o = opts || {};
  const file = path.join(subagentsDir, `${key}.md`);
  const shown = fwd(file);
  if (fs.existsSync(file)) {
    const now = fs.readFileSync(file, 'utf8');
    if (now === text) return `= ${shown}`;
    if (!o.replace) return `! ${shown} is yours and differs; kept. To use the new one, move yours away and run this again.`;
    if (!o.dryRun) fs.writeFileSync(file, text, 'utf8');
    return `~ ${shown}`;
  }
  if (!o.dryRun) {
    fs.mkdirSync(subagentsDir, { recursive: true });
    fs.writeFileSync(file, text, 'utf8');
  }
  return `+ ${shown}`;
}

/* ---------------------------------------------------------- start and stop */

/** "node dashboard/server.js" -> ['node', 'dashboard/server.js']; double quotes group words. */
function splitCommand(s) {
  const out = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(String(s)))) out.push(m[1] != null ? m[1] : m[2]);
  return out;
}

const pidFile = (dir) => path.join(dir, 'dashboard', '.pid');

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** The pid in dashboard/.pid while that process is alive, else null. */
function runningPid(dir) {
  try {
    const pid = Number(fs.readFileSync(pidFile(dir), 'utf8').trim());
    return alive(pid) ? pid : null;
  } catch (_) { return null; }
}

/** An HTTP answer below 500 from 127.0.0.1:<port><path> within the timeout. Never a token page (see validateManifest). */
function probeLocal(probe, timeoutMs) {
  return new Promise((resolve) => {
    if (!probe || !portOk(probe.port)) { resolve(false); return; }
    const req = http.get({ host: '127.0.0.1', port: probe.port, path: probe.path || '/', timeout: timeoutMs || 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode < 500);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

/** Wait until its probe answers, up to `ms`. */
async function waitUp(probe, ms) {
  const until = Date.now() + (ms || 15000);
  while (Date.now() < until) {
    if (await probeLocal(probe, 1000)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/**
 * Start an agent's dashboard: its `start` command, without a shell, in its folder, detached through
 * bin/detach.js (so it never holds the output of the command that started it), logging to
 * dashboard/dashboard.log. Resolves to the pid, also written to dashboard/.pid.
 */
async function startAgent(dir) {
  const m = readJson(path.join(dir, MANIFEST));
  if (!isStr(m.start)) throw new Error(`${m.name || path.basename(dir)} has no start command in agent.json.`);
  const argv = splitCommand(m.start);
  const cmd = argv[0] === 'node' ? process.execPath : argv[0];
  fs.mkdirSync(path.join(dir, 'dashboard'), { recursive: true });
  const pf = pidFile(dir);
  const started = startDetached(cmd, argv.slice(1), { cwd: dir, log: path.join(dir, 'dashboard', 'dashboard.log'), pidFile: pf });
  const pid = started.pid || await readPid(pf, 8000);
  if (!pid) throw new Error(`Could not start "${m.start}": is ${argv[0]} installed? See dashboard/dashboard.log.`);
  return pid;
}

/** Stop the dashboard by the pid in dashboard/.pid, and only that pid. { stopped } or { none }. */
async function stopAgent(dir) {
  const pid = runningPid(dir);
  if (!pid) {
    try { fs.rmSync(pidFile(dir), { force: true }); } catch (_) { /* a stale pid file only */ }
    return { none: true };
  }
  process.kill(pid);
  for (let i = 0; i < 40 && alive(pid); i += 1) await new Promise((r) => setTimeout(r, 125));
  if (alive(pid)) throw new Error(`pid ${pid} is still running.`);
  fs.rmSync(pidFile(dir), { force: true });
  return { stopped: pid };
}

/**
 * The office's start (bin/office-start.js): start every valid agent with autostart: true whose probe
 * does not answer. Probes run side by side; a failure is noted, never thrown.
 */
async function autostart(dirs, note) {
  const say = note || (() => {});
  const want = listAgents(dirs).filter((a) => a.ok && a.manifest.autostart === true);
  const up = await Promise.all(want.map((a) => probeLocal(a.manifest.probe)));
  const started = [];
  for (const [i, a] of want.entries()) {
    if (up[i]) continue;
    try {
      const pid = await startAgent(a.dir);
      started.push(a.key);
      say(`started agent ${a.key} (pid ${pid}), logging to ${path.join(a.dir, 'dashboard', 'dashboard.log')}`);
    } catch (e) { say(`could not start agent ${a.key}: ${e.message}`); }
  }
  return started;
}

/* --------------------------------------------------------------- moving */

function hashFile(f) { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); }

/** Copy a folder's files (no links, no .git, no runtime files). Returns the relative paths copied. */
function copyTree(from, to) {
  const files = walk(from).filter((r) => !RUNTIME.has(r));
  for (const r of files) {
    const dst = path.join(to, ...r.split('/'));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(from, ...r.split('/')), dst);
  }
  return files;
}

/** Move a folder: a rename when it can be, else copy, check every file's hash, then remove the original. */
function moveDir(from, to) {
  try {
    fs.renameSync(from, to);
    return;
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
  }
  const files = walk(from);
  for (const r of files) {
    const dst = path.join(to, ...r.split('/'));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(from, ...r.split('/')), dst);
  }
  for (const r of files) {
    if (hashFile(path.join(from, ...r.split('/'))) !== hashFile(path.join(to, ...r.split('/')))) {
      throw new Error(`The copy of ${r} in ${to} does not match; the original was left where it is.`);
    }
  }
  fs.rmSync(from, { recursive: true });
}

/**
 * Move an agent folder (and its subagent registration, when given) to
 * <hub>/90-Archive/_DumpQueue/agent-<key>-<YYYY-MM-DD>[-n]/. Returns that folder.
 */
function moveToDumpQueue(agentDir, hubRoot, key, opts) {
  const o = opts || {};
  const queue = path.join(hubRoot, '90-Archive', '_DumpQueue');
  let to = path.join(queue, `agent-${key}-${today(o.date)}`);
  for (let n = 2; fs.existsSync(to); n += 1) to = path.join(queue, `agent-${key}-${today(o.date)}-${n}`);
  if (o.dryRun) return to;
  fs.mkdirSync(queue, { recursive: true });
  moveDir(agentDir, to);
  if (o.subagentFile && fs.existsSync(o.subagentFile)) {
    fs.copyFileSync(o.subagentFile, path.join(to, `subagent-registration-${key}.md`));
    if (hashFile(o.subagentFile) === hashFile(path.join(to, `subagent-registration-${key}.md`))) fs.rmSync(o.subagentFile);
  }
  return to;
}

/* ---------------------------------------------------------------- packages */

const GIT_URL_RE = /^(https:\/\/\S+|ssh:\/\/\S+|git@[\w.-]+:\S+)$/i;

/** A package as a folder to read: { dir, temp } (temp is removed afterwards). Nothing in it runs. */
function unpack(src) {
  const s = String(src || '').trim();
  if (isDir(s)) return { dir: path.resolve(s), temp: null };
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-agent-'));
  const run = (cmd, args) => execFileSync(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, windowsHide: true,
    env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' }),
  });
  try {
    if (GIT_URL_RE.test(s)) {
      run('git', ['clone', '--depth', '1', '--quiet', s, path.join(temp, 'package')]);
    } else if (/\.zip$/i.test(s) && isPlainFile(s)) {
      const into = path.join(temp, 'package');
      fs.mkdirSync(into);
      if (process.platform === 'win32') run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', path.resolve(s), '-C', into]);
      else if (process.platform === 'darwin') run('ditto', ['-x', '-k', path.resolve(s), into]);
      else run('unzip', ['-q', path.resolve(s), '-d', into]);
    } else {
      throw Object.assign(new Error(`${s} is not a folder, a .zip file or a git address (https://..., ssh://... or git@...).`), { refused: true });
    }
  } catch (e) {
    fs.rmSync(temp, { recursive: true, force: true });
    if (e.refused) throw e;
    throw Object.assign(new Error(`Could not read the package ${s}: ${String(e.stderr || e.message).trim().split(/\r?\n/)[0]}`), { refused: true });
  }
  return { dir: path.join(temp, 'package'), temp };
}

/** The folder in a package that holds agent.json: its top, or its one sub-folder (a zip that wraps). */
function packageTop(dir) {
  if (isPlainFile(path.join(dir, MANIFEST))) return dir;
  const subs = fs.readdirSync(dir).filter((n) => isDir(path.join(dir, n)) && !SKIP_DIRS.has(n));
  if (subs.length === 1 && isPlainFile(path.join(dir, subs[0], MANIFEST))) return path.join(dir, subs[0]);
  return null;
}

/** True when an installed agent holds exactly the package (its port aside, and what it wrote while running). */
function sameAsInstalled(pkgDir, pkgManifest, target) {
  let installed;
  try { installed = readJson(path.join(target, MANIFEST)); } catch (_) { return false; }
  const port = manifestPort(installed);
  const want = port ? withPort(pkgManifest, port) : pkgManifest;
  if (JSON.stringify(want) !== JSON.stringify(installed)) return false;
  const a = walk(pkgDir).filter((r) => !RUNTIME.has(r) && r !== MANIFEST);
  const b = walk(target).filter((r) => !RUNTIME.has(r) && r !== MANIFEST);
  if (a.join('\n') !== b.join('\n')) return false;
  return a.every((r) => hashFile(path.join(pkgDir, ...r.split('/'))) === hashFile(path.join(target, ...r.split('/'))));
}

/**
 * Install an agent package into `agentsDir`.
 *   src   a folder, a .zip file or a git address, with agent.json at its top
 *   opts  { dirs (every agents folder, for ports), subagentsDir, hubRoot (for the DumpQueue),
 *           dryRun, yes, force, start (false: never start), ask (async question -> true/false),
 *           from (first port to try, default 7600) }
 * Never runs anything from the package. Returns { ok, refused, errors, key, target, lines, port, started,
 * startFailed, unchanged (already installed, the same), kept (yours differs and was kept) }.
 */
async function installPackage(src, agentsDir, opts) {
  const o = opts || {};
  const ask = o.ask || (async () => false);
  const lines = [];
  let pkg;
  try { pkg = unpack(src); } catch (e) { return { ok: false, refused: true, errors: [e.message], lines }; }
  try {
    const top = packageTop(pkg.dir);
    if (!top) return { ok: false, refused: true, errors: ['The package has no agent.json at its top.'], lines };
    let manifest;
    try { manifest = readJson(path.join(top, MANIFEST)); } catch (e) {
      return { ok: false, refused: true, errors: [`Its agent.json is not valid JSON (${e.message}).`], lines };
    }
    const v = validateManifest(manifest);
    const errors = v.errors.concat(missingFiles(top, manifest));
    if (errors.length) return { ok: false, refused: true, errors, lines };

    const key = manifest.key;
    const target = path.join(agentsDir, key);
    const dirs = [...new Set([agentsDir].concat(o.dirs || []).map((d) => path.resolve(d)))];
    const shown = fwd(target);

    // 1. Already there?
    if (fs.existsSync(target)) {
      if (sameAsInstalled(top, manifest, target)) {
        lines.push(`= ${shown} (already installed)`);
        if (o.subagentsDir) lines.push(registerSubagent(o.subagentsDir, key, subagentText(target), { dryRun: o.dryRun }));
        return { ok: true, key, target, lines, started: false, unchanged: true };
      }
      const replace = o.force || (!o.yes && !o.dryRun && await ask(`${manifest.name} is already installed at ${target}, and it differs. Replace it? Yours moves to the archive's _DumpQueue.`));
      if (!replace) {
        lines.push(`! ${shown} is already there and differs; kept. To replace it, run again with --force (yours moves to 90-Archive/_DumpQueue).`);
        return { ok: true, key, target, lines, started: false, kept: true };
      }
      if (!o.hubRoot) return { ok: false, refused: true, errors: ['Replacing an agent needs the Hub, to move the old one to its _DumpQueue.'], lines };
      const old = runningPid(target);
      if (old && !o.dryRun) await stopAgent(target);
      const queued = moveToDumpQueue(target, o.hubRoot, key, { dryRun: o.dryRun });
      lines.push(`~ ${shown} replaced; the old one ${o.dryRun ? 'would move' : 'moved'} to ${fwd(queued)}${old ? ` (its dashboard, pid ${old}, ${o.dryRun ? 'would be' : 'was'} stopped first)` : ''}`);
    }

    // 2. Its port: the one it asks for, unless another agent uses it or something listens there.
    let final = manifest;
    const want = manifestPort(manifest);
    if (want && (usedPorts(dirs, key).has(want) || await listening(want))) {
      const port = await freePort(dirs, o.from || PORT_FROM, { except: key });
      final = withPort(manifest, port);
      lines.push(`~ port ${want} is taken, so ${manifest.name} gets port ${port} (probe.port and door.local in its agent.json)`);
    }

    // 3. Copy it in (the folder is new, or the old one has just moved out). Links, .git and a
    //    running agent's own files stay behind.
    lines.push(`+ ${shown}/ (${walk(top).filter((r) => !RUNTIME.has(r)).length} files)`);
    if (!o.dryRun) {
      copyTree(top, target);
      if (final !== manifest) fs.writeFileSync(path.join(target, MANIFEST), `${JSON.stringify(final, null, 2)}\n`, 'utf8');
    }

    // 4. Its subagent, so any session on the Hub can call it.
    if (o.subagentsDir) {
      lines.push(registerSubagent(o.subagentsDir, key, subagentText(target, final, top), { dryRun: o.dryRun, replace: o.force }));
    }

    // 5. Start it when it asks to be started, after a yes.
    let started = false;
    let startFailed = false;
    if (final.autostart === true && o.start !== false && !o.dryRun && (o.yes || await ask(`Start ${final.name}'s dashboard now?`))) {
      const pid = await startAgent(target);
      started = await waitUp(final.probe, 15000);
      startFailed = !started;
      lines.push(started
        ? `+ started ${final.name}'s dashboard (pid ${pid})`
        : `! started ${final.name} (pid ${pid}), but it did not answer within 15 seconds; see ${fwd(path.join(target, 'dashboard', 'dashboard.log'))}`);
    }
    return { ok: !startFailed, key, target, lines, started, startFailed, port: manifestPort(final) };
  } finally {
    if (pkg.temp) fs.rmSync(pkg.temp, { recursive: true, force: true });
  }
}

/* --------------------------------------------------------------- questions */

/** Ask a yes/no question on the terminal. With nobody at the terminal, the answer is no. */
function ask(question) {
  if (!process.stdin.isTTY) {
    process.stdout.write(`${question} (nobody to answer here, so: no)\n`);
    return Promise.resolve(false);
  }
  const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(`${question} [y/N] `, (a) => { rl.close(); resolve(/^y(es)?$/i.test(a.trim())); }));
}

module.exports = {
  MANIFEST, KEY_RE, PORT_FROM, TEMPLATE,
  validateManifest, listAgents, freePort, scaffold, installPackage,
  isImageName, doorPort, usedPorts, listening, withPort, palette, fill, templateValues,
  subagentText, registerSubagent, splitCommand, startAgent, stopAgent, runningPid, probeLocal, waitUp,
  autostart, moveToDumpQueue, ask, today,
};
