'use strict';

/**
 * care.test.js — care rounds (src/server/care.js): off without a care file or with only example.com placeholders;
 * due at the scheduled times; a failing page is one order in the office's own Site care project, closed when the
 * page works again; the shipped example lists no real site.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const care = require('../src/server/care');

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'care-'));
const cfgFile = (obj) => { const f = path.join(BASE, `care-${Math.random().toString(36).slice(2)}.json`); fs.writeFileSync(f, JSON.stringify(obj)); return f; };
const site = (url, extra) => Object.assign({ name: 'Shop', url }, extra);

test('off without a file, and the shipped example (example.com placeholders) never turns it on', () => {
  assert.strictEqual(care.load(path.join(BASE, 'none.json')).on, false);
  const ex = care.load(path.join(__dirname, '..', 'config', 'care.example.json'));
  assert.strictEqual(ex.on, false);
  assert.deepStrictEqual(ex.times, ['06:30', '13:00']);
  assert.strictEqual(care.twelve('06:30'), '6:30 AM');
  assert.strictEqual(care.twelve('13:00'), '1:00 PM');
});

test('due once a scheduled time has passed since the last round', () => {
  const c = care.load(cfgFile({ sites: [site('https://shop.test/')] }));
  assert.ok(c.on);
  const d = new Date(2026, 9, 19, 6, 40).getTime();
  assert.strictEqual(care.due(c, new Date(2026, 9, 18, 13, 5).getTime(), d), true);
  assert.strictEqual(care.due(c, new Date(2026, 9, 19, 6, 31).getTime(), d), false);
  assert.strictEqual(care.due(c, null, new Date(2026, 9, 19, 5, 0).getTime()), false);
});

test('a failing page is one Site care order; it closes when the page works again', async () => {
  const home = fs.mkdtempSync(path.join(BASE, 'home-'));
  const c = care.load(cfgFile({ sites: [site('https://shop.test/', { expect: 'Open today' }), site('https://book.test/', { name: 'Booking' })] }));
  let up = false;
  const fetchFn = async (url) => ({ status: url.includes('book') && !up ? 503 : 200, text: async () => (up ? 'We are Open today' : 'Closed') });
  await care.round(home, c, Date.now(), fetchFn);
  const steps = path.join(home, 'care', 'projects', 'site-care', 'steps');
  assert.strictEqual(fs.readdirSync(steps).length, 2, 'one order per failing page');
  await care.round(home, c, Date.now(), fetchFn);
  assert.strictEqual(fs.readdirSync(steps).length, 2, 'not filed twice');
  let st = care.status(home, c);
  assert.strictEqual(st.state, 'problem');
  assert.deepStrictEqual(st.failing.map((f) => f.name).sort(), ['Booking', 'Shop']);
  up = true;
  await care.round(home, c, Date.now(), fetchFn);
  assert.ok(!fs.existsSync(path.join(home, 'care', 'projects', 'site-care')), 'all closed: the project goes');
  st = care.status(home, c);
  assert.strictEqual(st.state, 'good');
});

test('the care orders show on the Work page as the Site care project', async () => {
  process.env.WORKSPACE_CONFIG = cfgFile({});
  const W = require('../src/server/work');
  const home = fs.mkdtempSync(path.join(BASE, 'home-'));
  const c = care.load(cfgFile({ sites: [site('https://down.test/')] }));
  await care.round(home, c, Date.now(), async () => ({ status: 500, text: async () => '' }));
  const p = W.list(home, Date.now(), []).projects.find((x) => x.key === 'site-care');
  assert.ok(p, 'listed');
  assert.strictEqual(p.boxes.new, 1);
  assert.match(p.kanban.todo.cards[0].label, /Fix Shop/);
});
