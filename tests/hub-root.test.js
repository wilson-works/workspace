'use strict';

/**
 * hub-root.test.js — hub/lib/root.js: where this computer's Hub is, and where its code lives.
 *
 * Every test makes its own Hubs in a temp folder and passes the environment in (env), so this computer's own
 * HUB_ROOT, home folder or Hub never leaks in. fromOnly keeps the walk-up to the folder each test names, and
 * probe: false skips the usual places, except in the one test that is about them.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const hubRoot = require('../hub/lib/root');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-root-'));
test.after(() => {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* a temp folder left behind is harmless */ }
});

let n = 0;
function plainDir(...inside) {
  n += 1;
  const dir = path.join(TMP, `plain-${n}`, ...inside);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(TMP, `plain-${n}`);
}

/** Marks dir as a Hub (its .hub/hub.json holds extra) and makes the folders named, like '20-Coding/Active'. */
function markHub(dir, extra, folders) {
  fs.mkdirSync(path.join(dir, '.hub'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.hub', 'hub.json'), JSON.stringify(Object.assign({ format: 1, machine: 'DESK' }, extra || {})));
  for (const f of folders || []) fs.mkdirSync(path.join(dir, ...f.split('/')), { recursive: true });
  return dir;
}

function makeHub(extra, folders) {
  n += 1;
  return markHub(path.join(TMP, `hub-${n}`), extra, folders);
}

const alone = (env, from) => ({ env, from, fromOnly: true, probe: false });

test('the seven zones, with the same names on every computer', () => {
  assert.deepStrictEqual(hubRoot.ZONES.map((z) => z.dir),
    ['00-Inbox', '10-Business', '20-Coding', '30-Media', '40-Personal', '50-AI', '90-Archive']);
});

test('a HUB_ROOT that is not a Hub throws and names it, instead of being skipped', () => {
  const wrong = plainDir();
  const named = (e) => /HUB_ROOT/.test(e.message) && e.message.includes(wrong);
  assert.throws(() => hubRoot.findHubRoot(alone({ HUB_ROOT: wrong }, wrong)), named);
  assert.throws(() => hubRoot.resolveHubRoot(alone({ HUB_ROOT: wrong }, wrong)), named);
});

test('a HUB_ROOT that is a Hub wins over the folder the search starts in', () => {
  const pinned = makeHub();
  const other = makeHub({}, ['20-Coding/Projects/garden-planner']);
  const r = hubRoot.findHubRoot(alone({ HUB_ROOT: pinned }, path.join(other, '20-Coding', 'Projects', 'garden-planner')));
  assert.strictEqual(r.root, path.resolve(pinned));
  assert.strictEqual(r.how, 'HUB_ROOT');
});

test('walks up from a folder deep inside a Hub', () => {
  const hub = makeHub({}, ['20-Coding/Projects/garden-planner/src']);
  const deep = path.join(hub, '20-Coding', 'Projects', 'garden-planner', 'src');
  const r = hubRoot.findHubRoot(alone({}, deep));
  assert.strictEqual(r.root, path.resolve(hub));
  assert.match(r.how, /^found above /);
  assert.strictEqual(hubRoot.resolveHubRoot(alone({}, deep)), path.resolve(hub));
});

test('nothing found: findHubRoot gives null and resolveHubRoot throws, naming where it looked', () => {
  const nowhere = path.join(plainDir('a', 'b'), 'a', 'b');
  assert.strictEqual(hubRoot.findHubRoot(alone({}, nowhere)), null);
  assert.throws(() => hubRoot.resolveHubRoot(alone({}, nowhere)),
    (e) => /No Hub found/.test(e.message) && e.message.includes(nowhere));
});

test('the usual places follow the home folder in the environment it is given', () => {
  if (process.platform === 'win32') {
    // Every drive from D to Z, then C, each as <drive>:\Hub; then the home folder's Hub, last.
    const c = hubRoot.candidates({ USERPROFILE: 'C:\\Users\\alex' });
    const drives = c.slice(0, -1);
    assert.strictEqual(drives.length, 24);
    assert.ok(drives.every((d) => /^[A-Z]:\\Hub$/.test(d)), drives.join(', '));
    assert.deepStrictEqual([drives[0][0], drives[22][0], drives[23][0]], ['D', 'Z', 'C']);
    assert.strictEqual(c[c.length - 1], 'C:\\Users\\alex\\Hub');
  } else {
    const c = hubRoot.candidates({ HOME: '/Users/alex' });
    assert.strictEqual(c[0], '/Users/alex/Hub');
  }
});

test('probing finds the Hub in the home folder of an injected environment', (t) => {
  const home = plainDir();
  const mine = markHub(path.join(home, 'Hub'));
  const env = { HOME: home, USERPROFILE: home };
  const first = hubRoot.candidates(env).find((c) => hubRoot.isHub(c));
  if (first && path.resolve(first) !== path.resolve(mine)) {
    t.skip(`this computer has a Hub at ${first}, which is probed before the home folder`);
    return;
  }
  const r = hubRoot.findHubRoot({ env, from: plainDir(), fromOnly: true });
  assert.strictEqual(r.root, path.resolve(mine));
  assert.match(r.how, /^found at /);
});

test('readHub reads the marker, byte-order mark or not, and gives null when there is none', () => {
  const hub = makeHub();
  fs.writeFileSync(path.join(hub, '.hub', 'hub.json'), '\uFEFF{"machine":"MINI","code_zone":"20-Coding/Active"}');
  assert.strictEqual(hubRoot.readHub(hub).machine, 'MINI');
  assert.strictEqual(hubRoot.readHub(plainDir()), null);
});

test('the code zone is the one hub.json records', () => {
  const hub = makeHub({ code_zone: '20-Coding/Active' }, ['20-Coding/Active', '20-Coding/Projects']);
  assert.strictEqual(hubRoot.codeZone(hub), path.join(hub, '20-Coding', 'Active'));
});

test('a recorded code zone that is not there falls back to Projects, then to Active', () => {
  const projects = makeHub({ code_zone: 'Code/Gone' }, ['20-Coding/Projects', '20-Coding/Active']);
  assert.strictEqual(hubRoot.codeZone(projects), path.join(projects, '20-Coding', 'Projects'));
  const active = makeHub({}, ['20-Coding/Active']);
  assert.strictEqual(hubRoot.codeZone(active), path.join(active, '20-Coding', 'Active'));
});

test('no code zone at all throws, naming every place it looked', () => {
  const hub = makeHub({ code_zone: '20-Coding/Projects' });
  assert.throws(() => hubRoot.codeZone(hub),
    (e) => /No code zone/.test(e.message) && e.message.includes(path.join(hub, '20-Coding', 'Active')));
});

test('projectDir finds a project in either code zone spelling, and throws when it is in neither', () => {
  const hub = makeHub({ code_zone: '20-Coding/Projects' }, ['20-Coding/Projects', '20-Coding/Active/garden-planner']);
  assert.strictEqual(hubRoot.projectDir(hub, 'garden-planner'), path.join(hub, '20-Coding', 'Active', 'garden-planner'));
  assert.throws(() => hubRoot.projectDir(hub, 'seed-saver'), /not in this Hub's code zone/);
});
