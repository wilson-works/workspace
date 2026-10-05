'use strict';

/**
 * hub-new-project.test.js — hub new-project (hub/lib/hub.js newProject).
 *
 * A project is a kebab-case folder in the code zone with its own CLAUDE.md, README.md and .gitignore, a git
 * repository on main when git is there, and a row in NAV.md. A bad name, a name in use, or no Hub is refused with
 * exit code 2. Each test makes its own Hub in a temp folder.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const hub = require('../hub/lib/hub');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-new-project-'));
test.after(() => {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* a temp folder left behind is harmless */ }
});

const OPTS = { machine: 'DESK', role: 'command', owner: 'Alex', date: '2026-10-05', yes: true };

let n = 0;
async function madeHub(extra) {
  n += 1;
  const root = path.join(TMP, `hub-${n}`);
  await hub.init(root, Object.assign({}, OPTS, extra || {}));
  return root;
}
const at = (root, rel) => path.join(root, ...rel.split('/'));
const gitWorks = () => { const r = spawnSync('git', ['--version'], { windowsHide: true }); return !r.error && r.status === 0; };
const refused = (re) => (e) => e.exitCode === 2 && (!re || re.test(e.message));

test('makes the project with its CLAUDE.md, README.md and .gitignore, and puts it in NAV.md', async () => {
  const root = await madeHub();
  const r = hub.newProject(root, 'garden-planner', { date: '2026-10-05' });
  const dir = at(root, '20-Coding/Projects/garden-planner');
  assert.strictEqual(r.dir, dir);

  const rules = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
  assert.ok(rules.startsWith('# garden-planner\n'));
  assert.match(rules, /Made 2026-10-05/);
  assert.match(rules, /Keep this file short: delete any line Claude could read from the code itself/);
  for (const h of ['## What this is', '## Run, build and check', '## Map', '## Branch rules', '## Do not touch']) assert.ok(rules.includes(h), h);
  assert.doesNotMatch(rules, /\{\{\w+\}\}/);
  assert.match(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), /^# garden-planner\n/);
  assert.match(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), /^\.env$/m);

  assert.ok(fs.readFileSync(at(root, 'NAV.md'), 'utf8').includes('`20-Coding/Projects/garden-planner/`'));
  const nav = r.items.find((i) => i.path === 'NAV.md');
  assert.strictEqual(nav.mark, '~');
  assert.strictEqual(r.items[0].line, '+ 20-Coding/Projects/garden-planner/');
});

test('the project is a git repository on main when git is installed', async (t) => {
  if (!gitWorks()) { t.skip('git is not installed'); return; }
  const root = await madeHub();
  const r = hub.newProject(root, 'seed-saver', { date: '2026-10-05' });
  assert.ok(fs.existsSync(path.join(r.dir, '.git')));
  const head = spawnSync('git', ['-C', r.dir, 'symbolic-ref', '--short', 'HEAD'], { encoding: 'utf8', windowsHide: true });
  assert.strictEqual(head.stdout.trim(), 'main');
  assert.deepStrictEqual(r.notes, []);
});

test('a name that is not kebab-case is refused', async () => {
  const root = await madeHub();
  for (const bad of ['Garden', 'garden_planner', 'garden planner', '-garden', 'garden-', 'garden--planner', 'con']) {
    assert.throws(() => hub.newProject(root, bad), refused(), bad);
  }
  assert.throws(() => hub.newProject(root, ''), refused(/Give the project a name/));
  assert.deepStrictEqual(fs.readdirSync(at(root, '20-Coding/Projects')), [], 'nothing made');
});

test('a name already in use is refused, in either code zone spelling', async () => {
  const root = await madeHub();
  hub.newProject(root, 'garden-planner');
  assert.throws(() => hub.newProject(root, 'garden-planner'), refused(/already exists/));
  fs.mkdirSync(at(root, '20-Coding/Active/herb-log'), { recursive: true });
  assert.throws(() => hub.newProject(root, 'herb-log'), refused(/already exists/));
});

test('outside a Hub it is refused', () => {
  const plain = path.join(TMP, 'not-a-hub');
  fs.mkdirSync(plain, { recursive: true });
  assert.throws(() => hub.newProject(plain, 'garden-planner'), refused(/no \.hub\/hub\.json/));
});

test('a dry run writes nothing', async () => {
  const root = await madeHub();
  const nav = fs.readFileSync(at(root, 'NAV.md'), 'utf8');
  const r = hub.newProject(root, 'herb-log', { dryRun: true });
  assert.strictEqual(r.dryRun, true);
  assert.strictEqual(r.items[0].mark, '+');
  assert.ok(!fs.existsSync(at(root, '20-Coding/Projects/herb-log')));
  assert.strictEqual(fs.readFileSync(at(root, 'NAV.md'), 'utf8'), nav);
});

test('the project goes in the code zone hub.json records', async () => {
  const root = await madeHub({ role: 'builder', codeZone: '20-Coding/Active' });
  const r = hub.newProject(root, 'garden-planner');
  assert.strictEqual(r.dir, at(root, '20-Coding/Active/garden-planner'));
  assert.ok(fs.readFileSync(at(root, 'NAV.md'), 'utf8').includes('`20-Coding/Active/garden-planner/`'));
});
