'use strict';

/**
 * callsigns.test.js — every session gets one name (.claude/hooks/callsign.js).
 * Every allocation test injects its clock, so "24 h" is a number, not a wait.
 *
 * The machines come from workspace.config.json, written here before any src
 * module loads: DESK (the hub) gets the trees pool, MINI stars, LAPTOP rivers.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CFG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'callsign-cfg-'));
process.env.WORKSPACE_CONFIG = path.join(CFG_DIR, 'workspace.config.json');
fs.writeFileSync(process.env.WORKSPACE_CONFIG, JSON.stringify({
  machines: [{ name: 'DESK', hub: true }, { name: 'MINI' }, { name: 'LAPTOP' }],
}));

const C = require('../.claude/hooks/callsign');
const config = require('../src/server/config');
const mesh = require('../src/server/mesh');
const { callsignOf } = require('../src/server/view');

const H = 3600 * 1000;
const T0 = Date.parse('2026-10-02T18:00:00Z');
const POOL = ['Vega', 'Rigel', 'Lyra'];
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'callsign-'));
// Every session is alive unless a test says otherwise.
const alive = (now) => () => now;
const give = (book, sid, now, extra) =>
  C.allocate(book, sid, Object.assign({ now, machine: 'MINI', pool: POOL, lastActive: alive(now) }, extra)).name;

test('three sessions get three different callsigns from the machine pool', () => {
  const book = {};
  const names = ['s1', 's2', 's3'].map((sid) => give(book, sid, T0));
  assert.deepStrictEqual(names, ['Vega', 'Rigel', 'Lyra']);
  assert.strictEqual(new Set(names).size, 3);
});

test('a released name is not reused within 24 h, and is after', () => {
  const book = {};
  give(book, 's1', T0); give(book, 's2', T0);
  C.release(book, 's1', T0 + 1 * H);
  const next = give(book, 's3', T0 + 2 * H);
  assert.notStrictEqual(next, 'Vega');
  assert.strictEqual(next, 'Lyra');
  // Pool exhausted inside the hold: a second round, still never a held name.
  assert.strictEqual(give(book, 's4', T0 + 3 * H), 'Vega 2');
  // 24 h after the release, Vega is free again.
  assert.strictEqual(give(book, 's5', T0 + 25 * H + 1), 'Vega');
});

test('a resumed session keeps its name, even after its SessionEnd', () => {
  const book = {};
  give(book, 's1', T0); give(book, 's2', T0);
  C.release(book, 's1', T0 + H);
  assert.strictEqual(give(book, 's1', T0 + 2 * H), 'Vega');
  assert.strictEqual(book.s1.released_at, null);
});

test('a session that went quiet for 24 h releases its name without a SessionEnd', () => {
  const book = {};
  give(book, 's1', T0);
  // s1's transcript last moved at T0; at T0+30h it is 30 h quiet -> released at T0+24h.
  const quiet = () => T0;
  const name = C.allocate(book, 's2', { now: T0 + 30 * H, machine: 'MINI', pool: POOL, lastActive: quiet }).name;
  assert.strictEqual(name, 'Rigel', 'released at T0+24h, so still inside its 24 h hold at T0+30h');
  assert.strictEqual(book.s1.released_at, new Date(T0 + 24 * H).toISOString());
  const later = C.allocate(book, 's3', { now: T0 + 48 * H + 1, machine: 'MINI', pool: POOL, lastActive: quiet }).name;
  assert.strictEqual(later, 'Vega');
});

test('the shipped pools (trees, stars, rivers) are disjoint, about 60 names each, and hold no duplicate', () => {
  const { pools } = C.loadConfig();
  const all = [];
  for (const p of config.POOLS) {
    assert.ok(Array.isArray(pools[p]), `config/callsigns.json has a ${p} pool`);
    assert.ok(pools[p].length >= 55 && pools[p].length <= 65, `${p} has ${pools[p].length}`);
    all.push(...pools[p]);
  }
  assert.strictEqual(new Set(all.map((n) => n.toLowerCase())).size, all.length);
});

test('each machine draws from its own pool: the first trees, the second stars, the third rivers', () => {
  assert.deepStrictEqual(['DESK', 'MINI', 'LAPTOP'].map((m) => config.poolOf(m)), ['trees', 'stars', 'rivers']);
  assert.strictEqual(config.poolOf('TABLET'), null, 'a machine the config does not name has no pool');
});

test('the launch seat comes from WORKSPACE_SEAT', () => {
  assert.strictEqual(C.seatFromEnv({ WORKSPACE_SEAT: 'gate' }), 'gate');
  assert.strictEqual(C.seatFromEnv({ WORKSPACE_SEAT: '  cto-james ' }), 'cto-james');
  assert.strictEqual(C.seatFromEnv({ WORKSPACE_SEAT: 'x'.repeat(60) }).length, 40);
  assert.strictEqual(C.seatFromEnv({}), null);
});

test('the hook tells a new session its callsign and writes the book', () => {
  const home = tmp();
  const hook = path.join(__dirname, '..', '.claude', 'hooks', 'office-hook.js');
  const payload = { hook_event_name: 'SessionStart', session_id: '11111111-2222-3333-4444-555555555555', cwd: home, source: 'startup' };
  const env = Object.assign({}, process.env, { WORKSPACE_HOME: home, WORKSPACE_MACHINE: 'MINI', WORKSPACE_SEAT: 'gate' });
  const r = spawnSync(process.execPath, [hook, 'SessionStart'], { input: JSON.stringify(payload), encoding: 'utf8', env });
  assert.strictEqual(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(out.hookSpecificOutput.additionalContext, /^Your office callsign is Vega \(MINI\)\. .*\/rename Vega-MINI\.$/);
  const book = JSON.parse(fs.readFileSync(path.join(home, 'callsigns.json'), 'utf8'));
  assert.strictEqual(book[payload.session_id].name, 'Vega');
  assert.strictEqual(book[payload.session_id].machine, 'MINI');
  assert.strictEqual(book[payload.session_id].seat, 'gate');

  const end = spawnSync(process.execPath, [hook, 'SessionEnd'], {
    input: JSON.stringify(Object.assign({}, payload, { hook_event_name: 'SessionEnd' })), encoding: 'utf8', env,
  });
  assert.strictEqual(end.status, 0);
  assert.strictEqual(end.stdout, '');
  const after = JSON.parse(fs.readFileSync(path.join(home, 'callsigns.json'), 'utf8'));
  assert.ok(after[payload.session_id].released_at);
});

test('a LAPTOP session reaches the hub wall under its river name, via the mesh', () => {
  const home = tmp();
  const sid = '97a7ad02-0e31-44cd-bf62-c479ddeb854c';
  const now = Date.now();
  assert.ok(C.loadConfig().pools[config.poolOf('LAPTOP')].includes('Brazos'));
  const r = mesh.ingest(home, {
    machine: 'LAPTOP',
    desks: [{ id: sid, lane: 'workspace', state: 'working', last_event_age_ms: 1000, callsign: { name: 'Brazos', seat: null } }],
  }, now, 'DESK');
  assert.strictEqual(r.ok, true);
  const cfg = { mesh: { default_interval_ms: 15000, stale_multiple: 4, drop_multiple: 240 } };
  const remote = mesh.readRemote(home, now, cfg, 'DESK');
  const d = remote.desks.find((x) => x.id === sid);
  assert.deepStrictEqual(d.callsign, { name: 'Brazos', seat: null, machine: 'LAPTOP' });
  assert.strictEqual(callsignOf(d, 'LAPTOP', { run: null, lane: null }, 'workspace').label, 'Brazos · LAPTOP · workspace');
});

test('the hub drops a callsign that is not a pool-shaped name', () => {
  const d = mesh.sanitizeDesk({ id: '97a7ad02-0e31-44cd-bf62-c479ddeb854c', callsign: { name: '<script>x</script>' } });
  assert.strictEqual(d.callsign, null);
});

test('display: role from seat, run and lane, room; private work never shows its project', () => {
  const d = { callsign: { name: 'Vega', machine: 'MINI', seat: null } };
  assert.strictEqual(callsignOf(d, 'MINI', { run: '1', lane: 'b' }, 'workspace').label, 'Vega · MINI · run-1 lane B');
  assert.strictEqual(callsignOf(Object.assign({}, d, { callsign: { name: 'Vega', seat: 'E4' } }), 'MINI', { run: null, lane: null }, 'workspace').label, 'Vega · MINI · E4');
  assert.strictEqual(callsignOf(Object.assign({}, d, { client_work: true }), 'MINI', { run: null, lane: null }, 'acme books').label, 'Vega · MINI · private work');
  assert.strictEqual(callsignOf(d, 'MINI', { run: null, lane: null }, 'workspace').rename, 'Vega-MINI');
  assert.strictEqual(callsignOf({}, 'MINI', { run: null, lane: null }, 'workspace'), null);
});
