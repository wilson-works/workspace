'use strict';

/**
 * privacy-boundary.test.js — acceptance PRV-01, PRV-02, OFF-14.
 *
 * PRV-01: tool_input, prompt, last_assistant_message and agent_description
 * are banned from CAPTURE, not merely from display — they never reach
 * events.jsonl in the first place.
 *
 * PRV-02: no transcript body text is persisted, indexed, logged or
 * transmitted — sources.js reads transcript metadata only.
 *
 * OFF-14: "what they are working on" is a verb from a fixed whitelist keyed
 * by tool_name; no free text from any model or user reaches the screen.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const S = require('../src/server/sources');

const HOOK_PATH = path.join(__dirname, '..', '.claude', 'hooks', 'office-hook.js');
const SOURCES_PATH = path.join(__dirname, '..', 'src', 'server', 'sources.js');

test('PRV-01 the office-hook.js writer never captures tool_input, prompt, last_assistant_message or agent_description, even when a payload supplies all four', () => {
  // First, the static claim: the ALLOW list itself must never name the four banned fields.
  const hookSrc = fs.readFileSync(HOOK_PATH, 'utf8');
  const allowMatch = /const ALLOW = \[([\s\S]*?)\];/.exec(hookSrc);
  assert.ok(allowMatch, 'could not locate the ALLOW array in office-hook.js');
  for (const banned of ['tool_input', 'prompt', 'last_assistant_message', 'agent_description']) {
    assert.doesNotMatch(allowMatch[1], new RegExp(`['"]${banned}['"]`), `ALLOW must never list ${banned}`);
  }

  // Then, the dynamic claim: run the real writer as a child process, on a
  // payload that supplies all four banned fields plus legitimate ones, and
  // inspect exactly what it wrote.
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-priv-'));
  try {
    const payload = {
      hook_event_name: 'PreToolUse',
      session_id: 'sess-priv-1',
      cwd: 'C:\\Users\\alex\\code\\workspace',
      permission_mode: 'default',
      tool_name: 'Write',
      tool_use_id: 'toolu_privacy_test',
      tool_input: {
        file_path: 'C:\\Users\\alex\\clients\\Acme\\client-secret-1040.pdf',
        content: 'SSN 123-45-6789',
      },
      prompt: 'Please write client SSN 123-45-6789 to a file, TAXCLIENTMARKER',
      last_assistant_message: 'ASSISTANTMARKER sure, writing the SSN now',
      agent_description: 'AGENTDESCMARKER reading the Acme client tax file for John Doe',
    };

    const result = spawnSync(process.execPath, [HOOK_PATH], {
      input: JSON.stringify(payload),
      env: Object.assign({}, process.env, { WORKSPACE_HOME: tmpHome }),
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, 'the hook must always exit 0 — rule 1, it never fails the session');

    const eventsPath = path.join(tmpHome, 'events.jsonl');
    const lines = fs.readFileSync(eventsPath, 'utf8').trim().split(/\r?\n/);
    const line = lines[lines.length - 1];
    const written = JSON.parse(line);

    for (const banned of ['tool_input', 'prompt', 'last_assistant_message', 'agent_description']) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(written, banned),
        false,
        `written event must never carry the field ${banned}`
      );
    }
    for (const leaked of ['123-45-6789', 'client-secret-1040.pdf', 'TAXCLIENTMARKER', 'ASSISTANTMARKER', 'AGENTDESCMARKER', 'John Doe']) {
      assert.ok(!line.includes(leaked), `written line leaked free text that should never have been captured: ${leaked}`);
    }
    // The legitimate, enumerable fields must still make it through.
    assert.equal(written.tool_name, 'Write');
    assert.equal(written.session_id, 'sess-priv-1');
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

// PRV-02 moved to tests/transcript-meta.test.js on 2026-09-17: the grep for
// `.content` became false the day the activity trail started reading tool
// NAMES, so it was replaced by a test of what actually leaves the reader.

test('OFF-14 sources.verbFor() only returns whitelisted verbs, and an unknown tool name falls back to exactly "working"', () => {
  const EXPECTED_VERBS = new Set([
    'reading', 'editing', 'running', 'searching', 'delegating', 'fetching', 'planning', 'working',
  ]);

  const produced = new Set(Object.keys(S.VERBS).map((t) => S.verbFor(t)));
  produced.add(S.verbFor('SomeToolThatDoesNotExist'));
  produced.add(S.verbFor(undefined));
  produced.add(S.verbFor(null));

  for (const v of produced) {
    assert.ok(EXPECTED_VERBS.has(v), `verbFor produced a verb outside the fixed whitelist: ${v}`);
  }
  assert.equal(S.verbFor('TotallyUnknownTool'), 'working');
  assert.equal(S.verbFor(undefined), 'working');
});
