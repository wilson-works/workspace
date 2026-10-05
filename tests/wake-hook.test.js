'use strict';

/**
 * wake-hook.test.js — bin/office-wake-hook.js.
 * The waiter delivers a note once and exits 2; it stands down (exit 0, nothing
 * delivered) on a new turn, when a later Stop replaces it, when its session's
 * process is gone, and for a subagent. Each case spawns the real hook against a
 * temporary office home. The hooks inherit WORKSPACE_CONFIG, a temp file whose
 * owner is Alex, so a note says who sent it.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

process.env.WORKSPACE_CONFIG = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wake-cfg-')), 'workspace.config.json');
fs.writeFileSync(process.env.WORKSPACE_CONFIG, JSON.stringify({ owner: { name: 'Alex' } }));

const HOOK = path.join(__dirname, '..', 'bin', 'office-wake-hook.js');
const INBOX_HOOK = path.join(__dirname, '..', '.claude', 'hooks', 'office-inbox-hook.js');
const SID = '5b1f0c1e-7d2a-4c11-9a51-0d6e2f3a4b5c';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wake-'));

function run(home, event, payload, env = {}) {
  const p = spawn(process.execPath, [HOOK, event], {
    env: Object.assign({}, process.env, { WORKSPACE_HOME: home, CLAUDE_PID: String(process.pid) }, env),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  p.stdout.on('data', (c) => { stdout += c; });
  p.stderr.on('data', (c) => { stderr += c; });
  p.stdin.end(JSON.stringify(Object.assign({ session_id: SID, hook_event_name: event }, payload || {})));
  const done = new Promise((resolve) => p.on('exit', (code) => resolve({ code, stdout, stderr })));
  return { p, done };
}

function note(home, text, from) {
  fs.mkdirSync(path.join(home, 'inbox'), { recursive: true });
  fs.appendFileSync(path.join(home, 'inbox', `${SID}.jsonl`),
    JSON.stringify({ id: `n${Date.now().toString(36)}`, queued_at: Date.now(), from: from || 'owner', text }) + '\n');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const within = (promise, ms) => Promise.race([promise, sleep(ms).then(() => ({ code: 'TIMEOUT' }))]);
const delivered = (home) => {
  try { return fs.readFileSync(path.join(home, 'inbox', 'delivered', `${SID}.jsonl`), 'utf8').split('\n').filter(Boolean).map(JSON.parse); } catch (_) { return []; }
};

test('a note to an idle session is delivered once: exit 2, the note on stderr, the inbox emptied', async () => {
  const home = tmp();
  const w = run(home, 'Stop');
  await sleep(500);
  note(home, 'Check row C3 please');
  const r = await within(w.done, 5000);
  assert.strictEqual(r.code, 2);
  assert.match(r.stderr, /^Note from the office \(owner, \d\d:\d\d\): Check row C3 please/);
  assert.strictEqual(r.stdout, '');
  assert.ok(!fs.existsSync(path.join(home, 'inbox', `${SID}.jsonl`)));
  const d = delivered(home);
  assert.strictEqual(d.length, 1);
  assert.strictEqual(d[0].via, 'Wake');
  assert.ok(!fs.existsSync(path.join(home, 'wake', `${SID}.pid`)), 'the pid-lock is removed on exit');
});

test('a note already waiting when the turn ends goes out at once', async () => {
  const home = tmp();
  note(home, 'landed after the last tool call');
  const r = await within(run(home, 'Stop').done, 4000);
  assert.strictEqual(r.code, 2);
  assert.match(r.stderr, /landed after the last tool call/);
});

test('a new turn (UserPromptSubmit) stands the waiter down; the note stays for the inbox hook', async () => {
  const home = tmp();
  const w = run(home, 'Stop');
  await sleep(500);
  assert.strictEqual((await within(run(home, 'UserPromptSubmit').done, 4000)).code, 0);
  const r = await within(w.done, 5000);
  assert.strictEqual(r.code, 0);
  note(home, 'mid-turn note');
  await sleep(2500);
  assert.ok(fs.existsSync(path.join(home, 'inbox', `${SID}.jsonl`)), 'the waiter did not take it');
  assert.strictEqual(delivered(home).length, 0);
});

test('no double delivery: the inbox hook delivers mid-turn, the next waiter finds nothing to re-deliver', async () => {
  const home = tmp();
  note(home, 'one note');
  const ih = spawnSync(process.execPath, [INBOX_HOOK], {
    env: Object.assign({}, process.env, { WORKSPACE_HOME: home }),
    input: JSON.stringify({ session_id: SID, hook_event_name: 'PostToolUse' }),
  });
  assert.match(String(ih.stdout), /one note/);
  assert.match(String(ih.stdout), /A note from Alex, sent through the office/);
  const w = run(home, 'Stop');
  const r = await within(w.done, 3000);
  assert.strictEqual(r.code, 'TIMEOUT', 'the waiter keeps waiting; it has nothing to deliver');
  w.p.kill();
  assert.strictEqual(delivered(home).length, 1);
});

test('one waiter per session: a later Stop replaces the earlier waiter', async () => {
  const home = tmp();
  const a = run(home, 'Stop');
  await sleep(500);
  const b = run(home, 'Stop');
  const ra = await within(a.done, 5000);
  assert.strictEqual(ra.code, 0, 'the replaced waiter leaves quietly');
  note(home, 'for the new waiter');
  const rb = await within(b.done, 5000);
  assert.strictEqual(rb.code, 2);
  assert.strictEqual(delivered(home).length, 1);
});

test('no orphan: the waiter leaves when its session process is gone', async () => {
  const home = tmp();
  const parent = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 800)']);
  const w = run(home, 'Stop', {}, { CLAUDE_PID: String(parent.pid) });
  const r = await within(w.done, 6000);
  assert.strictEqual(r.code, 0);
});

test('SessionEnd stands the waiter down', async () => {
  const home = tmp();
  const w = run(home, 'Stop');
  await sleep(500);
  await within(run(home, 'SessionEnd').done, 4000);
  assert.strictEqual((await within(w.done, 5000)).code, 0);
});

test('a subagent never waits', async () => {
  const home = tmp();
  const r = await within(run(home, 'Stop', { agent_id: 'a1' }).done, 3000);
  assert.strictEqual(r.code, 0);
  assert.ok(!fs.existsSync(path.join(home, 'wake', `${SID}.pid`)));
});
