'use strict';

/**
 * hub-doctor.test.js — hub doctor (hub/lib/hub.js doctor): a read-only report on a Hub.
 *
 * It checks the marker, the zones, CLAUDE.md and NAV.md, and lists strays at the root, dump-pile folders, projects
 * that are not git repositories and names with spaces, looking no deeper than the folders directly inside each zone
 * and the code zone. NAV.md is stale when it no longer matches the Hub and is more than 8 days old. Each test makes
 * its own Hub in a temp folder and passes the date in.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const hub = require('../hub/lib/hub');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-doctor-'));
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
const mkdir = (root, rel) => fs.mkdirSync(at(root, rel), { recursive: true });
const texts = (r, level) => r.items.filter((i) => i.level === level).map((i) => i.text);
const has = (list, s) => list.some((t) => t.includes(s));

/** Every name at the root and directly inside each zone, with each file's text: what "changes nothing" is held to. */
function snapshot(root) {
  const out = {};
  for (const name of fs.readdirSync(root)) {
    const p = path.join(root, name);
    if (fs.statSync(p).isDirectory()) {
      out[name] = fs.readdirSync(p).sort();
    } else {
      out[name] = fs.readFileSync(p, 'utf8');
    }
  }
  return out;
}

test('a fresh Hub is all ok, with nothing to fix', async () => {
  const root = await madeHub();
  const r = hub.doctor(root, { date: '2026-10-05' });
  assert.strictEqual(r.fixes, 0, JSON.stringify(r.items, null, 1));
  assert.ok(r.items.every((i) => i.level === 'ok'), JSON.stringify(r.items, null, 1));
  assert.ok(has(texts(r, 'ok'), '.hub/hub.json: DESK, command, code in 20-Coding/Projects.'));
  assert.ok(has(texts(r, 'ok'), 'All 7 zones are here.'));
  assert.ok(has(texts(r, 'ok'), 'NAV.md matches the Hub'));
});

test('it lists strays at the root, dump piles, loose projects and names with spaces', async () => {
  const root = await madeHub();
  fs.writeFileSync(at(root, 'notes.txt'), 'loose');
  fs.writeFileSync(at(root, '.DS_Store'), '');
  mkdir(root, 'Migration-2026-01-01');
  mkdir(root, '40-Personal/misc');
  mkdir(root, '30-Media/_work');
  mkdir(root, '50-AI/sort-later');
  mkdir(root, '20-Coding/Projects/old stuff');
  mkdir(root, '20-Coding/Projects/seed-saver');
  fs.writeFileSync(at(root, '00-Inbox/scan 0043.pdf'), 'x');

  const r = hub.doctor(root, { date: '2026-10-05' });
  const fix = texts(r, 'fix');
  assert.ok(has(fix, 'notes.txt does not belong at the Hub root'), fix.join('\n'));
  assert.ok(has(fix, 'Migration-2026-01-01/ does not belong at the Hub root'), fix.join('\n'));
  assert.ok(has(fix, 'Migration-2026-01-01/ looks like a dump pile'), fix.join('\n'));
  assert.ok(has(fix, '40-Personal/misc/ looks like a dump pile'), fix.join('\n'));
  assert.ok(has(fix, '30-Media/_work/ looks like a dump pile'), fix.join('\n'));
  assert.ok(has(fix, '50-AI/sort-later/ looks like a dump pile'), fix.join('\n'));
  assert.ok(has(fix, '"20-Coding/Projects/old stuff" has a space in its name'), fix.join('\n'));
  assert.ok(has(fix, '20-Coding/Projects/seed-saver/ is not a git repository'), fix.join('\n'));
  assert.ok(!has(fix, 'scan 0043'), 'downloads in 00-Inbox keep their names until they are sorted');
  assert.ok(!has(fix, '.DS_Store'), 'system files are not strays');
  assert.strictEqual(r.fixes, fix.length);
});

test('it looks no deeper than the folders directly inside each zone and the code zone', async () => {
  const root = await madeHub();
  mkdir(root, '40-Personal/Taxes/misc');
  mkdir(root, '40-Personal/Taxes/old receipts');
  mkdir(root, '20-Coding/Projects/garden-planner/.git');
  mkdir(root, '20-Coding/Projects/garden-planner/my notes');
  const r = hub.doctor(root, { date: '2026-10-05' });
  const all = r.items.map((i) => i.text).join('\n');
  assert.ok(!all.includes('Taxes/misc'), all);
  assert.ok(!all.includes('old receipts'), all);
  assert.ok(!all.includes('my notes'), all);
});

test('NAV.md: matching is ok however old; behind and older than 8 days is stale; behind but recent is a note', async () => {
  const root = await madeHub({ date: '2026-09-01' });
  let r = hub.doctor(root, { date: '2026-10-05' });
  assert.ok(has(texts(r, 'ok'), 'NAV.md matches the Hub (last changed 2026-09-01, 34 days ago)'), JSON.stringify(r.items, null, 1));

  mkdir(root, '10-Business/NewCo');
  r = hub.doctor(root, { date: '2026-10-05' });
  assert.ok(has(texts(r, 'fix'), 'NAV.md is stale'), JSON.stringify(r.items, null, 1));

  r = hub.doctor(root, { date: '2026-09-05' });
  assert.ok(has(texts(r, 'note'), 'NAV.md no longer matches the Hub'), JSON.stringify(r.items, null, 1));
  assert.ok(!has(texts(r, 'fix'), 'NAV.md'));

  hub.writeNav(root, { date: '2026-10-05' });
  r = hub.doctor(root, { date: '2026-10-05' });
  assert.strictEqual(r.fixes, 0, JSON.stringify(r.items, null, 1));
});

test('missing pieces are each named, with what to run', async () => {
  const root = await madeHub();
  fs.rmSync(at(root, 'CLAUDE.md'));
  fs.rmSync(at(root, 'NAV.md'));
  fs.rmSync(at(root, '40-Personal'), { recursive: true });
  const r = hub.doctor(root, { date: '2026-10-05' });
  const fix = texts(r, 'fix');
  assert.ok(has(fix, 'No CLAUDE.md at the Hub root'), fix.join('\n'));
  assert.ok(has(fix, 'No NAV.md. Run hub nav'), fix.join('\n'));
  assert.ok(has(fix, 'Missing zone: 40-Personal'), fix.join('\n'));

  const plain = path.join(TMP, 'not-a-hub');
  fs.mkdirSync(plain, { recursive: true });
  assert.ok(has(texts(hub.doctor(plain), 'fix'), 'No .hub/hub.json'));
});

test('a marker with a role that is not one of the three is a fix', async () => {
  const root = await madeHub();
  const file = at(root, '.hub/hub.json');
  fs.writeFileSync(file, JSON.stringify(Object.assign(JSON.parse(fs.readFileSync(file, 'utf8')), { role: 'server' })));
  assert.ok(has(texts(hub.doctor(root, { date: '2026-10-05' }), 'fix'), 'the role is "server"'));
});

test('the doctor changes nothing', async () => {
  const root = await madeHub();
  fs.writeFileSync(at(root, 'notes.txt'), 'loose');
  mkdir(root, '10-Business/NewCo');
  const before = snapshot(root);
  hub.doctor(root, { date: '2026-10-20' });
  assert.deepStrictEqual(snapshot(root), before);
});
