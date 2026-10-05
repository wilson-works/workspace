'use strict';

/**
 * video-seed.test.js — the invented working day the videos are filmed in (video/capture/seed.js).
 *
 * The seed fills computers that capture/install.js has already installed, so this first lays out
 * what the installer leaves in a temp folder: each computer's office settings, with the three
 * computers in them as "set up my WorkSpace" adds them. It then seeds, and reads the DESK floor with
 * the office's own reader and view, the way the page would see it. Checks: every session shows with
 * its title and the right state; the owner questions pass the plain-English gate; nothing the page
 * shows carries this computer's own name, user name or the sandbox folder; a computer that is not
 * installed is refused and nothing is written for it; the seed never touches the settings; session
 * ids are stable from one seed to the next.
 *
 * mesh.js reads its machines once, when it loads, so the reader is required only after the DESK's
 * settings are written and WORKSPACE_CONFIG points at them.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { WORLD, sandboxes } = require('../video/capture/sandbox');

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'video-seed-'));
const ALL = sandboxes(BASE);
const desk = ALL.find((s) => s.name === 'DESK');

// What the installer leaves on each computer: its office settings, in the installed workspace.
const settingsOf = (sb) => JSON.stringify({
  owner: { name: WORLD.person },
  machines: WORLD.computers.map((c) => ({ name: c.name, computer: c.name, hub: !!c.hub, callsigns: c.callsigns })),
  office: { port: sb.computer.office_port, home: sb.office },
}, null, 2);
for (const sb of ALL) {
  fs.mkdirSync(path.dirname(sb.config), { recursive: true });
  fs.writeFileSync(sb.config, settingsOf(sb));
}
process.env.WORKSPACE_CONFIG = desk.config;
process.env.WORKSPACE_MACHINE = 'DESK';

const { seed, uuidOf } = require('../video/capture/seed');

const first = seed(BASE, null);

test('the seed fills all three installed computers', () => {
  assert.strictEqual(first.ok, true, first.error);
  assert.deepStrictEqual(Object.keys(first.computers).sort(), ['DESK', 'LAPTOP', 'MINI']);
  assert.deepStrictEqual(first.computers.MINI.sessions.map((s) => s.callsign), ['Vega', 'Lyra']);
});

test('the seed never touches the office settings', () => {
  for (const sb of ALL) assert.strictEqual(fs.readFileSync(sb.config, 'utf8'), settingsOf(sb), sb.name);
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
  const real = [os.hostname(), BASE, BASE.replace(/\\/g, '/'), 'ws-fresh'];
  try { real.push(os.userInfo().username); } catch (_) { /* no user info */ }
  for (const t of real.filter((x) => x && x.length >= 3)) {
    if (['desk', 'mini', 'laptop', 'alex'].includes(t.toLowerCase())) continue;
    assert.ok(!shown.includes(t.toLowerCase()), `the page would show "${t}"`);
  }
});

test('a computer that is not installed is refused, and nothing is written for it', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'video-seed-bare-'));
  const r = seed(base, 'DESK');
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /not installed/);
  const bare = sandboxes(base).find((s) => s.name === 'DESK');
  assert.strictEqual(fs.existsSync(bare.office), false);
  assert.strictEqual(fs.existsSync(bare.claude), false);
});

test('session ids are stable from one seed to the next', () => {
  assert.strictEqual(uuidOf('DESK:Cedar'), uuidOf('DESK:Cedar'));
  assert.match(uuidOf('DESK:Cedar'), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  const again = seed(BASE, null);
  assert.deepStrictEqual(again.computers.DESK.sessions.map((s) => s.id), first.computers.DESK.sessions.map((s) => s.id));
});
