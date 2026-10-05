'use strict';

/**
 * permission-detector.test.js — acceptance ALM-04, ALM-08.
 *
 * The positive-and-negative control pair, replayed from real recorded
 * canaries (tests/fixtures/), not synthetic fixtures: PermissionRequest
 * and Notification:permission_prompt were never observed in non-interactive
 * `-p` mode when these were recorded, so the proven arming path is an unclosed
 * tool_use_id (a PreToolUse with no matching PostToolUse). The recordings are
 * kept exactly as captured except their cwd and transcript paths, which were
 * replaced with neutral ones.
 *
 *   canary-events.jsonl              — healthy: every tool_use_id closes.
 *   canary3-permission-write.jsonl   — blocked: one Write never closes.
 *
 * A detector that fires on both, or on neither, is a FAIL.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const S = require('../src/server/sources');
const { detectAlarms } = require('../src/server/reader');

const cfg = {
  liveness: { desk_floor_ms: 120000 },
  alarms: {
    lane_idle_wall_ms: 480000,
    lane_idle_page_ms: 1200000,
    stall_after_turn_end_ms: 300000,
    permission_undecided_ms: 45000,
  },
};

const PROBE_DIR = path.join(__dirname, 'fixtures');
const HEALTHY_PATH = path.join(PROBE_DIR, 'canary-events.jsonl');
const BLOCKED_PATH = path.join(PROBE_DIR, 'canary3-permission-write.jsonl');

function loadCanary(p) {
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (e) {
    // Never skip or substitute a missing fixture — fail loudly with the path.
    assert.fail(`required canary fixture is missing: ${p} (${e.message})`);
    return [];
  }
  const events = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const o = JSON.parse(line);
    o._t = Date.parse(o.received_at);
    events.push(o);
  }
  assert.ok(events.length > 0, `canary fixture parsed to zero events: ${p}`);
  return events;
}

function permissionAlarms(events) {
  const lastAt = Math.max(...events.map((e) => e._t));
  const now = lastAt + cfg.alarms.permission_undecided_ms + 60000; // well clear of the threshold
  const { desks, openToolCalls } = S.foldDesks(events, now, cfg);
  const alarms = detectAlarms({
    now, cfg, desks, openToolCalls,
    comms: null, eventsPath: 'events.jsonl',
  });
  return alarms.filter((a) => a.condition === 'permission-undecided');
}

test('ALM-04 and ALM-08 the permission detector is proven against both real canaries: zero alarms replaying the healthy one, exactly one replaying the blocked one, armed by the unclosed tool_use_id with the feed marked unproven', () => {
  const healthyAlarms = permissionAlarms(loadCanary(HEALTHY_PATH));
  assert.equal(healthyAlarms.length, 0, 'every tool_use_id in the healthy canary closes — it must raise no permission alarm');

  const blockedAlarms = permissionAlarms(loadCanary(BLOCKED_PATH));
  assert.equal(blockedAlarms.length, 1, 'the one unclosed Write tool_use_id in the blocked canary must raise exactly one permission alarm');
  assert.equal(blockedAlarms[0].armed_by, 'unclosed-tool_use_id');
  assert.equal(blockedAlarms[0].feed_proven, false, 'PermissionRequest/Notification was never observed in the recordings — the feed is unproven');
});
