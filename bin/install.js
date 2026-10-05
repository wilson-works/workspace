#!/usr/bin/env node
'use strict';

/**
 * install.js - put the WorkSpace into Claude Code, one part at a time.
 *
 *   node bin/install.js                                  the plan for every part; changes nothing
 *   node bin/install.js hooks        [--apply | --remove]
 *   node bin/install.js permissions  [--apply | --remove]
 *   node bin/install.js startup      [--apply | --remove]
 *   node bin/install.js org --into "<folder>" [--apply] [--force]
 *
 * Without --apply (or --remove) a part only prints what it would change.
 * Before a settings file changes it is copied to <file>.bak-<date-time>.
 *
 *   hooks        the office's hooks in your user settings (<claude home>/settings.json), so
 *                EVERY session on this computer shows up on the floor and can get notes.
 *                (Sessions started inside this folder already do, through .claude/settings.json.)
 *   permissions  the permission setup (guides/03-permissions.md): a deny list for destructive
 *                commands, an ask list for deploys, and the walkaway hooks for unattended
 *                sessions, plus <claude home>/walkaway.local.json from your workspace.config.json.
 *   startup      start the office when you log in (Windows Startup folder, macOS LaunchAgent,
 *                Linux autostart).
 *   org          copy the CTO org (org/) into a project: 18 agents, the comms bus, the path guard
 *                and its settings entry. Existing files are left alone unless --force.
 *
 * Exit codes: 0 done (or plan shown); 2 refused (bad arguments, unreadable settings).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const config = require('../src/server/config');
const { claudeHome } = require('../src/server/home');

const ROOT = path.resolve(__dirname, '..');
const fwd = (p) => String(p).replace(/\\/g, '/');
const R = fwd(ROOT);

const args = process.argv.slice(2);
const part = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--into');
const apply = args.includes('--apply');
const remove = args.includes('--remove');
const force = args.includes('--force');
const argOf = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const out = (s = '') => process.stdout.write(`${s}\n`);
const refuse = (s) => { out(`NOT DONE: ${s}`); process.exit(2); };

/* ------------------------------------------------------------------ helpers */

function readJson(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  if (!text.trim()) return {};
  return JSON.parse(text);
}

function backup(file) {
  if (!fs.existsSync(file)) return null;
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  let b = `${file}.bak-${stamp}`;
  for (let n = 2; fs.existsSync(b); n += 1) b = `${file}.bak-${stamp}-${n}`;
  fs.copyFileSync(file, b);
  return b;
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

function settingsFile() { return path.join(claudeHome(), 'settings.json'); }

function loadSettings(file) {
  try { return readJson(file); } catch (e) { return refuse(`${file} is not valid JSON (${e.message}). Fix it first; nothing was changed.`); }
}

/** The Python command on this computer, for the Python hooks. A Microsoft Store alias does not count. */
function python() {
  for (const [cmd, pre] of [['python', []], ['py', ['-3']], ['python3', []]]) {
    try {
      const v = execFileSync(cmd, pre.concat(['-c', 'import sys;print(sys.version_info[0])']), { encoding: 'utf8', timeout: 8000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (v === '3') return [cmd].concat(pre).join(' ');
    } catch (_) { /* try the next */ }
  }
  return null;
}

/** Every hook command already in a settings object, per event. */
function commandsIn(settings, ev) {
  const groups = (settings.hooks && settings.hooks[ev]) || [];
  return groups.flatMap((g) => (g && Array.isArray(g.hooks) ? g.hooks : [])).map((h) => h && h.command).filter(Boolean);
}

/** Add hook entries ({event: [entry]}) that are not there yet. Returns the plan lines. */
function addHooks(settings, entries, matcherOf) {
  const lines = [];
  settings.hooks = settings.hooks || {};
  for (const [ev, list] of Object.entries(entries)) {
    for (const h of list) {
      if (commandsIn(settings, ev).includes(h.command)) { lines.push(`  = ${ev}: ${h.command}  (already there)`); continue; }
      settings.hooks[ev] = settings.hooks[ev] || [];
      const group = { hooks: [h] };
      const m = matcherOf && matcherOf(ev);
      if (m) group.matcher = m;
      settings.hooks[ev].push(group);
      lines.push(`  + ${ev}: ${h.command}`);
    }
  }
  return lines;
}

/** Take out every hook entry whose command mentions `needle`. Returns the plan lines. */
function removeHooks(settings, needle) {
  const lines = [];
  for (const ev of Object.keys(settings.hooks || {})) {
    const groups = settings.hooks[ev] || [];
    for (const g of groups) {
      if (!g || !Array.isArray(g.hooks)) continue;
      g.hooks = g.hooks.filter((h) => {
        const hit = h && typeof h.command === 'string' && h.command.includes(needle);
        if (hit) lines.push(`  - ${ev}: ${h.command}`);
        return !hit;
      });
    }
    settings.hooks[ev] = groups.filter((g) => !g || !Array.isArray(g.hooks) || g.hooks.length);
    if (!settings.hooks[ev].length) delete settings.hooks[ev];
  }
  return lines;
}

function save(file, settings, lines, verb) {
  const changes = lines.filter((l) => /^\s+[+-]/.test(l)).length;
  for (const l of lines) out(l);
  if (!changes) { out('  Nothing to change.'); return; }
  if (!apply && !remove) { out(`  (plan only - run again with --${verb} to make these ${changes} change(s))`); return; }
  const b = backup(file);
  writeJson(file, settings);
  out(`  Done: ${changes} change(s) written to ${file}${b ? `; the old file is ${path.basename(b)}` : ''}.`);
}

/* -------------------------------------------------------------------- hooks */

function officeHooks() {
  const h = (cmd, extra) => Object.assign({ type: 'command', command: cmd, timeout: 10 }, extra || {});
  const office = (ev) => h(`node "${R}/.claude/hooks/office-hook.js" ${ev}`);
  const inbox = h(`node "${R}/.claude/hooks/office-inbox-hook.js"`);
  const wake = (ev, extra) => h(`node "${R}/bin/office-wake-hook.js" ${ev}`, extra);
  return {
    SessionStart: [office('SessionStart'), h(`node "${R}/bin/ensure-office.js"`, { async: true, timeout: 5 })],
    SessionEnd: [office('SessionEnd'), wake('SessionEnd')],
    UserPromptSubmit: [office('UserPromptSubmit'), inbox, wake('UserPromptSubmit')],
    PreToolUse: [office('PreToolUse')],
    PostToolUse: [office('PostToolUse'), inbox],
    PermissionRequest: [office('PermissionRequest')],
    Notification: [office('Notification')],
    // The waiter wakes an idle session when a note lands. Its timeout (seconds) covers
    // config/thresholds.json wake.wake_wait_max_ms (8 h).
    Stop: [office('Stop'), wake('Stop', { async: true, asyncRewake: true, timeout: 29000 })],
    StopFailure: [office('StopFailure')],
    SubagentStart: [office('SubagentStart')],
    SubagentStop: [office('SubagentStop')],
  };
}

function partHooks() {
  out('hooks - every session on this computer reports to the office and can get notes');
  const file = settingsFile();
  const settings = loadSettings(file);
  const lines = remove
    ? removeHooks(settings, `${R}/.claude/hooks/`).concat(removeHooks(settings, `${R}/bin/`))
    : addHooks(settings, officeHooks());
  save(file, settings, lines, 'apply');
}

/* -------------------------------------------------------------- permissions */

/** C:\a\b -> //c/a/b/** (the absolute form Claude Code's permission path rules use). */
function rulePath(prefix) {
  const parts = String(prefix).trim().split(/[\\/]+/).filter(Boolean);
  if (parts.length && /^[A-Za-z]:$/.test(parts[0])) parts[0] = parts[0][0].toLowerCase();
  return `//${parts.join('/')}/**`;
}

// The deny and ask rules this installer added (and only those), so --remove never takes out a
// rule that was yours before.
function addedFile() { return path.join(claudeHome(), 'workspace-installed.json'); }
function readAdded() { try { return readJson(addedFile()); } catch (_) { return {}; } }

function walkawayLocal() {
  const c = config.load();
  return {
    _comment: 'Written by node bin/install.js permissions from workspace.config.json. Machine-local: never commit it.',
    off_limits: c.privacy.never_read,
    push_main_ok: [],
    local_mcp: ['chrome-devtools'],
    extra_roots: c.code_roots,
  };
}

function partPermissions() {
  out('permissions - guard rails, so sessions can work without stopping to ask (guides/03-permissions.md)');
  const frag = readJson(path.join(ROOT, 'permissions', 'settings.fragment.json'));
  const file = settingsFile();
  const settings = loadSettings(file);
  const localFile = path.join(claudeHome(), 'walkaway.local.json');
  const local = fs.existsSync(localFile) ? (() => { try { return readJson(localFile); } catch (_) { return {}; } })() : walkawayLocal();
  const pathDenies = (local.off_limits || []).flatMap((p) => ['Read', 'Edit', 'Write'].map((t) => `${t}(${rulePath(p)})`));
  const lines = [];

  if (remove) {
    lines.push(...removeHooks(settings, `${R}/permissions/`));
    const perms = settings.permissions || {};
    const added = readAdded();
    for (const key of ['deny', 'ask']) {
      const ours = new Set(added[key] || []);
      const have = perms[key] || [];
      for (const r of have) if (ours.has(r)) lines.push(`  - ${key}: ${r}`);
      if (perms[key]) perms[key] = have.filter((r) => !ours.has(r));
    }
    save(file, settings, lines, 'remove');
    if (fs.existsSync(addedFile())) fs.unlinkSync(addedFile());
    return;
  }

  const py = python();
  if (!py) {
    out('  Python 3 was not found (python, py -3 or python3). The walkaway hooks are Python: install it from python.org');
    out('  (on Windows, not the Microsoft Store alias), then run this again. The deny and ask lists are shown anyway.');
  }
  settings.permissions = settings.permissions || {};
  const added = readAdded();
  for (const [key, extra] of [['deny', (frag.permissions.deny || []).concat(pathDenies)], ['ask', frag.permissions.ask || []]]) {
    const have = settings.permissions[key] || [];
    const add = extra.filter((r) => !have.includes(r));
    for (const r of extra) lines.push(add.includes(r) ? `  + ${key}: ${r}` : `  = ${key}: ${r}  (already there)`);
    settings.permissions[key] = have.concat(add);
    added[key] = [...new Set((added[key] || []).concat(add))];
  }
  if (py) {
    const perm = { type: 'command', command: `${py} "${R}/permissions/walkaway/walkaway_permission_hook.py"`, timeout: 15 };
    const stop = { type: 'command', command: `${py} "${R}/permissions/walkaway/walkaway_stop_guard.py"`, timeout: 30 };
    lines.push(...addHooks(settings, { PreToolUse: [perm], PermissionRequest: [perm], Stop: [stop] }));
  }
  if (fs.existsSync(localFile)) {
    lines.push(`  = ${localFile}  (kept as it is)`);
  } else {
    lines.push(`  + ${localFile}: off_limits ${JSON.stringify(local.off_limits)}, refuse recursive deletes of ${JSON.stringify(local.extra_roots)}`);
  }
  save(file, settings, lines, 'apply');
  if (apply) writeJson(addedFile(), added);
  if (apply && !fs.existsSync(localFile)) {
    writeJson(localFile, local);
    out(`  Wrote ${localFile}.`);
  }
  out('  VS Code: "Bypass permissions" is a separate switch you turn on yourself (guides/03-permissions.md explains when).');
}

/* ------------------------------------------------------------------ startup */

function startupTarget() {
  const node = process.execPath;
  const start = path.join(ROOT, 'bin', 'office-start.js');
  if (process.platform === 'win32') {
    const dir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    return {
      file: path.join(dir, 'WorkSpace.vbs'),
      text: `' WorkSpace: start the office at login. Remove with: node bin/install.js startup --remove\r\n` +
        `CreateObject("WScript.Shell").Run """${node}"" ""${start}""", 0, False\r\n`,
    };
  }
  if (process.platform === 'darwin') {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return {
      file: path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.wilsonworks.workspace.plist'),
      text: `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n` +
        `<plist version="1.0"><dict>\n  <key>Label</key><string>com.wilsonworks.workspace</string>\n` +
        `  <key>ProgramArguments</key><array><string>${esc(node)}</string><string>${esc(start)}</string></array>\n` +
        `  <key>RunAtLoad</key><true/>\n</dict></plist>\n`,
    };
  }
  return {
    file: path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'autostart', 'workspace.desktop'),
    text: `[Desktop Entry]\nType=Application\nName=WorkSpace office\nExec="${node}" "${start}"\nX-GNOME-Autostart-enabled=true\n`,
  };
}

function partStartup() {
  out('startup - start the office when you log in');
  const t = startupTarget();
  const have = fs.existsSync(t.file) ? fs.readFileSync(t.file, 'utf8') : null;
  if (remove) {
    if (have === null) { out('  Nothing to remove.'); return; }
    out(`  - ${t.file}`);
    fs.unlinkSync(t.file);
    out('  Removed. The office no longer starts at login (a running one keeps running).');
    return;
  }
  if (have === t.text) { out(`  = ${t.file}  (already there)`); return; }
  out(`  ${have === null ? '+' : '~'} ${t.file}`);
  if (!apply) { out('  (plan only - run again with --apply)'); return; }
  fs.mkdirSync(path.dirname(t.file), { recursive: true });
  fs.writeFileSync(t.file, t.text, 'utf8');
  out('  Done. The office starts at your next login; start it now with: node bin/office-start.js');
}

/* ---------------------------------------------------------------------- org */

function partOrg() {
  out('org - the CTO org (18 agents, the comms bus, the path guard) in one project');
  const into = argOf('--into');
  if (!into) {
    out('  Say which project: node bin/install.js org --into "<project folder>"');
    return;
  }
  const target = path.resolve(into);
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) refuse(`${target} is not a folder.`);
  if (!fs.existsSync(path.join(target, '.git'))) out('  Note: that folder is not a git repo yet. The org works best in one (git init).');
  const src = path.join(ROOT, 'org');
  const owner = config.ownerName();
  const plan = [];
  const add = (from, to, transform) => plan.push({ from, to, transform });
  for (const f of fs.readdirSync(path.join(src, 'agents')).filter((n) => n.endsWith('.md'))) {
    add(path.join(src, 'agents', f), path.join(target, '.claude', 'agents', f),
      owner ? (t) => t.split('(Update with user name)').join(owner) : null);
  }
  add(path.join(src, 'comms', 'comms.py'), path.join(target, '.claude', 'comms', 'comms.py'));
  add(path.join(src, 'comms', 'schema.sql'), path.join(target, '.claude', 'comms', 'schema.sql'));
  add(path.join(src, 'hooks', 'path_guard.py'), path.join(target, '.claude', 'hooks', 'path_guard.py'));
  plan.push({ from: path.join(src, 'org.config.example.json'), to: path.join(target, '.claude', 'agents', 'org.config.json'), keep: true });

  let writes = 0;
  for (const p of plan) {
    let text = fs.readFileSync(p.from, 'utf8');
    if (p.transform) text = p.transform(text);
    const rel = fwd(path.relative(target, p.to));
    const have = fs.existsSync(p.to) ? fs.readFileSync(p.to, 'utf8') : null;
    if (have === text) { out(`  = ${rel}`); continue; }
    if (have !== null && (p.keep || !force)) { out(`  ! ${rel}  (yours differs - kept${p.keep ? '' : '; --force replaces it'})`); continue; }
    out(`  ${have === null ? '+' : '~'} ${rel}`);
    writes += 1;
    if (apply) {
      fs.mkdirSync(path.dirname(p.to), { recursive: true });
      fs.writeFileSync(p.to, text, 'utf8');
    }
  }

  // The path guard runs before every edit in that project.
  const py = python() || 'python';
  const file = path.join(target, '.claude', 'settings.json');
  const settings = loadSettings(file);
  const guard = { type: 'command', command: `${py} "\${CLAUDE_PROJECT_DIR}/.claude/hooks/path_guard.py"`, timeout: 10 };
  const lines = addHooks(settings, { PreToolUse: [guard] }, () => 'Write|Edit|MultiEdit');
  for (const l of lines) out(l);
  const settingsChange = lines.some((l) => /^\s+\+/.test(l));
  if (!apply) {
    if (writes || settingsChange) out('  (plan only - run again with --apply)');
    else out('  Nothing to change.');
    return;
  }
  if (settingsChange) { backup(file); writeJson(file, settings); }
  out(`  Done. Next: set which folders each department owns in ${fwd(path.join(target, '.claude', 'agents', 'org.config.json'))} (guides/05-the-org.md).`);
}

/* --------------------------------------------------------------------- main */

const PARTS = { hooks: partHooks, permissions: partPermissions, startup: partStartup, org: partOrg };

if (!part) {
  if (apply || remove) refuse('name the part to change: hooks, permissions, startup or org.');
  out('The WorkSpace installer. This shows what each part would change; nothing is written.\n');
  for (const name of ['hooks', 'permissions', 'startup', 'org']) { PARTS[name](); out(); }
  out('Make a change with: node bin/install.js <part> --apply   (undo with --remove)');
  process.exit(0);
}
if (!PARTS[part]) refuse(`there is no part called "${part}". The parts are hooks, permissions, startup and org.`);
if (apply && remove) refuse('--apply or --remove, not both.');
PARTS[part]();
