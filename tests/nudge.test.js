'use strict';

/**
 * nudge.test.js — the opt-in idle nudge (src/server/nudge.js). One note per idle window, at
 * most wake.nudge_max_per_hour an hour, and never to a session that is busy,
 * armed, waiting on the owner or on a permission prompt.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const nudge = require('../src/server/nudge');

const SID = '0c9a2f41-3b7e-4d55-8a1c-6e2b9f0d1a77';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nudge-'));
const cfg = {
  alarms: { lane_idle_wall_ms: 480000 },
  wake: { nudge_text: 'The office sees you idle with nothing armed. Check your run\'s next row, or reply IDLE-OK.', nudge_max_per_hour: 3 },
};
const T0 = Date.UTC(2026, 9, 2, 20, 0, 0);
const MIN = 60000;

const seat = (over) => Object.assign({
  id: SID, machine: 'MINI', deliverable: true, run: '1', state: 'idle', waiting: null, helpers: [], last_at: T0,
}, over || {});
const ctx = (now, over) => Object.assign({ now, cfg, machine: 'MINI', askingOwner: new Set(), onPermission: new Set(), live: () => true }, over || {});
const inboxLines = (home) => {
  try { return fs.readFileSync(path.join(home, 'inbox', `${SID}.jsonl`), 'utf8').split('\n').filter(Boolean).map(JSON.parse); } catch (_) { return []; }
};

test('firing control: four idle windows inside one hour send exactly three nudges', () => {
  const home = tmp();
  let sent = 0;
  // Each window: the session wakes at last_at, goes quiet, and is idle 9 min later.
  for (let i = 0; i < 4; i++) {
    const lastAt = T0 + i * 12 * MIN;
    sent += nudge.check(home, [seat({ last_at: lastAt })], ctx(lastAt + 9 * MIN)).length;
  }
  assert.strictEqual(sent, 3);
  const lines = inboxLines(home);
  assert.strictEqual(lines.length, 3);
  assert.ok(lines.every((n) => n.from === 'office' && n.text === cfg.wake.nudge_text));
});

test('the cap is per rolling hour: once the first nudge is an hour old, the next window is nudged', () => {
  const home = tmp();
  for (let i = 0; i < 3; i++) nudge.check(home, [seat({ last_at: T0 + i * 12 * MIN })], ctx(T0 + i * 12 * MIN + 9 * MIN));
  const later = T0 + 70 * MIN; // the nudge at T0+9 min has left the hour
  assert.strictEqual(nudge.check(home, [seat({ last_at: later - 9 * MIN })], ctx(later)).length, 1);
});

test('one nudge per idle window, however many heartbeats look at it', () => {
  const home = tmp();
  let sent = 0;
  for (let t = 9; t < 40; t++) sent += nudge.check(home, [seat()], ctx(T0 + t * MIN)).length;
  assert.strictEqual(sent, 1);
});

test('not before lane_idle_wall_ms', () => {
  assert.deepStrictEqual(nudge.check(tmp(), [seat()], ctx(T0 + 7 * MIN)), []);
});

test('never to a busy, armed, helped, asking or permission-blocked session, or one with no waiter', () => {
  const now = T0 + 9 * MIN;
  const cases = [
    [seat({ state: 'working' }), ctx(now)],
    [seat({ state: 'waiting' }), ctx(now)],
    [seat({ waiting: { kind: 'wakeup', since: T0 } }), ctx(now)],
    [seat({ helpers: [{ id: 'h1' }] }), ctx(now)],
    [seat(), ctx(now, { askingOwner: new Set([SID]) })],
    [seat(), ctx(now, { onPermission: new Set([SID]) })],
    [seat(), ctx(now, { live: () => false })],
    [seat({ machine: 'DESK' }), ctx(now)],
    [seat({ deliverable: false }), ctx(now)],
  ];
  for (const [s, c] of cases) assert.deepStrictEqual(nudge.check(tmp(), [s], c), [], JSON.stringify(s));
});

test('Keep awake: on by default for run seats, off for plain chats, and the owner can flip either', () => {
  const now = T0 + 9 * MIN;
  const plain = tmp();
  assert.deepStrictEqual(nudge.check(plain, [seat({ run: null })], ctx(now)), []);
  assert.ok(nudge.setKeepAwake(plain, SID, true).ok);
  assert.deepStrictEqual(nudge.check(plain, [seat({ run: null })], ctx(now)), [SID]);

  const run = tmp();
  assert.ok(nudge.setKeepAwake(run, SID, false).ok);
  assert.deepStrictEqual(nudge.check(run, [seat()], ctx(now)), []);
  assert.strictEqual(nudge.status(run, SID, true).keep_awake, false);
});

test('status reports the last nudge time for the desk bell', () => {
  const home = tmp();
  nudge.check(home, [seat()], ctx(T0 + 9 * MIN));
  assert.strictEqual(nudge.status(home, SID, true).nudged_at, T0 + 9 * MIN);
  assert.strictEqual(nudge.status(home, SID, true).live, false, 'no pid file, no waiter');
});

test('setKeepAwake refuses a bad session id', () => {
  assert.strictEqual(nudge.setKeepAwake(tmp(), '../etc', true).ok, false);
});
