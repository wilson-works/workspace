'use strict';

/**
 * stall-arming.test.js — acceptance ALM-02, ALM-03.
 *
 * Drives sources.foldDesks() and reader.detectAlarms() directly with synthetic
 * event arrays and an explicit `now` — no files, no timers, no real clock.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
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

function stallAlarms(events, now) {
  const { desks, openToolCalls } = S.foldDesks(events, now, cfg);
  const alarms = detectAlarms({
    now, cfg, desks, openToolCalls,
    comms: null, eventsPath: 'events.jsonl',
  });
  return alarms.filter((a) => a.condition === 'turn-ended-no-next-event');
}

test('ALM-02 Stop does not arm the stall alarm while the desk has an open seat, but the same desk with the seat closed arms exactly once', () => {
  const t0 = 1_000_000;
  const now = t0 + 30 + 400000; // well past stall_after_turn_end_ms either way

  // Desk emits Stop while a SubagentStart is still open — no SubagentStop at all.
  const openSeatEvents = [
    { session_id: 'd1', hook_event_name: 'SessionStart', _t: t0, cwd: 'D:\\lane-a' },
    { session_id: 'd1', hook_event_name: 'UserPromptSubmit', _t: t0 + 10 },
    { session_id: 'd1', hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore', _t: t0 + 20 },
    { session_id: 'd1', hook_event_name: 'Stop', _t: t0 + 30 },
  ];
  assert.equal(stallAlarms(openSeatEvents, now).length, 0, 'a Stop with an open seat must never arm the stall alarm');

  // Positive control: the identical shape, but the seat closes before Stop.
  const closedSeatEvents = [
    { session_id: 'd2', hook_event_name: 'SessionStart', _t: t0, cwd: 'D:\\lane-a' },
    { session_id: 'd2', hook_event_name: 'UserPromptSubmit', _t: t0 + 10 },
    { session_id: 'd2', hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore', _t: t0 + 20 },
    { session_id: 'd2', hook_event_name: 'SubagentStop', agent_id: 'a1', _t: t0 + 25 },
    { session_id: 'd2', hook_event_name: 'Stop', _t: t0 + 30 },
  ];
  assert.equal(stallAlarms(closedSeatEvents, now).length, 1, 'the same desk with the seat closed must arm exactly once');
});

test('ALM-03 the liveness floor renders a desk stale after desk_floor_ms with no event of any kind, even when Stop was never emitted at all; a recently-active desk stays working', () => {
  const now = 2_000_000;
  const floor = cfg.liveness.desk_floor_ms;

  const events = [
    // 'silent': the max_turns silent-death case — no Stop, ever. Its last event
    // of any kind is just past the liveness floor.
    { session_id: 'silent', hook_event_name: 'SessionStart', _t: now - floor - 5000 },
    { session_id: 'silent', hook_event_name: 'UserPromptSubmit', _t: now - floor - 4000 },
    { session_id: 'silent', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 'tu1', _t: now - floor - 1000 },

    // 'active': positive control — a recent event well inside the floor.
    { session_id: 'active', hook_event_name: 'SessionStart', _t: now - 500000 },
    { session_id: 'active', hook_event_name: 'PreToolUse', tool_name: 'Read', tool_use_id: 'tu2', _t: now - 5000 },
  ];

  const { desks } = S.foldDesks(events, now, cfg);
  assert.equal(
    desks.get('silent').state,
    'stale',
    'no event of any kind for desk_floor_ms must render stale, regardless of what the stream last implied'
  );
  assert.equal(desks.get('active').state, 'working', 'positive control: a desk with a recent event must read working');
});
