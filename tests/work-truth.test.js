'use strict';

/**
 * work-truth.test.js — the eight boxes and the truth rules (src/server/work.js): an order in Build is Running only
 * while a live session is in its project, Staged otherwise, and back in the queue (New) when nobody has been on it
 * for three hours. todo/doing/done still mean New/Build/Shipped. Plan today (plan.js) drafts from the same list.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'truth-'));
const FOLDER = path.join(BASE, 'projects');
process.env.WORKSPACE_CONFIG = path.join(BASE, 'workspace.config.json');
fs.writeFileSync(process.env.WORKSPACE_CONFIG, JSON.stringify({ work_folders: [FOLDER] }));

const P = path.join(FOLDER, 'tt-shop');
fs.mkdirSync(path.join(P, 'steps'), { recursive: true });
fs.writeFileSync(path.join(P, 'PROJECT.md'), '---\nname: Tt shop\nkind: project\n---\nA shop.\n');
fs.writeFileSync(path.join(P, 'steps', '01-a.md'), '---\nid: T-01\ntitle: Cart page\n---\nBody.\n');
fs.writeFileSync(path.join(P, 'steps', '02-b.md'), '---\nid: T-02\ntitle: Checkout\nstatus: ci/cd\n---\nBody.\n');
fs.writeFileSync(path.join(P, 'steps', '03-c.md'), '---\nid: T-03\ntitle: Receipts\n---\nBody.\n');

const W = require('../src/server/work');
const plan = require('../src/server/plan');

const NOW = Date.now();
const home = () => fs.mkdtempSync(path.join(BASE, 'home-'));
const shop = (v) => v.projects.find((p) => p.key === 'tt-shop');
const live = [{ machine: 'DESK', id: 'a', state: 'working', repo: 'tt shop', display: { name: 'Gavin', title: 'Engineering' } }];

test('stages: any spelling, the old three as aliases; a mark keeps its lane and its box', () => {
  assert.strictEqual(W.stageOf('CI/CD'), 'cicd');
  assert.strictEqual(W.stageOf('doing'), 'build');
  assert.strictEqual(W.stageOf('Done'), 'shipped');
  assert.strictEqual(W.stageOf('stalled'), null);
  const h = home();
  assert.deepStrictEqual(W.mark(h, 'tt-shop', 'T-03', 'review', 5), { ok: true, project: 'tt-shop', id: 'T-03', status: 'doing', stage: 'review' });
  const p = shop(W.list(h, NOW));
  assert.strictEqual(p.boxes.cicd, 1, 'a step file can start in any box');
  assert.strictEqual(p.boxes.review, 1);
  assert.strictEqual(p.counts.doing, 2);
});

test('Build is Running only with a live session in its project; Staged without one', () => {
  const h = home();
  W.mark(h, 'tt-shop', 'T-01', 'doing', NOW - 60000);
  const on = shop(W.list(h, NOW, live)).kanban.doing.cards.find((c) => c.id === 'T-01');
  assert.strictEqual(on.truth, 'running');
  assert.strictEqual(on.live_name, 'Gavin');
  const off = shop(W.list(h, NOW, [Object.assign({}, live[0], { state: 'idle' })])).kanban.doing.cards.find((c) => c.id === 'T-01');
  assert.strictEqual(off.truth, 'staged');
  assert.strictEqual(shop(W.list(h, NOW, [])).boxes.staged, 1);
  assert.strictEqual(shop(W.list(h, NOW)).kanban.doing.cards.find((c) => c.id === 'T-01').truth, null, 'no floor, no truth rules');
});

test('Build nobody has been on for three hours goes back to the queue as New: no stalled state', () => {
  const h = home();
  W.mark(h, 'tt-shop', 'T-01', 'build', NOW - W.STALE_MS - 1000);
  const p = shop(W.list(h, NOW, []));
  const c = p.kanban.todo.cards.find((x) => x.id === 'T-01');
  assert.ok(c, 'it is in To do');
  assert.strictEqual(c.stage, 'new');
  assert.strictEqual(c.truth, 'requeued');
  assert.strictEqual(p.boxes.build, 0);
  assert.ok(!JSON.stringify(p).toLowerCase().includes('stalled'));
  // With someone on it, it is Running however old the mark.
  assert.strictEqual(shop(W.list(h, NOW, live)).kanban.doing.cards[0].truth, 'running');
});

test('Plan today: staged and requeued work first, then the next order, ready to approve, and the next lesson', () => {
  const h = home();
  W.mark(h, 'tt-shop', 'T-01', 'build', NOW - W.STALE_MS - 1000);
  W.mark(h, 'tt-shop', 'T-03', 'ready', NOW);
  const d = plan.draft(h, NOW, [], [{ id: 'q1' }]);
  const kinds = d.items.map((x) => x.kind);
  assert.strictEqual(kinds[0], 'answer');
  assert.ok(d.items.some((x) => x.kind === 'again' && x.id === 'T-01' && /Cart page/.test(x.brief)));
  assert.ok(d.items.some((x) => x.kind === 'decide' && x.id === 'T-03'));
  assert.ok(d.items.length <= plan.MAX);
  assert.strictEqual(new Set(d.items.filter((x) => x.id).map((x) => x.id)).size, d.items.filter((x) => x.id).length, 'one line per order');
  assert.deepStrictEqual(plan.read(h, NOW), d, 'kept for the day');
  assert.strictEqual(plan.read(h, NOW + 3 * 86400000), null, 'not another day');
});
