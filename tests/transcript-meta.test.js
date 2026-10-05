'use strict';

/**
 * transcript-meta.test.js — PRV-02 (rewritten) and OFF-25 WAITING.
 *
 * PRV-02 used to be a grep: "sources.js never contains `.content`". That stopped
 * being true on 2026-09-17, deliberately - the inspector's activity trail needs
 * the NAMES of tools, and a tool name lives inside message.content. A grep can
 * only say a word is absent; it cannot say what leaves the reader. So this
 * test plants a marker in every private field a transcript line carries and
 * requires that none of them appears anywhere in what transcriptMeta returns.
 *
 * WAITING: a session that started a background command, or set itself a
 * ScheduleWakeup timer, writes nothing until the wait ends. The owner saw one
 * such session labelled "idle" while it was plainly running (2026-09-17). The
 * shapes below are copied from real transcripts.
 *
 * Private work is whatever workspace.config.json `privacy.private_work` names;
 * this file writes its own config (one private folder) before any src module
 * loads.
 */

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmeta-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
process.env.WORKSPACE_CONFIG = path.join(dir, 'workspace.config.json');
fs.writeFileSync(process.env.WORKSPACE_CONFIG, JSON.stringify({ privacy: { private_work: ['C:\\Users\\alex\\clients'] } }));

const S = require('../src/server/sources');

let n = 0;
function transcript(lines) {
  n += 1;
  const p = path.join(dir, `t${n}.jsonl`);
  fs.writeFileSync(p, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return S.transcriptMeta(p);
}

const T0 = Date.parse('2026-09-17T20:00:00Z');
const at = (s) => new Date(T0 + s * 1000).toISOString();
const base = { cwd: 'C:\\Users\\alex\\code', gitBranch: 'main', sessionId: 'abc' };
const toolUse = (s, name, input) => Object.assign({ type: 'assistant', timestamp: at(s),
  message: { model: 'claude-fable-5-1', content: [{ type: 'tool_use', id: `tu${s}`, name, input }] } }, base);
const bgResult = (s, id) => Object.assign({ type: 'user', timestamp: at(s),
  message: { content: [{ type: 'tool_result', tool_use_id: `tu${s}`, content: 'Command running in background with ID: ' + id }] },
  toolUseResult: { stdout: '', stderr: '', backgroundTaskId: id } }, base);
const finish = (s, id) => Object.assign({ type: 'queue-operation', operation: 'enqueue', timestamp: at(s),
  content: `<task-notification>\n<task-id>${id}</task-id>\n<status>completed</status>\n<summary>SUMMARYMARKER</summary>\n</task-notification>` }, base);
const say = (s, text) => Object.assign({ type: 'assistant', timestamp: at(s),
  message: { model: 'claude-fable-5-1', content: [{ type: 'text', text }], stop_reason: 'end_turn' } }, base);

test('PRV-02 transcriptMeta returns no text from any message body, tool input, tool result, thinking block or task summary', () => {
  const out = transcript([
    Object.assign({ type: 'user', timestamp: at(0), message: { content: 'PROMPTMARKER client John Doe' } }, base),
    Object.assign({ type: 'assistant', timestamp: at(1), message: { model: 'claude-fable-5-1', content: [
      { type: 'thinking', thinking: 'THINKMARKER' },
      { type: 'text', text: 'TEXTMARKER' },
      { type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: 'D:\INPUTMARKER\tax.pdf' } },
    ] } }, base),
    Object.assign({ type: 'user', timestamp: at(2), message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'RESULTMARKER' }] },
      toolUseResult: { stdout: 'STDOUTMARKER', backgroundTaskId: 'b1' } }, base),
    finish(3, 'b1'),
    say(4, 'REPLYMARKER'),
  ]);
  const leaked = JSON.stringify(out);
  for (const m of ['PROMPTMARKER', 'THINKMARKER', 'TEXTMARKER', 'INPUTMARKER', 'RESULTMARKER', 'STDOUTMARKER', 'SUMMARYMARKER', 'REPLYMARKER']) {
    assert.ok(!leaked.includes(m), `transcriptMeta leaked ${m}`);
  }
  // The positive control: it DID read the transcript - the tool name got through.
  assert.equal(out.tool, 'Read');
});

test('OFF-25 WAITING a background command with no finish is a wait; the session reads as waiting, not idle', () => {
  const out = transcript([toolUse(0, 'Bash', { command: 'sleep 600' }), bgResult(1, 'b54vy1e21'), say(2, 'Timer running.')]);
  assert.deepEqual(out.waiting, { kind: 'background', since: T0 + 1000 });
});

test('OFF-25 WAITING positive control: the same command after its finish is written is NOT a wait', () => {
  const out = transcript([toolUse(0, 'Bash', {}), bgResult(1, 'b54vy1e21'), finish(600, 'b54vy1e21'), say(601, 'Done.')]);
  assert.equal(out.waiting, null);
});

test('OFF-25 WAITING a background command stopped later with TaskStop is NOT a wait', () => {
  const out = transcript([toolUse(0, 'Bash', {}), bgResult(1, 'bkill'), toolUse(5, 'TaskStop', {}), say(6, 'Stopped it.')]);
  assert.equal(out.waiting, null);
});

test('OFF-25 WAITING a ScheduleWakeup as the newest tool call is a wait; one followed by later work is not', () => {
  const waiting = transcript([toolUse(0, 'Read', {}), toolUse(1, 'ScheduleWakeup', {}), say(2, 'Back in 20 min.')]);
  assert.equal(waiting.waiting && waiting.waiting.kind, 'wakeup');
  const woke = transcript([toolUse(0, 'ScheduleWakeup', {}), toolUse(1200, 'Read', {})]);
  assert.equal(woke.waiting, null);
});

test('2026-09-18 the summary a session writes for a call is read, and nothing else from its input', () => {
  const out = transcript([
    toolUse(0, 'Bash', { command: 'cat CMDMARKER.txt', description: 'Rebuild the UI bundle' }),
    toolUse(1, 'Edit', { file_path: 'C:/Users/alex/code/PATHMARKER.js', old_string: 'OLDMARKER', new_string: 'NEWMARKER' }),
  ]);
  const leaked = JSON.stringify(out);
  for (const m of ['CMDMARKER', 'PATHMARKER', 'OLDMARKER', 'NEWMARKER']) assert.ok(!leaked.includes(m), `leaked ${m}`);
  assert.equal(out.recent[0].tool, 'Edit');
  assert.equal(out.recent[0].summary, null);
  assert.equal(out.recent[1].summary, 'Rebuild the UI bundle');
});

test('2026-09-18 isClientWork (a privacy.private_work folder) catches forward-slash paths as well as backslash ones', () => {
  assert.equal(S.isClientWork('C:/Users/alex/clients/Acme/x'), true);
  assert.equal(S.isClientWork('C:\\Users\\alex\\clients\\Acme\\x'), true);
  assert.equal(S.isClientWork('C:/Users/alex/code/workspace'), false);
});
