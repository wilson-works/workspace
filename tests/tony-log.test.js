'use strict';

/**
 * tony-log.test.js — Tony's accuracy log (.claude/hooks/tony-log.js). A Tony run writes one line with counts only:
 * client code, task type, tools, refused steps, model, time. The made-up request below carries a name, an amount and a
 * memo; none of them may reach the log. The person's next message marks the run once. Another agent writes nothing.
 * All data here is made up.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.join(__dirname, '..', '.claude', 'hooks', 'tony-log.js');
const tmp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), `tony-log-${n}-`));

function hubWithTranscript() {
  const hub = tmp('hub');
  fs.mkdirSync(path.join(hub, '.hub'));
  const tr = path.join(hub, 'agent-abc.jsonl');
  const rows = [
    { type: 'user', timestamp: '2026-11-05T15:00:00.000Z', message: { role: 'user', content: 'Code the October bank lines for C03. Madeup Plumbing LLC paid 1,234.56, memo "roof job 77".' } },
    { type: 'assistant', timestamp: '2026-11-05T15:00:20.000Z', message: { model: 'claude-test-model', content: [{ type: 'text', text: 'Madeup Plumbing looks like repairs.' }, { type: 'tool_use', id: 't1', name: 'mcp__balnce__list_lines', input: { client: 'C03', memo: 'roof job 77' } }] } },
    { type: 'user', timestamp: '2026-11-05T15:00:30.000Z', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'Madeup Plumbing LLC 1,234.56 roof job 77' }] } },
    { type: 'assistant', timestamp: '2026-11-05T15:01:00.000Z', message: { model: 'claude-test-model', content: [{ type: 'tool_use', id: 't2', name: 'mcp__balnce__post_line', input: { amount: '1,234.56' } }] } },
    { type: 'user', timestamp: '2026-11-05T15:01:10.000Z', message: { content: [{ type: 'tool_result', tool_use_id: 't2', is_error: true, content: "The user doesn't want to proceed with this tool use. The tool use was rejected." }] } },
    { type: 'assistant', timestamp: '2026-11-05T15:01:30.000Z', message: { model: 'claude-test-model', content: [{ type: 'tool_use', id: 't3', name: 'mcp__balnce__list_lines', input: {} }, { type: 'text', text: 'Done with Madeup Plumbing.' }] } },
  ];
  fs.writeFileSync(tr, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return { hub, tr };
}

const run = (payload, hub, event) => spawnSync(process.execPath, [HOOK, event], {
  input: JSON.stringify(payload), encoding: 'utf8', env: Object.assign({}, process.env, { WW_HUB: hub, CLAUDE_PROJECT_DIR: '' }),
});
const lines = (hub, month) => fs.readFileSync(path.join(hub, '50-AI', 'logs', 'tony', `${month}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('a Tony run writes one line of counts, and nothing of the client but the code', () => {
  const { hub, tr } = hubWithTranscript();
  const r = run({ hook_event_name: 'SubagentStop', session_id: 's-1', agent_id: 'a-1', agent_type: 'tony', agent_transcript_path: tr }, hub, 'SubagentStop');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '', 'a hook says nothing to the chat');
  const file = path.join(hub, '50-AI', 'logs', 'tony', '2026-11.jsonl');
  const raw = fs.readFileSync(file, 'utf8');
  const [l] = lines(hub, '2026-11');
  assert.equal(l.type, 'tony');
  assert.equal(l.client, 'C03');
  assert.equal(l.task, 'bank-coding');
  assert.deepEqual(l.tools, { mcp__balnce__list_lines: 2, mcp__balnce__post_line: 1 });
  assert.equal(l.steps, 3);
  assert.equal(l.refused_steps, 1);
  assert.equal(l.outcome, 'rejected', 'a refused step is the person saying no');
  assert.equal(l.model, 'claude-test-model');
  assert.equal(l.ms, 90000);
  assert.equal(l.at, '2026-11-05 09:01 CDT');
  assert.equal(l.started, '2026-11-05 09:00 CDT');
  for (const bad of ['Madeup', 'Plumbing', '1,234.56', '1234', 'roof', 'memo', 'October']) assert.ok(!raw.includes(bad), `the log holds "${bad}"`);
});

test('the person\'s next message marks the run once, as a label, never the words', () => {
  const { hub, tr } = hubWithTranscript();
  run({ hook_event_name: 'SubagentStop', session_id: 's-2', agent_id: 'a-2', agent_type: 'tony', agent_transcript_path: tr }, hub, 'SubagentStop');
  // The hook looks for the run in this month's file and last month's; the made-up run is dated 2026-11, so a later
  // test run finds it in its own month's file.
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  if (month !== '2026-11') fs.copyFileSync(path.join(hub, '50-AI', 'logs', 'tony', '2026-11.jsonl'), path.join(hub, '50-AI', 'logs', 'tony', `${month}.jsonl`));
  run({ hook_event_name: 'UserPromptSubmit', session_id: 's-2', prompt: "That's wrong, the roof job should be 6100 repairs." }, hub, 'UserPromptSubmit');
  run({ hook_event_name: 'UserPromptSubmit', session_id: 's-2', prompt: 'thanks' }, hub, 'UserPromptSubmit');
  run({ hook_event_name: 'UserPromptSubmit', session_id: 'other-chat', prompt: 'thanks' }, hub, 'UserPromptSubmit');
  const all = lines(hub, month);
  const marks = all.filter((l) => l.type === 'tony-outcome');
  assert.equal(marks.length, 1, 'only the next message in the same chat counts');
  assert.equal(marks[0].run, 'a-2');
  assert.equal(marks[0].outcome, 'corrected');
  const raw = fs.readFileSync(path.join(hub, '50-AI', 'logs', 'tony', `${month}.jsonl`), 'utf8');
  for (const bad of ['roof', '6100', 'wrong']) assert.ok(!raw.includes(bad), `the log holds "${bad}"`);
});

test('the words of a next message: accepted, corrected, rejected, unclear', () => {
  const { outcomeOf } = require(HOOK);
  assert.equal(outcomeOf('Thanks, looks good'), 'accepted');
  assert.equal(outcomeOf('No, that is not right'), 'corrected');
  assert.equal(outcomeOf('That is incorrect'), 'corrected');
  assert.equal(outcomeOf('Undo that please'), 'rejected');
  assert.equal(outcomeOf('Now do C04'), 'unclear');
});

test('another agent, or no Hub, writes nothing', () => {
  const { hub, tr } = hubWithTranscript();
  run({ hook_event_name: 'SubagentStop', session_id: 's-3', agent_id: 'a-3', agent_type: 'louise', agent_transcript_path: tr }, hub, 'SubagentStop');
  assert.ok(!fs.existsSync(path.join(hub, '50-AI', 'logs', 'tony')));
  const notHub = tmp('nohub');
  const r = spawnSync(process.execPath, [HOOK, 'SubagentStop'], {
    input: JSON.stringify({ hook_event_name: 'SubagentStop', session_id: 's', agent_id: 'a', agent_type: 'tony', agent_transcript_path: tr, cwd: notHub }),
    encoding: 'utf8', env: Object.assign({}, process.env, { WW_HUB: '', CLAUDE_PROJECT_DIR: notHub }),
  });
  assert.equal(r.status, 0);
  assert.ok(!fs.existsSync(path.join(notHub, '50-AI')));
  const bad = spawnSync(process.execPath, [HOOK, 'SubagentStop'], { input: 'not json', encoding: 'utf8' });
  assert.equal(bad.status, 0, 'a bad payload never fails the session');
});

test('a code project with only a CLAUDE.md is never a Hub, and neither is a WW_HUB without .hub', () => {
  const { tr } = hubWithTranscript();
  const repo = tmp('repo');
  fs.writeFileSync(path.join(repo, 'CLAUDE.md'), '# a code project\n');
  const payload = { hook_event_name: 'SubagentStop', session_id: 's', agent_id: 'a', agent_type: 'tony', agent_transcript_path: tr, cwd: repo };
  const asProject = spawnSync(process.execPath, [HOOK, 'SubagentStop'], {
    input: JSON.stringify(payload), encoding: 'utf8', env: Object.assign({}, process.env, { WW_HUB: '', CLAUDE_PROJECT_DIR: repo }),
  });
  assert.equal(asProject.status, 0);
  assert.ok(!fs.existsSync(path.join(repo, '50-AI')), 'nothing is written into a plain code project');
  const asWwHub = spawnSync(process.execPath, [HOOK, 'SubagentStop'], {
    input: JSON.stringify(payload), encoding: 'utf8', env: Object.assign({}, process.env, { WW_HUB: repo, CLAUDE_PROJECT_DIR: '' }),
  });
  assert.equal(asWwHub.status, 0);
  assert.ok(!fs.existsSync(path.join(repo, '50-AI')), 'WW_HUB must name a real Hub (.hub/)');
  const { findHub } = require(HOOK);
  assert.equal(findHub({ cwd: repo }, repo, { WW_HUB: repo, CLAUDE_PROJECT_DIR: repo }), null);
});

test('a plugin\'s Tony (plugin:Tony) is logged; a name that only contains tony is not', () => {
  const { hub, tr } = hubWithTranscript();
  run({ hook_event_name: 'SubagentStop', session_id: 's-4', agent_id: 'a-4', agent_type: 'plugin:Tony', agent_transcript_path: tr }, hub, 'SubagentStop');
  run({ hook_event_name: 'SubagentStop', session_id: 's-5', agent_id: 'a-5', agent_type: 'tonyfake', agent_transcript_path: tr }, hub, 'SubagentStop');
  const runs = lines(hub, '2026-11').filter((l) => l.type === 'tony').map((l) => l.run);
  assert.deepEqual(runs, ['a-4']);
});

test('the installer adds the Tony log hooks to the office\'s list', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'bin', 'install.js'), 'utf8');
  assert.match(src, /SubagentStop: \[office\('SubagentStop'\), tony\('SubagentStop'\)\]/);
  assert.match(src, /tony\('UserPromptSubmit'\)\]/);
});
