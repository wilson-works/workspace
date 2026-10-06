'use strict';

/**
 * agents-install.test.js — installing an agent package (agents/lib/agents.js installPackage and
 * agents/bin/install-agent.js).
 *
 * From a folder: copied under its key, its subagent registered with its folder filled in; a second
 * install changes nothing (=). A port another agent.json claims, or one something listens on, is
 * swapped for a free one, in probe.port and door.local (~). A package that fails the contract, or has
 * no agent.json, is refused and nothing is written. Nothing in the package runs while it is installed:
 * not its start command, not a package.json script. A copy that differs is kept (!) unless forced; a
 * forced replace moves yours to the Hub's 90-Archive/_DumpQueue, never deleting it. Links and .git are
 * never copied. Every port here is one the system hands out.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawnSync } = require('child_process');
const lib = require('../agents/lib/agents');

const INSTALL = path.join(__dirname, '..', 'agents', 'bin', 'install-agent.js');
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
const fwd = (p) => path.resolve(p).replace(/\\/g, '/');

function spare() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

/** A package folder for <key> on <port>, with a start command and a package script that would leave a mark if they ever ran. */
function makePackage(base, key, port, marker) {
  const dir = path.join(base, 'pkg', key);
  lib.scaffold(dir, { key, name: key[0].toUpperCase() + key.slice(1), title: 'The Test Desk', port });
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'agent.json'), 'utf8'));
  m.start = 'node leave-a-mark.js';
  fs.writeFileSync(path.join(dir, 'agent.json'), JSON.stringify(m, null, 2));
  const mark = `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran');\n`;
  fs.writeFileSync(path.join(dir, 'leave-a-mark.js'), mark);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: key, scripts: { preinstall: 'node leave-a-mark.js', install: 'node leave-a-mark.js', postinstall: 'node leave-a-mark.js' } }));
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  return dir;
}

function setup() {
  const base = tmp('agents-install');
  const hub = path.join(base, 'hub');
  fs.mkdirSync(path.join(hub, '.hub'), { recursive: true });
  fs.writeFileSync(path.join(hub, '.hub', 'hub.json'), JSON.stringify({ format: 1, machine: 'DESK', role: 'command', code_zone: '20-Coding/Projects' }));
  const agents = path.join(hub, '50-AI', 'agents');
  const subs = path.join(hub, '.claude', 'agents');
  return { base, hub, agents, subs, marker: path.join(base, 'a-package-script-ran.txt') };
}

test('from a folder: copied under its key, nothing in it runs, its subagent registered; again: nothing changes', async () => {
  const s = setup();
  try {
    const port = await spare();
    const pkg = makePackage(s.base, 'sample', port, s.marker);
    const asked = [];
    const r = await lib.installPackage(pkg, s.agents, { subagentsDir: s.subs, hubRoot: s.hub, ask: async (q) => { asked.push(q); return false; } });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.key, 'sample');
    assert.equal(r.port, port, 'its own port, free, is kept');
    const target = path.join(s.agents, 'sample');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(target, 'agent.json'), 'utf8')), JSON.parse(fs.readFileSync(path.join(pkg, 'agent.json'), 'utf8')));
    for (const f of ['CLAUDE.md', 'brains/README.md', 'rules/never-send-without-a-yes.md', 'memory/MEMORY.md', 'dashboard/server.js', 'mark.svg', 'art.svg']) {
      assert.ok(fs.existsSync(path.join(target, ...f.split('/'))), f);
    }
    assert.ok(!fs.existsSync(path.join(target, '.git')), '.git is never copied');
    assert.ok(r.lines.some((l) => l.startsWith('+ ') && l.includes('sample')));

    const sub = fs.readFileSync(path.join(s.subs, 'sample.md'), 'utf8');
    assert.ok(sub.includes(`${fwd(target)}/CLAUDE.md`), 'its subagent points at the installed folder, not the package');
    assert.ok(!sub.includes('{{agent_dir}}'));

    assert.equal(asked.length, 1, 'autostart: true, so it asks before starting');
    assert.match(asked[0], /Start/);
    assert.equal(r.started, false, 'a no means it is not started');
    assert.equal(lib.runningPid(target), null);
    await new Promise((res) => setTimeout(res, 300));
    assert.ok(!fs.existsSync(s.marker), 'nothing in the package ran: not its start command, not a package.json script');

    const again = await lib.installPackage(pkg, s.agents, { subagentsDir: s.subs, hubRoot: s.hub, yes: true });
    assert.equal(again.ok, true);
    assert.equal(again.unchanged, true);
    assert.ok(again.lines.every((l) => l.startsWith('= ')), again.lines.join('\n'));
    assert.ok(!fs.existsSync(s.marker));
  } finally {
    fs.rmSync(s.base, { recursive: true, force: true });
  }
});

test('a port another agent.json claims, or one something listens on, is swapped for a free one in probe.port and door.local', async () => {
  const s = setup();
  const holder = net.createServer();
  try {
    const port = await spare();
    lib.scaffold(path.join(s.agents, 'other'), { key: 'other', name: 'Other', title: 'x', port });
    const r = await lib.installPackage(makePackage(s.base, 'sample', port, s.marker), s.agents, { subagentsDir: s.subs, start: false });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.notEqual(r.port, port);
    const m = JSON.parse(fs.readFileSync(path.join(s.agents, 'sample', 'agent.json'), 'utf8'));
    assert.equal(m.probe.port, r.port);
    assert.equal(m.door.local, `http://127.0.0.1:${r.port}/`);
    assert.deepEqual(lib.validateManifest(m), { ok: true, errors: [] });
    assert.ok(r.lines.some((l) => l.startsWith('~ ') && l.includes(String(port))), r.lines.join('\n'));

    const busy = await spare();
    await new Promise((res) => holder.listen(busy, '127.0.0.1', res));
    const r2 = await lib.installPackage(makePackage(s.base, 'nib', busy, s.marker), s.agents, { start: false });
    assert.equal(r2.ok, true, JSON.stringify(r2));
    assert.notEqual(r2.port, busy, 'something listens on it');
    assert.notEqual(r2.port, r.port, 'and not the port just given to sample');
  } finally {
    holder.close();
    fs.rmSync(s.base, { recursive: true, force: true });
  }
});

test('a package that fails the contract, or has no agent.json, is refused and nothing is written', async () => {
  const s = setup();
  try {
    const pkg = makePackage(s.base, 'sample', await spare(), s.marker);
    const m = JSON.parse(fs.readFileSync(path.join(pkg, 'agent.json'), 'utf8'));
    m.key = 'Not A Key';
    m.door.local = 'http://evil.example:7600/';
    fs.writeFileSync(path.join(pkg, 'agent.json'), JSON.stringify(m));
    const r = await lib.installPackage(pkg, s.agents, { subagentsDir: s.subs, yes: true });
    assert.equal(r.ok, false);
    assert.equal(r.refused, true);
    assert.match(r.errors.join(' '), /key/);
    assert.match(r.errors.join(' '), /door\.local/);
    assert.ok(!fs.existsSync(s.agents), 'nothing written');
    assert.ok(!fs.existsSync(s.subs));

    const empty = path.join(s.base, 'empty');
    fs.mkdirSync(path.join(empty, 'a'), { recursive: true });
    fs.mkdirSync(path.join(empty, 'b'));
    const none = await lib.installPackage(empty, s.agents, {});
    assert.equal(none.refused, true);
    assert.match(none.errors.join(' '), /no agent\.json/);

    const nothing = await lib.installPackage(path.join(s.base, 'no-such-thing'), s.agents, {});
    assert.equal(nothing.refused, true);
    assert.ok(!fs.existsSync(s.marker));
  } finally {
    fs.rmSync(s.base, { recursive: true, force: true });
  }
});

test('a copy that differs is kept unless forced; forcing moves yours to the _DumpQueue, never deleting it', async () => {
  const s = setup();
  try {
    const pkg = makePackage(s.base, 'sample', await spare(), s.marker);
    await lib.installPackage(pkg, s.agents, { subagentsDir: s.subs, hubRoot: s.hub, start: false });
    const memory = path.join(s.agents, 'sample', 'memory', 'MEMORY.md');
    fs.appendFileSync(memory, '- 2026-10-05 something it learned (memory/x.md)\n');
    const learned = fs.readFileSync(memory, 'utf8');

    const kept = await lib.installPackage(pkg, s.agents, { subagentsDir: s.subs, hubRoot: s.hub, yes: true, start: false });
    assert.equal(kept.kept, true, '--yes never means "replace yours"');
    assert.match(kept.lines.join('\n'), /^! /m);
    assert.equal(fs.readFileSync(memory, 'utf8'), learned);

    const forced = await lib.installPackage(pkg, s.agents, { subagentsDir: s.subs, hubRoot: s.hub, force: true, start: false });
    assert.equal(forced.ok, true, JSON.stringify(forced));
    assert.notEqual(fs.readFileSync(memory, 'utf8'), learned, 'the package copy is back');
    const queue = path.join(s.hub, '90-Archive', '_DumpQueue');
    const moved = fs.readdirSync(queue);
    assert.equal(moved.length, 1);
    assert.match(moved[0], /^agent-sample-\d{4}-\d{2}-\d{2}$/);
    assert.equal(fs.readFileSync(path.join(queue, moved[0], 'memory', 'MEMORY.md'), 'utf8'), learned, 'yours waits in the _DumpQueue');
  } finally {
    fs.rmSync(s.base, { recursive: true, force: true });
  }
});

test('--port: a free one is used as asked; a taken one is refused before anything changes, even with --force', async () => {
  const s = setup();
  const holder = net.createServer();
  try {
    const pkg = makePackage(s.base, 'sample', await spare(), s.marker);
    const asked = await spare();
    const first = await lib.installPackage(pkg, s.agents, { subagentsDir: s.subs, hubRoot: s.hub, start: false, port: asked });
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.match(first.lines.join('\n'), new RegExp(`^~ .*gets port ${asked}, as asked`, 'm'));
    const m = JSON.parse(fs.readFileSync(path.join(s.agents, 'sample', 'agent.json'), 'utf8'));
    assert.equal(m.probe.port, asked);
    assert.equal(m.door.local, `http://127.0.0.1:${asked}/`);

    const memory = path.join(s.agents, 'sample', 'memory', 'MEMORY.md');
    fs.appendFileSync(memory, '- 2026-10-05 something it learned (memory/x.md)\n');
    const learned = fs.readFileSync(memory, 'utf8');
    const taken = await new Promise((resolve) => holder.listen(0, '127.0.0.1', () => resolve(holder.address().port)));
    const refused = await lib.installPackage(pkg, s.agents, { subagentsDir: s.subs, hubRoot: s.hub, force: true, start: false, port: taken });
    assert.equal(refused.refused, true, JSON.stringify(refused));
    assert.match(refused.errors.join(' '), new RegExp(`Port ${taken} is taken`));
    assert.equal(fs.readFileSync(memory, 'utf8'), learned, 'yours is untouched');
    assert.equal(fs.existsSync(path.join(s.hub, '90-Archive', '_DumpQueue')) ? fs.readdirSync(path.join(s.hub, '90-Archive', '_DumpQueue')).length : 0, 0, 'nothing moved to the _DumpQueue');
  } finally {
    holder.close();
    fs.rmSync(s.base, { recursive: true, force: true });
  }
});

test('a link inside a package is never copied', async (t) => {
  const s = setup();
  try {
    const pkg = makePackage(s.base, 'sample', await spare(), s.marker);
    fs.writeFileSync(path.join(s.base, 'secret.txt'), 'outside the package');
    try { fs.symlinkSync(path.join(s.base, 'secret.txt'), path.join(pkg, 'brains', 'linked.md')); } catch (_) {
      t.skip('no right to make links here');
      return;
    }
    const r = await lib.installPackage(pkg, s.agents, { start: false });
    assert.equal(r.ok, true);
    assert.ok(!fs.existsSync(path.join(s.agents, 'sample', 'brains', 'linked.md')));
  } finally {
    fs.rmSync(s.base, { recursive: true, force: true });
  }
});

test('install-agent: a refused package exits 2; a good one exits 0, gets an office, and starts nothing with --no-start', async () => {
  const s = setup();
  const env = Object.assign({}, process.env, {
    HUB_ROOT: s.hub,
    WORKSPACE_CONFIG: path.join(s.base, 'no-workspace.config.json'),
    WORKSPACE_HOME: path.join(s.base, 'office-home'),
  });
  const run = (...args) => spawnSync(process.execPath, [INSTALL, ...args], { env, encoding: 'utf8', timeout: 60000 });
  try {
    const pkg = makePackage(s.base, 'sample', await spare(), s.marker);
    const badDir = path.join(s.base, 'bad');
    fs.mkdirSync(badDir);
    fs.writeFileSync(path.join(badDir, 'agent.json'), JSON.stringify({ key: 'bad', name: 'Bad' }));
    const bad = run(badDir, '--hub', s.hub);
    assert.equal(bad.status, 2, bad.stdout);
    assert.match(bad.stdout, /cannot be installed/);
    assert.match(bad.stdout, /brand/);

    const dry = run(pkg, '--hub', s.hub, '--dry-run');
    assert.equal(dry.status, 0, dry.stdout);
    assert.ok(!fs.existsSync(path.join(s.agents, 'sample')), 'a dry run writes nothing');

    const ok = run(pkg, '--hub', s.hub, '--yes', '--no-start');
    assert.equal(ok.status, 0, ok.stdout);
    assert.ok(fs.existsSync(path.join(s.agents, 'sample', 'agent.json')));
    assert.match(ok.stdout, /now has an office in the Agents' wing/);
    assert.equal(lib.runningPid(path.join(s.agents, 'sample')), null);
    assert.ok(!fs.existsSync(s.marker));
  } finally {
    fs.rmSync(s.base, { recursive: true, force: true });
  }
});
