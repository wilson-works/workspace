'use strict';

/**
 * avatars.test.js — every live session gets its own emblem (src/server/avatars.js).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = require('../src/server/avatars');
const EMBLEMS = require('../src/ui/avatars/emblems.json');
const FRAMES = require('../src/ui/avatars/frames.json');
const ICONS = require('../src/ui/avatars/icons.json');

const NOW = Date.parse('2026-10-02T23:00:00Z');
const IDS = A.emblemIds([]);
const sid = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const sess = (i, name, machine) => ({ id: sid(i), machine: machine || 'MINI', callsign: name ? { name } : null });

test('the port carries 103 emblems, and every emblem icon and frame it names exists', () => {
  assert.strictEqual(Object.keys(EMBLEMS).length, 103);
  for (const [id, e] of Object.entries(EMBLEMS)) {
    assert.ok(ICONS[e.icon] && ICONS[e.icon].duotone, `${id}: no duotone ${e.icon}`);
    if (e.underlay) assert.ok(ICONS[e.underlay] && ICONS[e.underlay].fill, `${id}: no fill ${e.underlay}`);
  }
  const cfg = A.loadConfig();
  for (const f of ['opus', 'fable', 'sonnet', 'haiku', 'unknown']) assert.ok(FRAMES[cfg.family_frames[f]], `no frame for ${f}`);
});

test('103 simulated live sessions get 103 different emblems', () => {
  const sessions = Array.from({ length: 103 }, (_, i) => sess(i, `Name${i}`));
  const { map } = A.assign(sessions, {}, { now: NOW, ids: IDS });
  const emblems = [...map.values()].map((a) => a.emblem);
  assert.strictEqual(new Set(emblems).size, 103);
  assert.ok([...map.values()].every((a) => a.variant === 1));
});

test('the 104th live session shares its hashed emblem with a second ring (variant 2)', () => {
  const sessions = Array.from({ length: 104 }, (_, i) => sess(i, `Name${i}`));
  const { map } = A.assign(sessions, {}, { now: NOW, ids: IDS });
  const variants = [...map.values()].filter((a) => a.variant === 2);
  assert.strictEqual(variants.length, 1);
  assert.strictEqual(new Set([...map.values()].map((a) => a.emblem)).size, 103);
});

test('emblem = hash(callsign) when free, and the next free one when another live session holds it', () => {
  const a = sess(1, 'Vega');
  const first = A.assign([a], {}, { now: NOW, ids: IDS }).map.get(`MINI:${sid(1)}`);
  assert.strictEqual(first.emblem, IDS[A.hash('Vega') % IDS.length]);
  // A second session whose callsign hashes to the same emblem probes on.
  const b = sess(2, 'Vega');
  const book = {};
  const { map } = A.assign([a, b], book, { now: NOW, ids: IDS });
  assert.notStrictEqual(map.get(`MINI:${sid(1)}`).emblem, map.get(`MINI:${sid(2)}`).emblem);
});

test('an avatar is stable for the session life, even when sessions come and go around it', () => {
  const book = {};
  const s = [sess(1, 'Vega'), sess(2, 'Rigel'), sess(3, 'Lyra')];
  const before = A.assign(s, book, { now: NOW, ids: IDS }).map.get(`MINI:${sid(2)}`).emblem;
  const after = A.assign([s[1], sess(4, 'Deneb'), sess(5, 'Vega 2')], book, { now: NOW + 60000, ids: IDS }).map.get(`MINI:${sid(2)}`).emblem;
  assert.strictEqual(after, before);
});

test('unique across machines: the same callsign on two machines still gets two emblems', () => {
  const { map } = A.assign([sess(1, 'Vega', 'MINI'), sess(1, 'Vega', 'LAPTOP')], {}, { now: NOW, ids: IDS });
  assert.notStrictEqual(map.get(`MINI:${sid(1)}`).emblem, map.get(`LAPTOP:${sid(1)}`).emblem);
});

test('a spoke follows the hub: pinned choices win over its own hash', () => {
  const key = `LAPTOP:${sid(7)}`;
  const { map } = A.assign([sess(7, 'Brazos', 'LAPTOP')], {}, { now: NOW, ids: IDS, pinned: { [key]: { emblem: IDS[5], variant: 1 } } });
  assert.strictEqual(map.get(key).emblem, IDS[5]);
});

test('retired emblems are never handed out', () => {
  const retired = IDS.slice(0, 100);
  const ids = A.emblemIds(retired);
  assert.strictEqual(ids.length, 3);
  const { map } = A.assign(Array.from({ length: 3 }, (_, i) => sess(i, `N${i}`)), {}, { now: NOW, ids });
  for (const a of map.values()) assert.ok(!retired.includes(a.emblem));
});

test('apply() frames by model family and the hub hands a spoke its own choices only', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'avatars-'));
  const sessions = [
    Object.assign(sess(1, 'Vega'), { family: 'opus' }),
    Object.assign(sess(2, 'Brazos', 'LAPTOP'), { family: 'haiku' }),
  ];
  A.apply(home, sessions, NOW);
  const cfg = A.loadConfig();
  assert.strictEqual(sessions[0].avatar.frame, cfg.family_frames.opus);
  assert.strictEqual(sessions[1].avatar.frame, cfg.family_frames.haiku);
  const forLaptop = A.forMachine(home, 'LAPTOP', NOW);
  assert.deepStrictEqual(Object.keys(forLaptop), [`LAPTOP:${sid(2)}`]);
  // The spoke stores the hub's reply and its own wall then agrees.
  const spoke = fs.mkdtempSync(path.join(os.tmpdir(), 'avatars-spoke-'));
  A.takeFromHub(spoke, forLaptop, NOW);
  const local = [Object.assign(sess(2, 'Brazos', 'LAPTOP'), { family: 'haiku' })];
  A.apply(spoke, local, NOW + 1000);
  assert.strictEqual(local[0].avatar.emblem, sessions[1].avatar.emblem);
});
