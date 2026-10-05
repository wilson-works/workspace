'use strict';

/**
 * video-seed.test.js — the invented working day the videos are filmed in (video/capture/seed.js).
 *
 * Seeds the three sandbox computers into a temp folder (the DESK's settings there too, never the
 * repo root), then reads the DESK floor with the office's own reader and view, the way the page
 * would see it. Checks: every session shows with its title and the right state; the owner
 * questions pass the plain-English gate; nothing the page shows carries this computer's own name,
 * user name or the sandbox folder; a settings file a person wrote is never replaced; session ids
 * are stable from one seed to the next.
 *
 * mesh.js reads its machines once, when it loads, so the reader is required only after the seed
 * has written the DESK's settings and WORKSPACE_CONFIG points at them.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'video-seed-'));
const DESK_CFG = path.join(BASE, 'desk.workspace.config.json');
process.env.WORKSPACE_CONFIG = DESK_CFG;
process.env.WORKSPACE_MACHINE = 'DESK';

const { seed, uuidOf, MARK } = require('../video/capture/seed');
const { sandboxes } = require('../video/capture/sandbox');

const first = seed(BASE, null, { deskConfig: DESK_CFG });
const desk = sandboxes(BASE, { deskConfig: DESK_CFG }).find((s) => s.name === 'DESK');

test('the seed writes all three computers', () => {
  assert.strictEqual(first.ok, true, first.error);
  assert.deepStrictEqual(Object.keys(first.computers).sort(), ['DESK', 'LAPTOP', 'MINI']);
  assert.strictEqual(JSON.parse(fs.readFileSync(DESK_CFG, 'utf8'))._, MARK);
});

test('the DESK floor reads every session with its title and state', () => {
  const { read } = require('../src/server/reader');
  const state = read(desk.office, { officeHome: desk.office, projects: path.join(desk.claude, 'projects') });
  const byTitle = Object.fromEntries(state.desks.map((d) => [d.title, d.state]));
  assert.strictEqual(byTitle['Plan the frost dates feature'], 'working');
  assert.strictEqual(byTitle['Gate review: frost dates'], 'working');
  assert.strictEqual(byTitle['Iris: research brief on raised-bed soil'], 'working');
  assert.strictEqual(byTitle['Quill: draft the spring newsletter'], 'waiting');
  assert.strictEqual(byTitle['Sort the inbox into zones'], 'stale');
  const cedar = state.desks.find((d) => d.title === 'Plan the frost dates feature');
  assert.strictEqual(cedar.seats.length, 1, 'its helper is at the desk');
  assert.strictEqual(cedar.callsign.name, 'Cedar');
});

test('the owner questions pass the plain-English gate', () => {
  const Q = require('../src/server/questions');
  assert.strictEqual(Q.openQuestions(desk.office).length, 2);
});

test('nothing the page shows names this computer, its user or the sandbox folder', () => {
  const { read } = require('../src/server/reader');
  const { buildView } = require('../src/server/view');
  const state = read(desk.office, { officeHome: desk.office, projects: path.join(desk.claude, 'projects') });
  const shown = JSON.stringify(buildView(state, { machine: 'DESK', home: desk.office }).sessions).toLowerCase();
  const real = [os.hostname(), BASE, BASE.replace(/\\/g, '/')];
  try { real.push(os.userInfo().username); } catch (_) { /* no user info */ }
  for (const t of real.filter((x) => x && x.length >= 3)) {
    if (['desk', 'mini', 'laptop', 'alex'].includes(t.toLowerCase())) continue;
    assert.ok(!shown.includes(t.toLowerCase()), `the page would show "${t}"`);
  }
});

test('a settings file a person wrote is refused, not replaced', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'video-seed-own-'));
  const own = path.join(base, 'mine.json');
  fs.writeFileSync(own, '{"owner":{"name":"Someone"}}');
  const r = seed(base, 'DESK', { deskConfig: own });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.refused, true);
  assert.strictEqual(fs.readFileSync(own, 'utf8'), '{"owner":{"name":"Someone"}}');
});

test('session ids are stable from one seed to the next', () => {
  assert.strictEqual(uuidOf('DESK:Cedar'), uuidOf('DESK:Cedar'));
  assert.match(uuidOf('DESK:Cedar'), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  const again = seed(BASE, null, { deskConfig: DESK_CFG });
  assert.deepStrictEqual(again.computers.DESK.sessions.map((s) => s.id), first.computers.DESK.sessions.map((s) => s.id));
});
