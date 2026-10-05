'use strict';

/**
 * agents-requires.test.js — an agent's required skills (agent.json requires.skills; agents/lib/skills.js
 * through installPackage and agents/bin/install-agent.js).
 *
 * Hermetic: a temp Hub with its own fake skills pack (a small git repo at <Hub>/50-AI/claude_skills),
 * a starter list in a temp file (WORKSPACE_STARTER) pinning one of its commits, and agent packages made
 * here with the template. Nothing is started (start: false, --no-start).
 *
 * Proves: a skill the Hub lacks is copied from the pack at the pinned commit (not a later one, not the
 * working tree), "+" each, and recorded in <Hub>/.hub/installed.json the way the installer records its
 * skills (the documented content hash), keeping what the record held; a skill already in the Hub is
 * "=" and never replaced; a second install is all "="; a dry run writes nothing; a skill the pack does
 * not have, a missing pack, or no Hub refuses the package before anything is written; install-agent
 * exits 2 on that refusal and 0 with a "+" per skill.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const net = require('net');
const { execFileSync, spawnSync } = require('child_process');
const lib = require('../agents/lib/agents');

const INSTALL = path.join(__dirname, '..', 'agents', 'bin', 'install-agent.js');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const fwd = (p) => path.resolve(p).replace(/\\/g, '/');

function git(cwd, args) {
  return execFileSync('git', ['-c', 'user.name=Alex', '-c', 'user.email=alex@example.com', '-c', 'commit.gpgsign=false'].concat(args), {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  }).trim();
}

/** A port nothing listens on right now, as the system hands it out. */
function spare() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

function put(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

/** The documented content hash: sha256 over "<path>\0<sha256 of bytes>\n", in path order. */
function contentHash(dir) {
  const rels = [];
  const walk = (p) => {
    for (const ent of fs.readdirSync(p, { withFileTypes: true })) {
      const f = path.join(p, ent.name);
      if (ent.isDirectory()) walk(f);
      else rels.push(path.relative(dir, f).split(path.sep).join('/'));
    }
  };
  walk(dir);
  rels.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const h = crypto.createHash('sha256');
  for (const rel of rels) h.update(`${rel}\0${sha(fs.readFileSync(path.join(dir, ...rel.split('/'))))}\n`);
  return `sha256:${h.digest('hex')}`;
}

/**
 * A temp world: a Hub, its pack (alpha and beta pinned; a later commit changes alpha and adds late),
 * the starter list pointing at the pinned commit, and WORKSPACE_STARTER set for this process.
 */
function world(t, opts) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-requires-'));
  const hub = path.join(base, 'Hub');
  put(path.join(hub, '.hub', 'hub.json'), JSON.stringify({ format: 1, machine: 'DESK', role: 'command', code_zone: '20-Coding/Projects' }));
  const pack = path.join(hub, '50-AI', 'claude_skills');
  let ref = null;
  if (!(opts && opts.noPack)) {
    put(path.join(pack, 'skills', 'alpha', 'SKILL.md'), '---\nname: alpha\n---\n\nThe pinned alpha.\n');
    put(path.join(pack, 'skills', 'alpha', 'scripts', 'run.sh'), '#!/bin/sh\necho alpha\n');
    put(path.join(pack, 'skills', 'beta', 'SKILL.md'), '---\nname: beta\n---\n\nThe pinned beta.\n');
    git(pack, ['init', '-q']);
    git(pack, ['add', 'skills']);
    git(pack, ['commit', '-q', '-m', 'pinned']);
    ref = git(pack, ['rev-parse', 'HEAD']);
    put(path.join(pack, 'skills', 'alpha', 'SKILL.md'), '---\nname: alpha\n---\n\nA later alpha.\n');
    put(path.join(pack, 'skills', 'late', 'SKILL.md'), 'only after the pin\n');
    git(pack, ['add', 'skills']);
    git(pack, ['commit', '-q', '-m', 'later']);
    put(path.join(pack, 'skills', 'alpha', 'SKILL.md'), 'an uncommitted edit in the working tree\n');
  }
  const starter = path.join(base, 'starter.json');
  fs.writeFileSync(starter, JSON.stringify({ pack: 'https://example.com/claude_skills.git', ref: ref || 'a'.repeat(40), path: 'skills', skills: [] }));
  const before = process.env.WORKSPACE_STARTER;
  process.env.WORKSPACE_STARTER = starter;
  t.after(() => {
    if (before === undefined) delete process.env.WORKSPACE_STARTER; else process.env.WORKSPACE_STARTER = before;
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 3 });
  });
  return {
    base, hub, pack, ref, starter,
    agents: path.join(hub, '50-AI', 'agents'),
    subs: path.join(hub, '.claude', 'agents'),
    skills: path.join(hub, '.claude', 'skills'),
    record: path.join(hub, '.hub', 'installed.json'),
  };
}

/** A package folder for <key> on <port> that requires these skills. */
function makePackage(w, key, skills, port) {
  const dir = path.join(w.base, 'pkg', key);
  lib.scaffold(dir, { key, name: key[0].toUpperCase() + key.slice(1), title: 'The Test Desk', port });
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'agent.json'), 'utf8'));
  m.requires = { skills };
  fs.writeFileSync(path.join(dir, 'agent.json'), JSON.stringify(m, null, 2));
  return dir;
}

test('a missing skill is copied from the pack at the pinned commit and recorded; one already there is kept; again: all =', async (t) => {
  const w = world(t);
  put(path.join(w.skills, 'beta', 'SKILL.md'), 'my own beta\n');
  put(w.record, JSON.stringify({ format: 1, hooks: { file: '.claude/settings.json', added: { Stop: ['node x.js'] } },
    copies: { '.claude/skills/handoff': { kind: 'skill', name: 'handoff', hash: 'sha256:00', from: 'claude_skills@0000000' } }, startup: null, fleet_schedule: false }));
  const pkg = makePackage(w, 'sample', ['alpha', 'beta'], await spare());

  const r = await lib.installPackage(pkg, w.agents, { subagentsDir: w.subs, hubRoot: w.hub, start: false });
  assert.equal(r.ok, true, JSON.stringify(r));
  const text = r.lines.join('\n');
  assert.match(text, new RegExp(`^\\+ ${fwd(path.join(w.skills, 'alpha'))}  \\(a skill Sample needs, from claude_skills@${w.ref.slice(0, 7)}\\)$`, 'm'));
  assert.match(text, new RegExp(`^= ${fwd(path.join(w.skills, 'beta'))}$`, 'm'));

  assert.equal(fs.readFileSync(path.join(w.skills, 'alpha', 'SKILL.md'), 'utf8'), '---\nname: alpha\n---\n\nThe pinned alpha.\n', 'the pinned commit, not a later one or the working tree');
  assert.ok(fs.existsSync(path.join(w.skills, 'alpha', 'scripts', 'run.sh')), 'the whole skill folder');
  assert.equal(fs.readFileSync(path.join(w.skills, 'beta', 'SKILL.md'), 'utf8'), 'my own beta\n', 'a skill already there is never replaced');

  const rec = JSON.parse(fs.readFileSync(w.record, 'utf8'));
  assert.deepEqual(rec.copies['.claude/skills/alpha'], { kind: 'skill', name: 'alpha', hash: contentHash(path.join(w.skills, 'alpha')), from: `claude_skills@${w.ref.slice(0, 7)}` });
  assert.equal(rec.copies['.claude/skills/beta'], undefined, 'yours is not recorded as ours');
  assert.equal(rec.copies['.claude/skills/handoff'].name, 'handoff', 'what the record held is kept');
  assert.deepEqual(rec.hooks.added, { Stop: ['node x.js'] });
  assert.equal(rec.format, 1);
  assert.equal(rec._new, undefined);

  const again = await lib.installPackage(pkg, w.agents, { subagentsDir: w.subs, hubRoot: w.hub, start: false });
  assert.equal(again.unchanged, true, JSON.stringify(again));
  assert.ok(again.lines.every((l) => l.startsWith('= ')), again.lines.join('\n'));
  assert.ok(again.lines.some((l) => l.includes('.claude/skills/alpha')));
});

test('a dry run plans the skills and writes nothing', async (t) => {
  const w = world(t);
  const pkg = makePackage(w, 'sample', ['alpha'], await spare());
  const r = await lib.installPackage(pkg, w.agents, { subagentsDir: w.subs, hubRoot: w.hub, dryRun: true });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(r.lines.join('\n'), /^\+ .*\.claude\/skills\/alpha {2}\(a skill Sample needs/m);
  assert.ok(!fs.existsSync(w.skills), 'no skill written');
  assert.ok(!fs.existsSync(w.record), 'no record written');
  assert.ok(!fs.existsSync(w.agents));
});

test('a skill the pack does not have, a missing pack, or no Hub refuses the package, and nothing is written', async (t) => {
  const w = world(t);
  const untouched = () => {
    assert.ok(!fs.existsSync(w.agents), 'no agent written');
    assert.ok(!fs.existsSync(w.subs), 'no subagent written');
    assert.ok(!fs.existsSync(w.skills), 'no skill written, not even the ones the pack has');
    assert.ok(!fs.existsSync(w.record), 'no record written');
  };

  const r = await lib.installPackage(makePackage(w, 'sample', ['alpha', 'gamma'], await spare()), w.agents, { subagentsDir: w.subs, hubRoot: w.hub, yes: true });
  assert.equal(r.refused, true, JSON.stringify(r));
  assert.match(r.errors.join(' '), /Sample needs the skill gamma/);
  assert.match(r.errors.join(' '), new RegExp(w.ref.slice(0, 7)));
  untouched();

  const late = await lib.installPackage(makePackage(w, 'later', ['late'], await spare()), w.agents, { subagentsDir: w.subs, hubRoot: w.hub, yes: true });
  assert.equal(late.refused, true, 'a skill only in a later commit than the pin is not in the pack');
  untouched();

  const noHub = await lib.installPackage(makePackage(w, 'nohub', ['alpha'], await spare()), w.agents, { subagentsDir: w.subs, yes: true });
  assert.equal(noHub.refused, true);
  assert.match(noHub.errors.join(' '), /needs the Hub/);
  untouched();
});

test('no pack in the Hub yet: refused, with the installer named as the way to get it', async (t) => {
  const w = world(t, { noPack: true });
  const r = await lib.installPackage(makePackage(w, 'sample', ['alpha'], await spare()), w.agents, { subagentsDir: w.subs, hubRoot: w.hub, yes: true });
  assert.equal(r.refused, true, JSON.stringify(r));
  assert.match(r.errors.join(' '), /node install\.js/);
  assert.ok(!fs.existsSync(w.agents));
});

test('install-agent: a missing skill exits 2 with nothing written; a good package exits 0 with a + per skill', async (t) => {
  const w = world(t);
  const env = Object.assign({}, process.env, {
    HUB_ROOT: w.hub,
    WORKSPACE_CONFIG: path.join(w.base, 'no-workspace.config.json'),
    WORKSPACE_HOME: path.join(w.base, 'office-home'),
    WORKSPACE_STARTER: w.starter,
  });
  const run = (...args) => spawnSync(process.execPath, [INSTALL, ...args], { env, encoding: 'utf8', timeout: 60000, windowsHide: true });

  const bad = run(makePackage(w, 'gappy', ['gamma'], await spare()), '--hub', w.hub, '--no-start');
  assert.equal(bad.status, 2, bad.stdout);
  assert.match(bad.stdout, /NOT DONE/);
  assert.match(bad.stdout, /gamma/);
  assert.ok(!fs.existsSync(path.join(w.agents, 'gappy')));
  assert.ok(!fs.existsSync(w.record));

  const ok = run(makePackage(w, 'sample', ['alpha', 'beta'], await spare()), '--hub', w.hub, '--yes', '--no-start');
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(ok.stdout, /^ {2}\+ .*\.claude\/skills\/alpha {2}\(a skill Sample needs/m);
  assert.match(ok.stdout, /^ {2}\+ .*\.claude\/skills\/beta {2}\(a skill Sample needs/m);
  assert.ok(fs.existsSync(path.join(w.skills, 'alpha', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(w.skills, 'beta', 'SKILL.md')));
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(w.record, 'utf8')).copies).sort(), ['.claude/skills/alpha', '.claude/skills/beta']);
});
