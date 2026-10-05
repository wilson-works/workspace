'use strict';

/**
 * hub-init.test.js — hub init (hub/lib/hub.js plan and init).
 *
 * A fresh init makes the whole Hub; a second run is all `=`; a file of yours that differs is kept (`!`) under
 * yes, asked about otherwise, and replaced only on a yes. Each test makes its own Hub in a temp folder and gives
 * every value (machine, owner, date), so nothing on this computer leaks in.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const hub = require('../hub/lib/hub');
const { ZONES } = require('../hub/lib/root');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-init-'));
test.after(() => {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* a temp folder left behind is harmless */ }
});

const OPTS = { machine: 'DESK', role: 'command', owner: 'Alex', date: '2026-10-05' };
const SKELETON = ['20-Coding/Projects', '20-Coding/_Caches', '30-Media/_Ingest', '50-AI/agents', '90-Archive/_DumpQueue'];

let n = 0;
function freshRoot() {
  n += 1;
  return path.join(TMP, `hub-${n}`);
}
const at = (root, rel) => path.join(root, ...rel.split('/'));
const read = (root, rel) => fs.readFileSync(at(root, rel), 'utf8');
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch (_) { return false; } };
const lines = (items) => items.map((i) => i.line).join('\n');
const item = (items, p) => items.find((i) => i.path === p);

test('a fresh init makes the zones, the skeleton, the marker, the rules, the zone guides and NAV.md', async () => {
  const root = freshRoot();
  const res = await hub.init(root, Object.assign({ yes: true }, OPTS));
  assert.ok(res.items.every((i) => i.mark === '+'), lines(res.items));
  assert.strictEqual(res.changed, res.items.length);

  for (const z of ZONES) {
    assert.ok(isDir(at(root, z.dir)), z.dir);
    assert.doesNotMatch(read(root, `${z.dir}/README.md`), /\{\{\w+\}\}/, `${z.dir}/README.md`);
  }
  for (const d of SKELETON) {
    assert.ok(isDir(at(root, d)), d);
    assert.ok(!fs.existsSync(at(root, `${d}/.gitkeep`)), `${d}/.gitkeep is the template's, never copied`);
  }

  assert.deepStrictEqual(JSON.parse(read(root, '.hub/hub.json')), {
    format: 1, machine: 'DESK', role: 'command', code_zone: '20-Coding/Projects',
    workspace: '50-AI/workspace', owner: 'Alex', created: '2026-10-05',
  });

  const rules = read(root, 'CLAUDE.md');
  assert.doesNotMatch(rules, /\{\{\w+\}\}/);
  assert.match(rules, /^# DESK: the Hub constitution/);
  assert.match(rules, /Role: \*\*command\*\*/);
  assert.match(rules, /Alex/);
  assert.match(rules, /`20-Coding\/Projects\/`/);
  assert.match(rules, /node 50-AI\/workspace\/bin\/ask-owner\.js/);
  assert.ok(rules.split('\n').length <= 120, 'the constitution stays short');

  const nav = JSON.parse(read(root, '.hub/nav.json'));
  assert.ok(nav.rows.some((r) => r.path === '20-Coding/Projects/<repo>/'), 'the code zone is filled into the rows');
  assert.ok(nav.rows.every((r) => !/\{\{/.test(r.path)));

  assert.ok(read(root, 'NAV.md').startsWith('# NAV: DESK\n<!-- regenerated 2026-10-05 by hub nav. Edit .hub/nav.json, not this file. -->\n'));
});

test('a dry run shows the plan and writes nothing; plan() is the same plan', async () => {
  const root = freshRoot();
  const res = await hub.init(root, Object.assign({ dryRun: true }, OPTS));
  assert.ok(!fs.existsSync(root), 'nothing written');
  assert.ok(res.items.length > 20);
  assert.ok(res.items.every((i) => i.mark === '+'), lines(res.items));
  assert.strictEqual(lines(hub.plan(root, OPTS)), lines(res.items));
});

test('a second run is all =, and so is a run on another day with no values given', async () => {
  const root = freshRoot();
  await hub.init(root, Object.assign({ yes: true }, OPTS));
  const nav = read(root, 'NAV.md');

  const again = await hub.init(root, Object.assign({ yes: true }, OPTS));
  assert.ok(again.items.every((i) => i.mark === '='), lines(again.items));
  assert.strictEqual(again.changed, 0);
  assert.ok(hub.plan(root, OPTS).every((i) => i.mark === '='));

  // The values come from .hub/hub.json and the templates are dated by its `created`, so nothing drifts.
  const later = await hub.init(root, { yes: true, date: '2026-10-09' });
  assert.ok(later.items.every((i) => i.mark === '='), lines(later.items));
  assert.strictEqual(read(root, 'NAV.md'), nav);
});

test('a CLAUDE.md of yours is kept under yes, and nothing is asked', async () => {
  const root = freshRoot();
  await hub.init(root, Object.assign({ yes: true }, OPTS));
  const mine = `${read(root, 'CLAUDE.md')}\n- My own rule: photos stay in 30-Media.\n`;
  fs.writeFileSync(at(root, 'CLAUDE.md'), mine);

  let asked = 0;
  const res = await hub.init(root, Object.assign({ yes: true, ask: async () => { asked += 1; return true; } }, OPTS));
  assert.strictEqual(item(res.items, 'CLAUDE.md').mark, '!');
  assert.match(item(res.items, 'CLAUDE.md').line, /kept/);
  assert.strictEqual(asked, 0);
  assert.strictEqual(read(root, 'CLAUDE.md'), mine);
  assert.strictEqual(res.changed, 0);
});

test('without yes it asks: a no keeps your file, a yes puts the template back', async () => {
  const root = freshRoot();
  await hub.init(root, Object.assign({ yes: true }, OPTS));
  const template = read(root, 'CLAUDE.md');
  fs.writeFileSync(at(root, 'CLAUDE.md'), `${template}\n- My own rule.\n`);

  const questions = [];
  const no = await hub.init(root, Object.assign({ ask: async (q) => { questions.push(q); return false; } }, OPTS));
  assert.deepStrictEqual(questions, ['Your CLAUDE.md is different from the template. Replace it with the template?']);
  assert.strictEqual(item(no.items, 'CLAUDE.md').mark, '!');
  assert.match(read(root, 'CLAUDE.md'), /My own rule/);

  const yes = await hub.init(root, Object.assign({ ask: async () => true }, OPTS));
  assert.strictEqual(item(yes.items, 'CLAUDE.md').mark, '~');
  assert.strictEqual(read(root, 'CLAUDE.md'), template);
});

test('a different machine asked for keeps the marker, and the templates are filled from what it really says', async () => {
  const root = freshRoot();
  await hub.init(root, Object.assign({ yes: true }, OPTS));
  const res = await hub.init(root, Object.assign({ yes: true }, OPTS, { machine: 'LAPTOP' }));
  assert.strictEqual(item(res.items, '.hub/hub.json').mark, '!');
  assert.match(item(res.items, '.hub/hub.json').line, /machine is DESK \(asked: LAPTOP\)/);
  assert.strictEqual(JSON.parse(read(root, '.hub/hub.json')).machine, 'DESK');
  assert.strictEqual(item(res.items, 'CLAUDE.md').mark, '=');
});

test('a marker made by hand gains the values it is missing and keeps its own', async () => {
  const root = freshRoot();
  fs.mkdirSync(at(root, '.hub'), { recursive: true });
  fs.writeFileSync(at(root, '.hub/hub.json'), JSON.stringify({ machine: 'MINI', role: 'builder', fleet: 'kept' }));
  const res = await hub.init(root, { owner: 'Alex', yes: true, date: '2026-10-05' });
  assert.strictEqual(item(res.items, '.hub/hub.json').mark, '~');
  assert.match(item(res.items, '.hub/hub.json').line, /adds /);
  const m = JSON.parse(read(root, '.hub/hub.json'));
  assert.strictEqual(m.machine, 'MINI');
  assert.strictEqual(m.role, 'builder');
  assert.strictEqual(m.fleet, 'kept');
  assert.strictEqual(m.owner, 'Alex');
  assert.strictEqual(m.code_zone, '20-Coding/Projects');
  assert.strictEqual(m.format, 1);
  assert.strictEqual(m.created, '2026-10-05');
  assert.match(read(root, 'CLAUDE.md'), /Name: \*\*MINI\*\*\. Role: \*\*builder\*\*/);
});

test('a builder computer gets its own code zone and no Projects folder', async () => {
  const root = freshRoot();
  await hub.init(root, Object.assign({ yes: true }, OPTS, { role: 'builder', codeZone: '20-Coding/Active' }));
  assert.ok(isDir(at(root, '20-Coding/Active')));
  assert.ok(!fs.existsSync(at(root, '20-Coding/Projects')));
  assert.match(read(root, 'CLAUDE.md'), /Code lives in `20-Coding\/Active\/`/);
  assert.strictEqual(JSON.parse(read(root, '.hub/hub.json')).code_zone, '20-Coding/Active');
});

test('bad values and unsafe places are refused with exit code 2, and nothing is written', async () => {
  const refused = (e) => e.exitCode === 2;
  const root = freshRoot();
  await assert.rejects(hub.init(root, Object.assign({}, OPTS, { role: 'boss' })), (e) => refused(e) && /command, builder or mobile/.test(e.message));
  await assert.rejects(hub.init(root, Object.assign({}, OPTS, { machine: 'my desk' })), refused);
  await assert.rejects(hub.init(root, Object.assign({}, OPTS, { codeZone: '../outside' })), refused);
  await assert.rejects(hub.init(root, Object.assign({}, OPTS, { date: '5 Oct 2026' })), refused);
  assert.throws(() => hub.plan(root, Object.assign({}, OPTS, { role: 'boss' })), refused);
  assert.ok(!fs.existsSync(root));
  await assert.rejects(hub.init(path.parse(TMP).root, OPTS), (e) => refused(e) && /whole drive/.test(e.message));
  await assert.rejects(hub.init(os.homedir(), Object.assign({ dryRun: true }, OPTS)), (e) => refused(e) && /user folder|whole drive/.test(e.message));
});

test('a zone README of yours is kept, and the rest of the Hub still comes up', async () => {
  const root = freshRoot();
  fs.mkdirSync(at(root, '00-Inbox'), { recursive: true });
  fs.writeFileSync(at(root, '00-Inbox/README.md'), 'My inbox notes.\n');
  const res = await hub.init(root, Object.assign({ yes: true }, OPTS));
  assert.strictEqual(item(res.items, '00-Inbox/').mark, '=');
  assert.strictEqual(item(res.items, '00-Inbox/README.md').mark, '!');
  assert.strictEqual(read(root, '00-Inbox/README.md'), 'My inbox notes.\n');
  assert.strictEqual(item(res.items, 'CLAUDE.md').mark, '+');
});
