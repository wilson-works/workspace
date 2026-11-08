'use strict';

/**
 * install-staff-office.test.js: when a firm's staff office (the CBFC staff office) runs on this Workspace's port, a
 * second paste of the install line steps aside instead of marking the office step failed (on 2026-11-07, pasting the
 * Workspace line again after the staff office ran printed "port in use" and marked its office step failed).
 * The staff office is recognised only by its own fresh record, <local app data>/CBFCWorkspace/office.alive naming a
 * live pid on that port and stamped within 90 s; anything else on the port is still reported, as before.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const INSTALL = path.join(__dirname, '..', 'install.js');

function git(cwd, args) {
  return execFileSync('git', ['-c', 'user.name=Alex', '-c', 'user.email=alex@example.com', '-c', 'commit.gpgsign=false'].concat(args), {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  }).trim();
}

/** A temp world like install-plan.test.js's: a Hub, a one-skill pack, a fake home. */
function sandbox(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-staff-'));
  t.after(() => { try { fs.rmSync(base, { recursive: true, force: true, maxRetries: 3 }); } catch (_) { /* best effort */ } });
  const d = (...p) => path.join(base, ...p);
  const hub = d('Hub');
  fs.mkdirSync(path.join(hub, '.hub'), { recursive: true });
  fs.writeFileSync(path.join(hub, '.hub', 'hub.json'), JSON.stringify({ format: 1, machine: 'DESK', role: 'command', code_zone: '20-Coding/Projects', workspace: '50-AI/workspace', owner: 'Alex', created: '2026-10-05' }));
  const pack = d('pack');
  fs.mkdirSync(path.join(pack, 'skills', 'alpha'), { recursive: true });
  fs.writeFileSync(path.join(pack, 'skills', 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: A test skill.\n---\n\nDo it.\n');
  git(pack, ['init', '-q']);
  git(pack, ['add', 'skills']);
  git(pack, ['commit', '-q', '-m', 'the pack']);
  const ref = git(pack, ['rev-parse', 'HEAD']);
  const starter = d('starter.json');
  fs.writeFileSync(starter, JSON.stringify({ pack, ref, path: 'skills', skills: [{ name: 'alpha', why: 'does it' }] }));
  const home = d('home');
  fs.mkdirSync(home);
  const env = Object.assign({}, process.env, {
    HOME: home, USERPROFILE: home,
    APPDATA: d('home', 'AppData', 'Roaming'), LOCALAPPDATA: d('home', 'AppData', 'Local'),
    XDG_CONFIG_HOME: d('home', '.config'), XDG_DATA_HOME: d('home', '.local', 'share'),
    CLAUDE_CONFIG_DIR: d('home', '.claude'),
    WORKSPACE_HOME: d('office'), WORKSPACE_CONFIG: d('workspace.config.json'), WORKSPACE_STARTER: starter,
    CBFC_OFFICE_HOME: d('staff-office'),
  });
  delete env.HUB_ROOT;
  delete env.WORKSPACE_PORT;
  return { hub, pack, env, staffHome: env.CBFC_OFFICE_HOME };
}

function install(sb, port, ...extra) {
  const r = spawnSync(process.execPath, [INSTALL, '--hub', sb.hub, '--skills-source', sb.pack, '--skip', 'check,hub,fleet', '--office-port', String(port), '--yes'].concat(extra),
    { env: sb.env, encoding: 'utf8', input: '', timeout: 120000, windowsHide: true });
  return { code: r.status, text: `${r.stdout || ''}${r.stderr || ''}` };
}

/** Something listening on a free port, standing in for the staff office: { port, close }. */
function listener() {
  return new Promise((resolve) => {
    const s = net.createServer((c) => c.destroy()).listen(0, '127.0.0.1', () => resolve({ port: s.address().port, close: () => new Promise((r) => s.close(r)) }));
  });
}

test("a second paste steps aside for the firm's staff office on the Workspace's port", async (t) => {
  const sb = sandbox(t);
  const l = await listener();
  t.after(() => l.close());
  // First paste: settings written with this port, office not started (the port is free as far as it knows).
  const first = install(sb, l.port, '--no-start');
  assert.strictEqual(first.code, 0, first.text);
  // The staff office takes the port and leaves its record, as the CBFC staff office's server does.
  fs.mkdirSync(sb.staffHome, { recursive: true });
  fs.writeFileSync(path.join(sb.staffHome, 'office.alive'), JSON.stringify({ pid: process.pid, port: l.port, started_at: new Date().toISOString(), alive_at: new Date().toISOString() }));
  const again = install(sb, l.port);
  assert.match(again.text, /your firm's staff office is running here/, again.text);
  assert.doesNotMatch(again.text, /in use by something else/, again.text);
});

test('a stale staff office record (not re-stamped for over 90 s) does not hide a real port problem', async (t) => {
  const sb = sandbox(t);
  const l = await listener();
  t.after(() => l.close());
  const first = install(sb, l.port, '--no-start');
  assert.strictEqual(first.code, 0, first.text);
  // A record left behind: its pid is alive (Windows may have reused it), but it was last stamped ten minutes ago.
  const old = new Date(Date.now() - 600000).toISOString();
  fs.mkdirSync(sb.staffHome, { recursive: true });
  fs.writeFileSync(path.join(sb.staffHome, 'office.alive'), JSON.stringify({ pid: process.pid, port: l.port, started_at: old, alive_at: old }));
  const again = install(sb, l.port);
  assert.match(again.text, /in use by something else/, again.text);
  assert.doesNotMatch(again.text, /staff office is running/, again.text);
});

test('anything else on the port is still reported (no staff office record)', async (t) => {
  const sb = sandbox(t);
  const l = await listener();
  t.after(() => l.close());
  const first = install(sb, l.port, '--no-start');
  assert.strictEqual(first.code, 0, first.text);
  const again = install(sb, l.port);
  assert.match(again.text, /in use by something else/, again.text);
  assert.doesNotMatch(again.text, /staff office is running/, again.text);
});
