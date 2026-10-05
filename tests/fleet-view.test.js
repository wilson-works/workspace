'use strict';

/**
 * fleet-view.test.js — src/server/fleet.js, the office's read of a fleet repo (/api/fleet).
 *
 * Covers: no fleet means { configured: false }; machines with their heartbeats (age, late after a
 * day and a bit); the board's counts and at most 10 titles per column; open and taken handoffs; the
 * latest 30 comms notes, newest first; the 64 KB bound (a bigger item is counted, not read; of a
 * bigger comms file only the end is read); no absolute path in what it hands back; selfIn by computer.
 * Hermetic: a hand-made fleet folder in a temp dir, no git, no server.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const F = require('../src/server/fleet');

const NOW = Date.parse('2026-10-05T17:00:00Z');
const H = 3600 * 1000;

function put(dir, rel, text) {
  const f = path.join(dir, ...rel.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
}
const md = (front, body) => `---\n${Object.entries(front).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n${body || ''}\n`;

function makeFleet() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-view-'));
  put(dir, 'fleet.json', JSON.stringify({ format: 1, created: '2026-10-05' }));
  put(dir, 'machines/DESK.json', JSON.stringify({ name: 'DESK', role: 'command', computer: 'DESK-PC', os: 'win32', hub_root: 'C:\\Users\\alex\\Hub', code_zone: '20-Coding/Projects', office_hub: true, joined: '2026-10-05', status: 'active' }));
  put(dir, 'machines/MINI.json', JSON.stringify({ name: 'MINI', role: 'builder', computer: 'MINI-PC', os: 'win32', code_zone: '20-Coding/Active', office_hub: false, joined: '2026-10-05', status: 'active' }));
  put(dir, 'machines/LAPTOP.json', JSON.stringify({ name: 'LAPTOP', role: 'mobile', computer: 'LAPTOP-PC', status: 'left', left: '2026-10-04' }));
  put(dir, 'machines/BROKEN.json', '{ not json');
  put(dir, 'heartbeats/DESK.json', JSON.stringify({ machine: 'DESK', at: new Date(NOW - 2 * 60000).toISOString(), last_sync: { result: 'ok' }, handoffs_waiting: 0, handoffs_open: 1, board: { backlog: 12, doing: 1, done: 0, archive: 0 }, office: 'up' }));
  put(dir, 'heartbeats/MINI.json', JSON.stringify({ machine: 'MINI', at: new Date(NOW - 30 * H).toISOString(), last_sync: { result: 'dirty' }, board: {}, office: 'down' }));
  for (let i = 1; i <= 12; i += 1) {
    const n = String(i).padStart(2, '0');
    put(dir, `board/backlog/WO-202610${n}-task-${n}.md`, md({ id: `WO-202610${n}-task-${n}`, title: `Task ${n}`, for: 'MINI', filed_by: 'DESK' }, `# Task ${n}`));
  }
  put(dir, 'board/doing/WO-20261001-no-title.md', md({ id: 'WO-20261001-no-title', claimed_by: 'MINI' }, '# From the heading'));
  put(dir, 'board/done/WO-20261002-huge.md', md({ title: 'Never read' }, 'x'.repeat(70 * 1024)));
  put(dir, 'board/archive/.gitkeep', '');
  put(dir, 'handoffs/open/HO-20261005-1000-DESK-tips.md', md({ id: 'HO-20261005-1000-DESK-tips', from: 'DESK', to: 'MINI', created: '"2026-10-05 10:00 CDT"', status: 'open', repo: 'demo-app', branch: 'feature/tips' }, '# Finish the tip buttons'));
  put(dir, 'handoffs/taken/HO-20261005-0900-MINI-review.md', md({ id: 'HO-20261005-0900-MINI-review', from: 'MINI', to: 'DESK', created: '"2026-10-05 09:00 CDT"', status: 'taken', taken_by: 'DESK', taken_at: '"2026-10-05 09:30 CDT"' }, '# Review the receipt'));
  put(dir, 'handoffs/done/HO-20261004-0900-DESK-old.md', md({ from: 'DESK', to: 'MINI' }, '# Old'));
  let desk = '# DESK: comms\n\nNotes from DESK.\n';
  for (let i = 0; i < 20; i += 1) desk += `\n## 2026-10-04 ${String(i).padStart(2, '0')}:00 CDT\n\nDesk note ${i}.\n`;
  put(dir, 'comms/DESK.md', desk);
  let mini = '# MINI: comms\n';
  for (let i = 0; i < 20; i += 1) mini += `\n## 2026-10-05 ${String(i).padStart(2, '0')}:30 CDT\n\nMini note ${i}.${i === 19 ? ` ${'long '.repeat(200)}` : ''}\n`;
  put(dir, 'comms/MINI.md', mini);
  return dir;
}

test('no fleet, or not a fleet folder: { configured: false }', () => {
  assert.deepStrictEqual(F.fleetView(null, 'DESK'), { configured: false });
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-view-empty-'));
  assert.deepStrictEqual(F.fleetView(empty, 'DESK'), { configured: false });
  assert.deepStrictEqual(F.registeredMachines(empty), []);
});

test('the computers, with their heartbeats; one that left stays listed as left; a broken file is skipped', () => {
  const dir = makeFleet();
  const v = F.fleetView(dir, 'DESK', { now: NOW });
  assert.strictEqual(v.configured, true);
  assert.deepStrictEqual(v.machines.map((m) => m.name), ['DESK', 'LAPTOP', 'MINI']);
  const desk = v.machines.find((m) => m.name === 'DESK');
  assert.strictEqual(desk.self, true);
  assert.strictEqual(desk.office_hub, true);
  assert.strictEqual(desk.heartbeat.age_ms, 2 * 60000);
  assert.strictEqual(desk.heartbeat.ok, true);
  assert.strictEqual(desk.heartbeat.office, 'up');
  const mini = v.machines.find((m) => m.name === 'MINI');
  assert.strictEqual(mini.heartbeat.ok, false, 'thirty hours is late for a daily sync');
  assert.strictEqual(mini.heartbeat.previous, 'dirty');
  assert.strictEqual(mini.waiting, 1, 'one open handoff is for MINI');
  assert.strictEqual(v.machines.find((m) => m.name === 'LAPTOP').status, 'left');
  assert.strictEqual(v.machines.find((m) => m.name === 'LAPTOP').heartbeat, null);
});

test('the board: every column counted, at most 10 titles read, a title from the heading when there is no title line', () => {
  const dir = makeFleet();
  const v = F.fleetView(dir, 'DESK', { now: NOW });
  assert.strictEqual(v.board.backlog.count, 12);
  assert.strictEqual(v.board.backlog.items.length, 10);
  assert.strictEqual(v.board.backlog.items[0].title, 'Task 01', 'the backlog reads oldest first');
  assert.strictEqual(v.board.backlog.items[0].for, 'MINI');
  assert.strictEqual(v.board.doing.items[0].title, 'From the heading');
  assert.strictEqual(v.board.doing.items[0].claimed_by, 'MINI');
  assert.strictEqual(v.board.archive.count, 0, '.gitkeep is not a work order');
});

test('a file over 64 KB is counted but never read', () => {
  const dir = makeFleet();
  const done = F.fleetView(dir, 'DESK', { now: NOW }).board.done;
  assert.strictEqual(done.count, 1);
  assert.strictEqual(done.items[0].title, 'WO-20261002-huge', 'the id stands in for a title it did not read');
});

test('handoffs: open and taken with who and when, done only counted', () => {
  const v = F.fleetView(makeFleet(), 'DESK', { now: NOW });
  assert.strictEqual(v.handoffs.open.length, 1);
  const o = v.handoffs.open[0];
  assert.deepStrictEqual([o.id, o.from, o.to, o.title, o.created, o.repo, o.branch],
    ['HO-20261005-1000-DESK-tips', 'DESK', 'MINI', 'Finish the tip buttons', '2026-10-05 10:00 CDT', 'demo-app', 'feature/tips']);
  const t = v.handoffs.taken[0];
  assert.deepStrictEqual([t.title, t.taken_by, t.taken_at], ['Review the receipt', 'DESK', '2026-10-05 09:30 CDT']);
  assert.strictEqual(v.handoffs.done_count, 1);
});

test('comms: the latest 30 notes across computers, newest first, long text cut', () => {
  const v = F.fleetView(makeFleet(), 'DESK', { now: NOW });
  assert.strictEqual(v.comms.length, 30);
  assert.deepStrictEqual([v.comms[0].machine, v.comms[0].when], ['MINI', '2026-10-05 19:30 CDT']);
  assert.ok(v.comms[0].text.length <= 601 && v.comms[0].text.endsWith('…'));
  const times = v.comms.map((c) => c.at);
  assert.deepStrictEqual(times, times.slice().sort((a, b) => b - a));
  assert.strictEqual(v.comms.filter((c) => c.machine === 'DESK').length, 10, 'the 10 newest of DESK\'s 20');
});

test('of a comms file over 64 KB only the end is read', () => {
  const dir = makeFleet();
  let big = '# MINI: comms\n\n## 2026-01-01 08:00 CDT\n\nThe very first note.\n';
  for (let i = 0; i < 900; i += 1) big += `\n## 2026-10-05 10:${String(i % 60).padStart(2, '0')} CDT\n\nFiller ${i} ${'x'.repeat(80)}\n`;
  put(dir, 'comms/MINI.md', big);
  assert.ok(Buffer.byteLength(big) > 64 * 1024);
  const v = F.fleetView(dir, 'DESK', { now: NOW });
  assert.ok(!v.comms.some((c) => c.text.includes('The very first note')), 'the start of the file was never read');
  assert.ok(v.comms.some((c) => c.text.startsWith('Filler 899')));
});

test('no absolute path is handed back (the view goes to the phone)', () => {
  const dir = makeFleet();
  const json = JSON.stringify(F.fleetView(dir, 'DESK', { now: NOW }));
  assert.ok(!json.includes(dir) && !json.includes(dir.replace(/\\/g, '\\\\')), 'the repo folder');
  assert.ok(!json.includes('alex\\\\Hub') && !json.includes('hub_root'), 'a computer\'s Hub folder');
});

test('a file that links outside the repo is not read', (t) => {
  const dir = makeFleet();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-view-outside-'));
  fs.writeFileSync(path.join(outside, 'EVIL.json'), JSON.stringify({ name: 'EVIL', role: 'command' }));
  try { fs.symlinkSync(path.join(outside, 'EVIL.json'), path.join(dir, 'machines', 'EVIL.json')); } catch (_) {
    t.skip('this computer does not allow links here');
    return;
  }
  assert.ok(!F.registeredMachines(dir).some((m) => m.name === 'EVIL'));
});

test('selfIn: this computer\'s fleet name comes from its computer name', () => {
  const dir = makeFleet();
  assert.strictEqual(F.selfIn(dir, 'FALLBACK', 'mini-pc'), 'MINI');
  assert.strictEqual(F.selfIn(dir, 'FALLBACK', 'LAPTOP-PC'), 'FALLBACK', 'a computer that left is not anyone');
  assert.strictEqual(F.selfIn(dir, 'FALLBACK', 'ELSEWHERE'), 'FALLBACK');
});
