'use strict';

/**
 * mesh.test.js — one office for every machine (src/server/mesh.js).
 *
 * mesh.js reads its machines from workspace.config.json once, when it loads, so
 * this file writes a three-machine config and points WORKSPACE_CONFIG at it
 * before the first require of any src module. DESK is the hub.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CFG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-cfg-'));
process.env.WORKSPACE_CONFIG = path.join(CFG_DIR, 'workspace.config.json');
fs.writeFileSync(process.env.WORKSPACE_CONFIG, JSON.stringify({
  machines: [{ name: 'DESK', hub: true }, { name: 'MINI' }, { name: 'LAPTOP' }],
}));

const mesh = require('../src/server/mesh');
const config = require('../src/server/config');

const SID = '97a7ad02-0e31-44cd-bf62-c479ddeb854c';
const cfg = { mesh: { default_interval_ms: 15000, stale_multiple: 4, drop_multiple: 240 } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-'));
const desk = (over) => Object.assign({ id: SID, lane: 'workspace', state: 'working', title: 'a title', last_event_age_ms: 1000 }, over);

test('the machines are the ones workspace.config.json names, read once when mesh.js loads', () => {
  assert.deepStrictEqual([...mesh.MACHINES], ['DESK', 'MINI', 'LAPTOP']);
  // A machine added after the office started joins only after a restart.
  const before = process.env.WORKSPACE_CONFIG;
  process.env.WORKSPACE_CONFIG = path.join(CFG_DIR, 'workspace.config.later.json');
  fs.writeFileSync(process.env.WORKSPACE_CONFIG, JSON.stringify({
    machines: [{ name: 'DESK', hub: true }, { name: 'MINI' }, { name: 'LAPTOP' }, { name: 'TABLET' }],
  }));
  try {
    assert.ok(config.machineNames().includes('TABLET'));
    assert.deepStrictEqual([...mesh.MACHINES], ['DESK', 'MINI', 'LAPTOP']);
    assert.strictEqual(mesh.ingest(tmp(), { machine: 'TABLET', desks: [] }, Date.now(), 'DESK').ok, false);
  } finally {
    process.env.WORKSPACE_CONFIG = before;
  }
});

test('ingest refuses an unknown machine and a machine feeding itself', () => {
  const home = tmp();
  assert.strictEqual(mesh.ingest(home, { machine: 'TABLET', desks: [] }, Date.now(), 'DESK').ok, false);
  assert.strictEqual(mesh.ingest(home, { machine: 'DESK', desks: [] }, Date.now(), 'DESK').ok, false);
  assert.strictEqual(mesh.ingest(home, { machine: 'laptop', desks: [] }, Date.now(), 'DESK').ok, true);
});

test('the sanitiser has no passthrough: unknown fields never reach the feed file', () => {
  const home = tmp();
  mesh.ingest(home, { machine: 'LAPTOP', desks: [desk({ prompt: 'CLIENT NAME 1040', tool_input: { file_path: 'x' }, last_assistant_message: 'secret' })] }, Date.now(), 'DESK');
  const raw = fs.readFileSync(path.join(home, 'mesh', 'LAPTOP', 'feed.json'), 'utf8');
  assert.ok(!/CLIENT NAME|tool_input|secret|prompt/.test(raw));
});

test('a private-work desk loses its title, folder, branch and its helpers their descriptions on the hub', () => {
  const d = mesh.sanitizeDesk(desk({
    client_work: true, title: 'Smith 1040', lane: 'smith-books', branch: 'smith-fix', project: 'smith-books',
    seats: [{ agent_id: 'a1', description: 'Smith return' }],
  }));
  assert.strictEqual(d.title, null);
  assert.strictEqual(d.lane, 'private work');
  assert.strictEqual(d.branch, null);
  assert.strictEqual(d.project, null);
  assert.strictEqual(d.seats[0].description, null);
});

test('a desk without a session id is dropped, and strings are clamped', () => {
  assert.strictEqual(mesh.sanitizeDesk({ id: '../../etc', lane: 'x' }), null);
  assert.strictEqual(mesh.sanitizeDesk(desk({ title: 'x'.repeat(5000) })).title.length, 200);
});

test('fresh feed -> desks on the floor, tagged with their machine, facts intact', () => {
  const home = tmp(); const now = Date.now();
  mesh.ingest(home, { machine: 'LAPTOP', interval_ms: 15000, desks: [desk({ model: 'claude-fable-5-1', tool: 'Bash', verb: 'running' })] }, now, 'DESK');
  const r = mesh.readRemote(home, now + 5000, cfg, 'DESK');
  assert.strictEqual(r.desks.length, 1);
  assert.strictEqual(r.desks[0].machine, 'LAPTOP');
  assert.strictEqual(r.desks[0].state, 'working');
  assert.strictEqual(r.desks[0].last_event_age_ms, 6000);
  assert.strictEqual(r.desks[0].model.value, 'claude-fable-5-1');
  assert.strictEqual(r.feeds.LAPTOP.status, 'OK');
  assert.strictEqual(r.feeds.MINI.status, 'NOT_READ');
  assert.ok(!('DESK' in r.feeds), 'the hub reads no feed from itself');
});

test('a feed that stopped demotes its desks to stale, drops its alarms, and refuses notes', () => {
  const home = tmp(); const now = Date.now();
  mesh.ingest(home, { machine: 'LAPTOP', interval_ms: 15000, desks: [desk()], alarms: [{ lane: 'workspace', condition: 'lane-idle', severity: 'page', since: now }] }, now, 'DESK');
  const r = mesh.readRemote(home, now + 15000 * 4 + 1, cfg, 'DESK');
  assert.strictEqual(r.feeds.LAPTOP.status, 'STALE');
  assert.strictEqual(r.desks[0].state, 'stale');
  assert.strictEqual(r.alarms.length, 0);
  assert.strictEqual(mesh.noteStatus(home, r.desks[0]).deliverable, false);
});

test('hours-old desks leave the floor instead of haunting it', () => {
  const home = tmp(); const now = Date.now();
  mesh.ingest(home, { machine: 'LAPTOP', interval_ms: 15000, desks: [desk()] }, now, 'DESK');
  assert.strictEqual(mesh.readRemote(home, now + 15000 * 240 + 1, cfg, 'DESK').desks.length, 0);
});

test('a note is held until the spoke acknowledges it, then only a receipt without text remains', () => {
  const home = tmp(); const now = Date.now();
  mesh.ingest(home, { machine: 'LAPTOP', desks: [desk()] }, now, 'DESK');
  assert.strictEqual(mesh.ownerOf(home, SID, 'DESK'), 'LAPTOP');
  const q = mesh.queueNote(home, 'LAPTOP', SID, 'hello from the phone', 'owner');
  assert.strictEqual(q.ok, true);
  const first = mesh.ingest(home, { machine: 'LAPTOP', desks: [desk()] }, now + 1, 'DESK');
  assert.strictEqual(first.notes.length, 1);
  const second = mesh.ingest(home, { machine: 'LAPTOP', desks: [desk()], acks: [q.id] }, now + 2, 'DESK');
  assert.strictEqual(second.notes.length, 0);
  const receipts = fs.readFileSync(path.join(home, 'mesh', 'LAPTOP', 'handed-over.jsonl'), 'utf8');
  assert.ok(receipts.includes(q.id));
  assert.ok(!receipts.includes('hello from the phone'));
});

test('queueNote refuses an unknown machine, an empty note, an oversize note and a bad session id', () => {
  const home = tmp();
  assert.strictEqual(mesh.queueNote(home, 'TABLET', SID, 'hi', 'owner').ok, false);
  assert.strictEqual(mesh.queueNote(home, 'LAPTOP', SID, '  ', 'owner').ok, false);
  assert.strictEqual(mesh.queueNote(home, 'LAPTOP', SID, 'x'.repeat(1501), 'owner').ok, false);
  assert.strictEqual(mesh.queueNote(home, 'LAPTOP', 'not a session', 'hi', 'owner').ok, false);
});

test('2026-09-18 the wire carries what the clean view shows: step summaries, the wait, returned helpers, the tree name', () => {
  const d = mesh.sanitizeDesk(desk({
    recent: [{ tool: 'Bash', verb: 'running', at: 1, summary: 'Rebuild the UI bundle' }],
    waiting: { since: 5, kind: 'wakeup', summary: 'Check CI again' },
    seats: [{ agent_id: 'a1', recent: [{ tool: 'Read', verb: 'reading', at: 2, summary: null }] }],
    seats_returned: [{ agent_id: 'a2', agent_type: 'Explore', description: 'Find the gate file', at: 3 }],
    tree: 'wt-run-84-lane-a',
  }));
  assert.strictEqual(d.recent[0].summary, 'Rebuild the UI bundle');
  assert.deepStrictEqual(d.waiting, { since: 5, on: null, kind: 'wakeup', summary: 'Check CI again' });
  assert.strictEqual(d.seats[0].recent[0].tool, 'Read');
  assert.strictEqual(d.seats_returned[0].description, 'Find the gate file');
  assert.strictEqual(d.tree, 'wt-run-84-lane-a');
});

test('2026-09-18 private work loses every summary and folder name on the hub, whatever the spoke sent', () => {
  const d = mesh.sanitizeDesk(desk({
    client_work: true,
    lane: 'smith-books', branch: 'smith-fix', project: 'smith-books',
    recent: [{ tool: 'Bash', summary: 'Open Smith 1040' }],
    waiting: { since: 5, kind: 'background', summary: 'Smith upload' },
    seats: [{ agent_id: 'a1', recent: [{ tool: 'Bash', summary: 'Smith' }] }],
    seats_returned: [{ agent_id: 'a2', description: 'Smith return' }],
    tree: 'smith-books',
  }));
  assert.ok(!/smith/i.test(JSON.stringify(d)));
});

test('a spoke keeps a private desk\'s title, folder and branch at home: they never go on the wire', () => {
  const w = mesh.flattenDesk({
    id: SID, lane: 'smith-books', state: 'working', client_work: true,
    title: 'Smith 1040', branch: 'smith-fix', project: 'smith-books', code_cwd: 'C:\\Users\\alex\\clients\\smith-books',
  });
  assert.strictEqual(w.client_work, true);
  assert.strictEqual(w.lane, 'private work');
  assert.ok(!/smith|clients/i.test(JSON.stringify(w)));
});

test('2026-09-18 flows keep who/whom/subject/time and drop everything else', () => {
  const home = tmp();
  mesh.ingest(home, { machine: 'MINI', desks: [], flows: [
    { id: '1', channel: 'run-90', from: 'lane-a', to: 'lane-b', subject: 'VERIFY A-1', at: 10, body: 'BODYMARKER' },
    { id: '2', channel: 'run-90', from: 'lane-a', subject: 'no time' },
  ] }, Date.now(), 'DESK');
  const feed = mesh.readFeed(home, 'MINI');
  assert.strictEqual(feed.flows.length, 1);
  assert.strictEqual(feed.flows[0].subject, 'VERIFY A-1');
  assert.ok(!JSON.stringify(feed).includes('BODYMARKER'));
});
