'use strict';

/**
 * events-archive.test.js — the hook stream is shortened without losing a line:
 * everything older than the kept tail is in a verified archive, the tail stays
 * live, and the office reads it in time order.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { rotateEvents } = require('../src/server/events-archive');
const S = require('../src/server/sources');

const line = (i, t) => JSON.stringify({ session_id: 'abcd1234', hook_event_name: 'PreToolUse', tool_name: 'Read', received_at: new Date(t).toISOString(), n: i }) + '\n';

test('2026-09-18 rotation archives the old part, keeps the tail live, and loses nothing', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'evarch-'));
  const T = Date.parse('2026-09-18T10:00:00Z');
  let text = '';
  for (let i = 0; i < 400; i += 1) text += line(i, T + i * 1000);
  fs.writeFileSync(path.join(home, 'events.jsonl'), text);

  assert.strictEqual(rotateEvents(home, { rotateAt: 1 << 30 }).rotated, false, 'under the limit: untouched');
  const r = rotateEvents(home, { rotateAt: 1000, keep: 5000 });
  assert.strictEqual(r.rotated, true);
  assert.ok(!fs.existsSync(path.join(home, 'events.rotating')));

  const archived = zlib.gunzipSync(fs.readFileSync(r.archive)).toString();
  const liveText = fs.readFileSync(path.join(home, 'events.jsonl'), 'utf8');
  assert.strictEqual(archived + liveText, text, 'archive + live tail is exactly the original');
  assert.ok(liveText.startsWith('{'), 'the live file starts on a whole line');
});

test('2026-09-18 readEvents orders by time when the kept tail lands after newer hook lines', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'evorder-'));
  const T = Date.parse('2026-09-18T10:00:00Z');
  fs.writeFileSync(path.join(home, 'events.jsonl'), line(3, T + 3000) + line(1, T + 1000) + line(2, T + 2000));
  const ev = S.readEvents(home);
  assert.deepStrictEqual(ev.events.map((e) => e.n), [1, 2, 3]);
});
