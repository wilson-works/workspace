'use strict';

/**
 * channel.test.js — one group chat for the owner and every running session
 * (src/server/channel.js, bin/office-say.js).
 *
 * The machines come from workspace.config.json, written here before any src
 * module loads (mesh.js reads them once): DESK (the hub), MINI and LAPTOP.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CFG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'channel-cfg-'));
process.env.WORKSPACE_CONFIG = path.join(CFG_DIR, 'workspace.config.json');
fs.writeFileSync(process.env.WORKSPACE_CONFIG, JSON.stringify({
  machines: [{ name: 'DESK', hub: true }, { name: 'MINI' }, { name: 'LAPTOP' }],
}));

const C = require('../src/server/channel');

const NOW = Date.parse('2026-10-02T23:00:00Z');
const MIN = 60 * 1000;
const sid = (n) => `c0c0c0c0-0000-4000-8000-00000000000${n}`;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'channel-'));
const sess = (n, over) => Object.assign({ id: sid(n), machine: 'MINI', deliverable: true, run: null, callsign: { name: `S${n}` } }, over);
const lines = (p) => { try { return fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)); } catch (_) { return []; } };

test('content: 500 characters at most; private work refuses paths, file names and technical text', () => {
  assert.strictEqual(C.contentRefusal('x'.repeat(500), false), null);
  assert.match(C.contentRefusal('x'.repeat(501), false), /under 500/);
  assert.strictEqual(C.contentRefusal('touching src/server/channel.js, hold off', false), null);
  assert.match(C.contentRefusal('Finished C:\\Users\\alex\\clients\\smith-1040.pdf', true), /private work/);
  assert.match(C.contentRefusal('Finished smith-1040.pdf', true), /private work/);
  assert.strictEqual(C.contentRefusal('Finished the return I was on, moving to the next one.', true), null);
});

test('rate: one post a minute, six an hour, each refusal says when to try again', () => {
  assert.strictEqual(C.rateRefusal([], [], NOW), null);
  const minute = C.rateRefusal([NOW - 30 * 1000], [], NOW);
  assert.match(minute.line, /One group post a minute/);
  assert.strictEqual(minute.retry_at, NOW + 30 * 1000);
  const hour = C.rateRefusal([2, 3, 4, 5, 6, 7].map((m) => NOW - m * MIN), [], NOW);
  assert.match(hour.line, /6 group posts an hour/);
  assert.strictEqual(hour.retry_at, NOW - 7 * MIN + 3600 * 1000);
  assert.strictEqual(C.rateRefusal([2, 3, 4, 5, 6].map((m) => NOW - m * MIN), [], NOW), null);
});

test('loop breaker: no post within 60 s of an unaddressed group message; an addressed one does not trip it', () => {
  assert.match(C.rateRefusal([], [{ at: NOW - 10 * 1000, addressed: false }], NOW).line, /Loop breaker/);
  assert.strictEqual(C.rateRefusal([], [{ at: NOW - 10 * 1000, addressed: true }], NOW), null);
  assert.strictEqual(C.rateRefusal([], [{ at: NOW - 61 * 1000, addressed: false }], NOW), null);
});

test('fan-out: every live deliverable session in scope, never the sender, never a stale or undeliverable one', () => {
  const home = tmp();
  const sessions = [sess(1, { run: '1' }), sess(2, { run: '1' }), sess(3), sess(4, { deliverable: false }), sess(5)];
  C.store(home, { from: { kind: 'session', callsign: 'S1', machine: 'MINI', session_id: sid(1) }, scope: 'all', text: 'hello all' }, false, NOW);
  C.fanOut(home, sessions, new Set([`MINI:${sid(5)}`]), 'MINI', NOW);
  const got = (n) => lines(path.join(home, 'inbox', `${sid(n)}.jsonl`)).length;
  assert.deepStrictEqual([1, 2, 3, 4, 5].map(got), [0, 1, 1, 0, 0]);
  // Sent once: a second pass sends nothing new.
  C.fanOut(home, sessions, new Set(), 'MINI', NOW + 1000);
  assert.deepStrictEqual([1, 2, 3, 4, 5].map(got), [0, 1, 1, 0, 0]);
});

test('scope control: run:1 does not reach a session outside run 1; auto is the sender\'s run', () => {
  const home = tmp();
  const sessions = [sess(1, { run: '1' }), sess(2, { run: '1' }), sess(3, { run: '2' }), sess(4)];
  C.store(home, { from: { kind: 'owner' }, scope: 'run:1', text: 'run one only' }, false, NOW);
  C.store(home, { from: { kind: 'session', callsign: 'S3', machine: 'MINI', session_id: sid(3) }, scope: 'auto', text: 'my run' }, false, NOW);
  C.fanOut(home, sessions, new Set(), 'MINI', NOW);
  const got = (n) => lines(path.join(home, 'inbox', `${sid(n)}.jsonl`)).map((r) => r.text.split('\n')[0]);
  assert.strictEqual(got(1).length, 1);
  assert.strictEqual(got(2).length, 1);
  assert.deepStrictEqual(got(3), []);
  assert.deepStrictEqual(got(4), []);
  const v = C.view(home, sessions, 'MINI');
  assert.strictEqual(v[1].scope, 'run:2');
});

test('scope control: machine:<name> takes any machine name and reaches only that machine', () => {
  const home = tmp();
  const r = C.store(home, { from: { kind: 'owner' }, scope: 'machine:LAPTOP', text: 'laptop only' }, false, NOW);
  assert.strictEqual(r.message.scope, 'machine:LAPTOP');
  assert.strictEqual(C.store(home, { from: { kind: 'owner' }, scope: 'machine:STUDIO-2', text: 'studio only' }, false, NOW).message.scope, 'machine:STUDIO-2');
  assert.strictEqual(C.inScope(r.message, sess(1, { machine: 'LAPTOP' }), null), true);
  assert.strictEqual(C.inScope(r.message, sess(2, { machine: 'MINI' }), null), false);
});

test('another machine\'s session gets its message through the mesh outbox, tagged group, with a runnable post line', () => {
  const home = tmp();
  C.store(home, { from: { kind: 'owner' }, scope: 'all', text: 'to everyone' }, false, NOW);
  C.fanOut(home, [sess(1, { machine: 'LAPTOP' })], new Set(), 'DESK', NOW);
  const out = lines(path.join(home, 'mesh', 'LAPTOP', 'outbox.jsonl'));
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].from, 'group');
  assert.match(out[0].text, /^\[Group\] the owner: to everyone/);
  // The note says how to post with this WorkSpace's own absolute path, so the line runs as written.
  const say = path.join(__dirname, '..', 'bin', 'office-say.js');
  assert.ok(path.isAbsolute(say));
  assert.strictEqual(C.SAY, `node "${say}" "text" [--to <callsign>]`);
  assert.ok(out[0].text.endsWith(`To post: ${C.SAY}.)`), out[0].text);
});

test('the hub re-checks a private-work post and refuses a path even if the spoke let it through', () => {
  const home = tmp();
  const posts = [{ id: 'gabc12345', from: { kind: 'session', callsign: 'S1', machine: 'LAPTOP', session_id: sid(1) }, scope: 'all', text: 'did smith-1040.pdf', client_work: true }];
  assert.deepStrictEqual(C.acceptRemote(home, 'LAPTOP', posts, (p) => !!p.client_work, NOW), []);
  // A post claiming to come from another machine is ignored.
  const forged = [{ id: 'gabc12346', from: { kind: 'session', callsign: 'S1', machine: 'DESK', session_id: sid(1) }, scope: 'all', text: 'hi' }];
  assert.deepStrictEqual(C.acceptRemote(home, 'LAPTOP', forged, () => false, NOW), []);
});

test('office-say: posts once, then refuses within the minute with exit 2', () => {
  const home = tmp();
  const say = (text) => spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'office-say.js'), text, '--session', sid(1)],
    { env: Object.assign({}, process.env, { WORKSPACE_HOME: home, WORKSPACE_MACHINE: 'MINI', CLAUDE_PROJECT_DIR: '' }), encoding: 'utf8' });
  const first = say('Touching the migrations folder, hold off.');
  assert.strictEqual(first.status, 0, first.stdout);
  const second = say('One more.');
  assert.strictEqual(second.status, 2);
  assert.match(second.stdout, /One group post a minute/);
  const queued = lines(path.join(home, 'channel', 'outbox.jsonl'));
  assert.strictEqual(queued.length, 1);
  assert.strictEqual(queued[0].from.machine, 'MINI');
});

test('a new session is told the last messages of the past 2 hours', () => {
  const msgs = [
    { at: NOW - 3 * 3600 * 1000, from: { kind: 'owner' }, text: 'too old' },
    { at: NOW - 10 * MIN, from: { kind: 'session', callsign: 'Vega', machine: 'MINI' }, text: 'recent' },
  ];
  const out = C.recentLines(msgs, NOW);
  assert.strictEqual(out.length, 1);
  assert.match(out[0], /Vega \(MINI\): recent/);
});
