'use strict';

/**
 * hub-nav.test.js — NAV.md (hub/lib/hub.js generateNav and writeNav).
 *
 * NAV.md is the nav.json rows plus a row per project, company and agent; the zone tree one level deep; and the
 * projects with their git remotes. It is bounded: nothing deeper than the folders directly inside each zone (and
 * the code zone) ever appears. A run with nothing new leaves the file alone. Each test makes its own Hub in a temp
 * folder; the git remote is a made-up address that is never contacted.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const hub = require('../hub/lib/hub');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-nav-'));
test.after(() => {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* a temp folder left behind is harmless */ }
});

const OPTS = { machine: 'DESK', role: 'command', owner: 'Alex', date: '2026-10-05', yes: true };
const DATE = { date: '2026-10-05' };
const STAMP = '<!-- regenerated 2026-10-05 by hub nav. Edit .hub/nav.json, not this file. -->';

let n = 0;
async function madeHub(extra) {
  n += 1;
  const root = path.join(TMP, `hub-${n}`);
  await hub.init(root, Object.assign({}, OPTS, extra || {}));
  return root;
}
const at = (root, rel) => path.join(root, ...rel.split('/'));
const mkdir = (root, rel) => fs.mkdirSync(at(root, rel), { recursive: true });
const gitWorks = () => { const r = spawnSync('git', ['--version'], { windowsHide: true }); return !r.error && r.status === 0; };
const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });

test('NAV.md names the computer and carries exactly one stamp line', async () => {
  const root = await madeHub();
  const text = hub.generateNav(root, DATE);
  const lines = text.split('\n');
  assert.strictEqual(lines[0], '# NAV: DESK');
  assert.strictEqual(lines[1], STAMP);
  assert.strictEqual(lines.filter((l) => l.includes('regenerated')).length, 1);
  assert.ok(text.includes(`The Hub is \`${path.resolve(root)}\``));
  for (const h of ['## Plain English to path', '## The zone tree', '## Projects']) assert.ok(text.includes(h), h);
});

test('rows come from nav.json, then one per project, company and agent', async () => {
  const root = await madeHub();
  fs.writeFileSync(at(root, '.hub/nav.json'), JSON.stringify({
    rows: [
      { say: ['receipts'], path: '10-Business/GreenThumb/Receipts/' },
      { say: 'seed catalog', path: '30-Media/GreenThumb/' },
      { say: [], path: 'nowhere/' },
    ],
  }));
  mkdir(root, '10-Business/GreenThumb/Receipts');
  mkdir(root, '20-Coding/Projects/garden-planner');
  mkdir(root, '50-AI/agents/iris');
  fs.writeFileSync(at(root, '50-AI/agents/iris/agent.json'), JSON.stringify({ key: 'iris', name: 'Iris', title: 'The Research Desk' }));
  mkdir(root, '50-AI/agents/bare');

  const text = hub.generateNav(root, DATE);
  assert.ok(text.includes('| "receipts" | `10-Business/GreenThumb/Receipts/` |'), text);
  assert.ok(text.includes('| "seed catalog" | `30-Media/GreenThumb/` (not here yet) |'), text);
  assert.ok(text.includes('1 row in `.hub/nav.json` skipped'), text);
  assert.ok(text.includes('| "garden-planner" | `20-Coding/Projects/garden-planner/` |'), text);
  assert.ok(text.includes('| "GreenThumb", "green thumb" | `10-Business/GreenThumb/` |'), text);
  assert.ok(text.includes('| "Iris", "The Research Desk" | `50-AI/agents/iris/` |'), text);
  assert.ok(text.includes('| "bare" | `50-AI/agents/bare/` |'), text);
  assert.ok(text.includes('| `garden-planner` | no |  |'), text);
});

test('a project with an origin shows its GitHub name and remote; one without shows none', async (t) => {
  if (!gitWorks()) { t.skip('git is not installed'); return; }
  const root = await madeHub();
  const planner = at(root, '20-Coding/Projects/garden-planner');
  const saver = at(root, '20-Coding/Projects/seed-saver');
  fs.mkdirSync(planner, { recursive: true });
  fs.mkdirSync(saver, { recursive: true });
  assert.strictEqual(git(planner, 'init', '-q').status, 0);
  assert.strictEqual(git(planner, 'remote', 'add', 'origin', 'https://github.com/alex-example/garden-planner.git').status, 0);
  assert.strictEqual(git(saver, 'init', '-q').status, 0);

  const text = hub.generateNav(root, DATE);
  assert.ok(text.includes('| "garden-planner", "alex-example/garden-planner" | `20-Coding/Projects/garden-planner/` |'), text);
  assert.ok(text.includes('| `garden-planner` | yes | `https://github.com/alex-example/garden-planner.git` |'), text);
  assert.ok(text.includes('| `seed-saver` | yes | none |'), text);
});

test('bounded: a folder three levels deep never appears, and a zone shows at most 30 folders', async () => {
  const root = await madeHub();
  mkdir(root, '40-Personal/Taxes/Receipts2026');
  mkdir(root, '10-Business/GreenThumb/SupplierDeals');
  mkdir(root, '20-Coding/Projects/garden-planner/DeepFolderXyz');
  for (let i = 1; i <= 32; i += 1) mkdir(root, `30-Media/Shoot${String(i).padStart(2, '0')}`);

  const text = hub.generateNav(root, DATE);
  assert.ok(text.includes('Taxes/'), 'the folders directly inside a zone are listed');
  for (const deep of ['Receipts2026', 'SupplierDeals', 'DeepFolderXyz']) assert.ok(!text.includes(deep), deep);
  // 30-Media holds _Ingest plus 32 shoots: the first 30 by name are shown, then the count of the rest.
  assert.ok(text.includes('Shoot29/'));
  assert.ok(!text.includes('Shoot30/'));
  assert.ok(text.includes('  and 3 more'), text);
});

test('writeNav leaves the file alone when only the date would change, and rewrites it when the Hub changed', async () => {
  const root = await madeHub();
  const file = at(root, 'NAV.md');
  const before = fs.readFileSync(file, 'utf8');
  assert.ok(before.includes(STAMP));

  const same = hub.writeNav(root, { date: '2026-10-07' });
  assert.strictEqual(same.changed, false);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), before);

  mkdir(root, '10-Business/NewCo');
  const changed = hub.writeNav(root, { date: '2026-10-07' });
  assert.strictEqual(changed.changed, true);
  const after = fs.readFileSync(file, 'utf8');
  assert.ok(after.includes('regenerated 2026-10-07'));
  assert.ok(after.includes('`10-Business/NewCo/`'));

  const dry = hub.writeNav(root, { date: '2026-10-08', dryRun: true });
  assert.strictEqual(dry.changed, false, 'nothing new since the last write');
  mkdir(root, '10-Business/OtherCo');
  assert.strictEqual(hub.writeNav(root, { date: '2026-10-08', dryRun: true }).changed, true);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), after, 'a dry run writes nothing');
});

test('a NAV.md that hub nav did not make is kept, unless replace is asked for', async () => {
  const root = await madeHub();
  const file = at(root, 'NAV.md');
  fs.writeFileSync(file, '# My own map\n');
  const kept = hub.writeNav(root, DATE);
  assert.strictEqual(kept.kept, true);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), '# My own map\n');

  const replaced = hub.writeNav(root, Object.assign({ replace: true }, DATE));
  assert.strictEqual(replaced.changed, true);
  assert.ok(fs.readFileSync(file, 'utf8').startsWith('# NAV: DESK\n'));
});

test('a nav.json that is not JSON is reported inside NAV.md, never thrown', async () => {
  const root = await madeHub();
  fs.writeFileSync(at(root, '.hub/nav.json'), '{ not json');
  const text = hub.generateNav(root, DATE);
  assert.ok(text.includes('`.hub/nav.json` could not be read'), text);
});

test('a builder Hub lists the projects in its own code zone', async () => {
  const root = await madeHub({ role: 'builder', codeZone: '20-Coding/Active' });
  mkdir(root, '20-Coding/Active/garden-planner');
  const text = hub.generateNav(root, DATE);
  assert.ok(text.includes('Code zone: `20-Coding/Active/`'), text);
  assert.ok(text.includes('| "garden-planner" | `20-Coding/Active/garden-planner/` |'), text);
  assert.ok(text.includes('| "my code", "projects", "repos" | `20-Coding/Active/<repo>/` |'), text);
});
