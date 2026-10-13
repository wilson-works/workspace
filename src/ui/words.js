// words.js — how a session's activity becomes a sentence a person reads.

const BY_TOOL = {
  SendMessage: 'Messaging a helper',
  ScheduleWakeup: 'Setting itself a timer',
  Skill: 'Running a skill',
  ToolSearch: 'Loading tools',
  TaskStop: 'Stopping a background job',
  AskUserQuestion: 'Asking you a question',
  ExitPlanMode: 'Presenting a plan',
};

const BY_VERB = {
  running: 'Running a command',
  editing: 'Editing files',
  reading: 'Reading files',
  searching: 'Searching',
  delegating: 'Handing work to a helper',
  fetching: 'Looking something up online',
  planning: 'Planning',
  working: 'Working',
};

/** One step {verb, tool, summary} -> a sentence. The session's own summary wins. */
export function stepText(step) {
  if (!step) return null;
  if (step.summary) return step.summary;
  if (step.tool && BY_TOOL[step.tool]) return BY_TOOL[step.tool];
  if (step.tool && step.tool.startsWith('mcp__chrome-devtools__')) return 'Working in the browser';
  if (step.tool && step.tool.startsWith('mcp__')) return 'Using a connected service';
  return BY_VERB[step.verb] || 'Working';
}

/** The headline for a session: what it is doing right now. */
export function nowText(s, ago) {
  // A start sent to another computer that has no session yet (mesh-dispatch.js): on its way, or why it didn't start.
  if (s.dispatch && s.dispatch.start) return s.dispatch.status === 'failed' ? s.dispatch.reason : `Sent to ${s.machine}. Waiting for it to start`;
  if (s.state === 'waiting') {
    const w = s.waiting || {};
    const out = (s.helpers || []).length;
    const base = w.kind === 'wakeup' ? 'Waiting on a timer it set'
      : w.kind === 'helpers' ? `Waiting for ${out > 1 ? `its ${out} helpers` : 'its helper'} to come back`
        : 'Waiting on a background job';
    return w.summary ? `${base} — ${w.summary}` : base;
  }
  // A session the office started (dispatch.js) between turns: a helper's turn went up to its lead as a report.
  if (s.state === 'idle' && s.dispatch && s.dispatch.turns > 0 && s.dispatch.status === 'idle') {
    return s.dispatch.parent ? `Reported back to ${s.dispatch.parent.name}` : 'Replied. Your note starts its next turn';
  }
  if (s.state === 'idle') return `Idle · last active ${ago(s.last_at)} ago`;
  const text = stepText(s.now);
  // A bare "Editing files" says little; the last thing the session described
  // itself doing, a moment earlier, says what the edit is for.
  if (s.now && !s.now.summary) {
    const ctx = (s.before || []).find((b) => b && b.summary);
    if (ctx) return `${text} — ${ctx.summary}`;
  }
  return text || 'Working';
}

/**
 * A session's status as a word for its dot, and since when: Working, Waiting, Idle; a session the office started says
 * Reported once its turn went up to its lead, and a start on its way to another computer says Sent or Not started.
 */
export function statusOf(s) {
  const w = s.waiting || {};
  if (s.dispatch && s.dispatch.start) {
    return s.dispatch.status === 'failed' ? { key: 'idle', word: 'Not started', since: s.started_at } : { key: 'waiting', word: 'Sent', since: s.started_at };
  }
  if (s.state === 'idle' && s.dispatch && s.dispatch.parent && s.dispatch.reported_at) return { key: 'reported', word: 'Reported', since: s.dispatch.reported_at };
  if (s.state === 'waiting') return { key: 'waiting', word: 'Waiting', since: w.since || s.last_at };
  if (s.state === 'idle') return { key: 'idle', word: 'Idle', since: s.last_at };
  return { key: 'working', word: 'Working', since: null };
}

export const MODEL_NAME = { opus: 'Opus', fable: 'Fable', sonnet: 'Sonnet', haiku: 'Haiku', unknown: 'Model unknown' };

export function modelLabel(model, family) {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(String(model || ''));
  if (m) return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] && m[3].length < 3 ? `.${m[3]}` : ''}`;
  return MODEL_NAME[family] || 'Model unknown';
}
