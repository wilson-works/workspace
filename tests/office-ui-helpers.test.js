'use strict';

/**
 * office-ui-helpers.test.js — the page's plain helpers: a page reloads once when the office comes back on new code
 * (build-stamp.js, and the server's buildStamp); sheet parts fold and are remembered per part (sheet-folds.js); the
 * Team page lists your people with a status word (team-view.js).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const ui = (f) => import(pathToFileURL(path.join(__dirname, '..', 'src', 'ui', f)).href);

test('build stamp: the first stamp is kept; a different one reloads once; a missing one never does', async () => {
  const { createBuildWatch } = await ui('build-stamp.js');
  let n = 0;
  const see = createBuildWatch(() => { n += 1; });
  assert.strictEqual(see(null), false);
  assert.strictEqual(see('aaa'), false);
  assert.strictEqual(see('aaa'), false);
  assert.strictEqual(see('bbb'), true);
  assert.strictEqual(see('ccc'), false);
  assert.strictEqual(n, 1);
  const { buildStamp } = require('../src/server/server');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dist-'));
  assert.strictEqual(buildStamp(dir), null);
  fs.writeFileSync(path.join(dir, 'app.js'), 'one');
  const a = buildStamp(dir);
  fs.writeFileSync(path.join(dir, 'app.js'), 'two');
  assert.notStrictEqual(buildStamp(dir), a);
});

test('sheet folds: open until closed, remembered per part, and a broken store never throws', async () => {
  const { loadFolds, setFold, isOpen } = await ui('sheet-folds.js');
  const mem = new Map();
  const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  let f = loadFolds(store);
  assert.ok(isOpen(f, 'conversation'));
  f = setFold(store, f, 'conversation', false);
  f = setFold(store, f, 'working', true);
  assert.strictEqual(isOpen(loadFolds(store), 'conversation'), false);
  assert.strictEqual(isOpen(loadFolds(store), 'working'), true);
  const bad = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
  assert.deepStrictEqual(loadFolds(bad), {});
  assert.strictEqual(isOpen(setFold(bad, {}, 'helpers', false), 'helpers'), false);
});

test('your people: each person once, busiest session first, Working / Waiting / Free', async () => {
  const { peopleRows } = await ui('team-view.js');
  const people = [{ name: 'Sam', title: 'Front desk · Your own sessions' }, { name: 'Gavin', title: 'Engineering · Screens and pages' }, { name: 'Diana', title: 'Engineering · Data' }];
  const s = (id, person, state, last) => ({ machine: 'DESK', id, state, last_at: last, display: { person } });
  const rows = peopleRows(people, [s('1', 'Gavin', 'idle', 5), s('2', 'Gavin', 'working', 3), s('3', 'Sam', 'waiting', 9), s('4', 'Kai', 'idle', 1)]);
  assert.deepStrictEqual(rows.map((r) => [r.name, r.word, r.count]), [['Sam', 'Waiting', 1], ['Gavin', 'Working', 2], ['Diana', 'Free', 0], ['Kai', 'Free', 1]]);
  assert.strictEqual(rows[1].top.id, '2');
  assert.strictEqual(rows[1].last_at, 5);
  assert.strictEqual(rows[2].top, null);
});
