'use strict';

/**
 * route.test.js — the office's hash routes (src/ui/route.js).
 * Every listed route parses to its view and formats back to the same address,
 * the old /?questions and /?work links land on their routes, and a view opened
 * straight from a link has a parent for its Back arrow.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../src/ui/route.js');

test('every listed route round-trips', async () => {
  const R = await load();
  const cases = [
    ['#/floor/all', { tab: 'floor', machine: 'all', session: null }],
    ['#/floor/MINI', { tab: 'floor', machine: 'MINI', session: null }],
    ['#/floor/DESK/DESK%3Aabc-123', { tab: 'floor', machine: 'DESK', session: 'DESK:abc-123' }],
    ['#/work', { tab: 'work', project: null }],
    ['#/work/getting-started', { tab: 'work', project: 'getting-started' }],
    ['#/step/getting-started/GS-01', { tab: 'work', project: 'getting-started', step: 'GS-01' }],
    ['#/agents', { tab: 'agents' }],
    ['#/questions', { tab: 'questions' }],
    ['#/chat', { tab: 'chat' }],
  ];
  for (const [hash, want] of cases) {
    assert.deepEqual(R.parseRoute(hash), want, hash);
    assert.equal(R.formatRoute(R.parseRoute(hash)), hash, hash);
  }
});

test('a step route without a step is its project, and without a project is the Work page', async () => {
  const R = await load();
  assert.deepEqual(R.parseRoute('#/step/getting-started'), { tab: 'work', project: 'getting-started' });
  assert.deepEqual(R.parseRoute('#/step'), { tab: 'work' });
});

test('an unknown or empty hash is not a route, and the run and order routes are gone', async () => {
  const R = await load();
  assert.equal(R.parseRoute(''), null);
  assert.equal(R.parseRoute('#/nowhere'), null);
  assert.equal(R.parseRoute('#top'), null);
  assert.equal(R.parseRoute('#/run/RUN0412'), null);
  assert.equal(R.parseRoute('#/order/WO-x'), null);
});

test('the old links land on the new routes and leave the query', async () => {
  const R = await load();
  assert.deepEqual(R.legacyRoute('http://127.0.0.1:4316/?questions'), { route: { tab: 'questions' }, path: '/' });
  assert.deepEqual(R.legacyRoute('http://127.0.0.1:4316/?work'), { route: { tab: 'work' }, path: '/' });
  assert.deepEqual(R.legacyRoute('http://127.0.0.1:4316/?work&x=1'), { route: { tab: 'work' }, path: '/?x=1' });
  assert.equal(R.legacyRoute('http://127.0.0.1:4316/#/work'), null);
  assert.equal(R.legacyRoute('http://127.0.0.1:4316/?run'), null);
});

test('a deep-linked view goes Back one step up', async () => {
  const R = await load();
  assert.deepEqual(R.parentRoute(R.parseRoute('#/floor/DESK/DESK%3Aabc'), 'all'), { tab: 'floor', machine: 'DESK' });
  assert.deepEqual(R.parentRoute(R.parseRoute('#/step/getting-started/GS-01'), 'all'), { tab: 'work', project: 'getting-started' });
  assert.deepEqual(R.parentRoute(R.parseRoute('#/work/getting-started'), 'all'), { tab: 'work' });
  assert.deepEqual(R.parentRoute(R.parseRoute('#/questions'), 'MINI'), { tab: 'floor', machine: 'MINI' });
});
