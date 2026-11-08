#!/usr/bin/env node
/**
 * tony-log.js — Tony's accuracy log, for checking how accurate the model is. Nothing else.
 *
 *   SubagentStop, when the agent that stopped is Tony: reads Tony's own transcript for counts only and appends one
 *     {type:"tony"} line to <Hub>/50-AI/logs/tony/<YYYY-MM>.jsonl (the Central month).
 *   UserPromptSubmit: when this chat's last Tony line has no outcome yet, reads the person's next message for a few
 *     plain words (thanks / that's wrong / undo) and appends one {type:"tony-outcome"} line. Only the next message
 *     counts; the message itself is never written.
 *
 * A line holds: the time (CDT), the client code (C01..C9999, nothing else of the client), the task type (a fixed
 * list), the tool names Tony used and how often, steps the person refused, whether he was stopped, the model and how
 * long it took. It never holds the request, Tony's words, a tool's input or result, a name, an amount, a memo, bank
 * text or a file's contents: those are read only to count, and only the fixed fields below are written.
 *
 * Rules, as office-hook.js: it never fails the session (always exit 0), never writes to stdout (a UserPromptSubmit
 * hook's stdout would reach the chat), never waits on the network.
 * The Hub: argv[3], else $WW_HUB, else the nearest folder at or above the chat's project folder (or its cwd). Each must
 * have the Workspace's .hub/ record; a CLAUDE.md alone is any code project and never counts. No Hub: nothing is written.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MAX_TRANSCRIPT = 50 * 1024 * 1024;
const TONY = /(^|:)tony$/i;
const CODE = /\b(C\d{2,4})\b/;
// The task, from the request's words. Only the label is kept. First match wins.
const TASKS = [
  ['setup', /\b(set ?up|onboard\w*|new client)\b/i],
  ['catch-up', /\bcatch[- ]?up\b/i],
  ['close', /\b(close|closing|month[- ]end|year[- ]end)\b/i],
  ['reconcile', /\breconcil\w*/i],
  ['journal-entry', /\b(journal|je|accrual\w*|adjusting)\b/i],
  ['bank-coding', /\b(cod(e|es|ing)|categori[sz]\w*|bank|card|transactions?|lines?)\b/i],
  ['match', /\bmatch\w*/i],
  ['report', /\b(report|p&l|profit and loss|balance sheet|financials?)\b/i],
  ['question', /\?/],
];
// What the person's next message says about Tony's work. First match wins; no match is "unclear".
const OUTCOMES = [
  ['rejected', /\b(undo|revert|roll ?back|scrap (it|that|this)|start over|throw (it|that|this) (out|away)|don'?t (post|use|send|save) (it|that|this))\b/i],
  ['corrected', /\b(wrong|incorrect|not (right|correct)|mistake|fix|redo|should (be|have|go)|instead|change (it|that|this|the)|actually)\b|(^|\s)no[,.!]/i],
  ['accepted', /\b(thanks|thank you|looks (good|right)|good job|great|perfect|approved?|correct|that'?s right|well done|yes|ok|okay|nice|good)\b/i],
];
const REFUSED = /doesn'?t want to proceed|tool use was rejected/i;
const STOPPED = /\[Request interrupted by user/i;

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch (_) { return false; } };

/** A real Hub: a folder with the Workspace's .hub record. A CLAUDE.md alone is any project, never a Hub here. */
const isHub = (d) => !!d && isDir(path.join(d, '.hub'));

/** The Hub this chat belongs to, or null (then nothing is written). */
function findHub(payload, argvHub, env) {
  if (argvHub && isHub(argvHub)) return path.resolve(argvHub);
  const ww = env.WW_HUB && env.WW_HUB.trim();
  if (ww && isHub(ww)) return path.resolve(ww);
  const starts = [env.CLAUDE_PROJECT_DIR, payload && payload.cwd].filter((s) => typeof s === 'string' && s.trim());
  for (const s of starts) {
    let d = path.resolve(s);
    for (let i = 0; i < 8; i++) {
      if (isHub(d)) return d;
      const up = path.dirname(d);
      if (up === d) break;
      d = up;
    }
  }
  return null;
}

const CENTRAL = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const parts = (d) => Object.fromEntries(CENTRAL.formatToParts(d).map((x) => [x.type, x.value]));
/** YYYY-MM-DD HH:MM CDT (the house writes CDT all year). */
const cdt = (d) => { const p = parts(d); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} CDT`; };
const monthOf = (d) => { const p = parts(d); return `${p.year}-${p.month}`; };
const logFile = (hub, month) => path.join(hub, '50-AI', 'logs', 'tony', `${month}.jsonl`);

/** The text blocks of a transcript message (a string, or an array of blocks). */
function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((b) => (b && b.type === 'text' && typeof b.text === 'string' ? b.text : typeof b === 'string' ? b : '')).join('\n');
}
const resultText = (b) => (typeof b.content === 'string' ? b.content : textOf(b.content));

/** Counts from Tony's transcript. Text is read only to count; none of it is returned. */
function readTranscript(file) {
  const out = { client: null, task: 'other', tools: {}, steps: 0, refused_steps: 0, stopped: false, models: [], first: null, last: null };
  let raw = '';
  try {
    if (fs.statSync(file).size > MAX_TRANSCRIPT) return out;
    raw = fs.readFileSync(file, 'utf8');
  } catch (_) { return out; }
  let asked = false;
  for (const lineText of raw.split(/\r?\n/)) {
    if (!lineText.trim()) continue;
    let e;
    try { e = JSON.parse(lineText); } catch (_) { continue; }
    if (!e || typeof e !== 'object') continue;
    const t = Date.parse(e.timestamp);
    if (Number.isFinite(t)) { if (out.first === null || t < out.first) out.first = t; if (out.last === null || t > out.last) out.last = t; }
    const msg = e.message && typeof e.message === 'object' ? e.message : null;
    if (!msg) continue;
    if (e.type === 'user') {
      const content = msg.content;
      if (!asked) {
        const req = textOf(content);
        if (req.trim()) {
          asked = true;
          const m = req.match(CODE);
          out.client = m ? m[1].toUpperCase() : null;
          const hit = TASKS.find(([, re]) => re.test(req));
          out.task = hit ? hit[0] : 'other';
          continue;
        }
      }
      if (STOPPED.test(textOf(content))) out.stopped = true;
      if (Array.isArray(content)) {
        for (const b of content) {
          if (!b || b.type !== 'tool_result') continue;
          const rt = resultText(b);
          if (REFUSED.test(rt)) out.refused_steps++;
          if (STOPPED.test(rt)) out.stopped = true;
        }
      }
    } else if (e.type === 'assistant') {
      if (typeof msg.model === 'string' && msg.model && !msg.model.startsWith('<') && !out.models.includes(msg.model)) out.models.push(msg.model.slice(0, 60));
      if (Array.isArray(msg.content)) {
        for (const b of msg.content) {
          if (!b || b.type !== 'tool_use' || typeof b.name !== 'string') continue;
          const name = b.name.slice(0, 80);
          if (!(name in out.tools) && Object.keys(out.tools).length >= 40) continue;
          out.tools[name] = (out.tools[name] || 0) + 1;
          out.steps++;
        }
      }
    }
  }
  return out;
}

/** The {type:"tony"} line for a SubagentStop payload, or null when the agent is not Tony. */
function turnLine(payload, now) {
  if (!payload || !TONY.test(String(payload.agent_type || ''))) return null;
  const tr = typeof payload.agent_transcript_path === 'string' ? readTranscript(payload.agent_transcript_path) : readTranscript('');
  const ended = new Date(tr.last || now.getTime());
  return {
    v: 1, type: 'tony', at: cdt(ended), month: monthOf(ended),
    session: String(payload.session_id || '').slice(0, 64), run: String(payload.agent_id || '').slice(0, 64),
    client: tr.client, task: tr.task, tools: tr.tools, steps: tr.steps,
    refused_steps: tr.refused_steps, stopped: tr.stopped,
    outcome: tr.refused_steps || tr.stopped ? 'rejected' : 'unmarked',
    model: tr.models[0] || null, models: tr.models.length > 1 ? tr.models : undefined,
    started: tr.first !== null ? cdt(new Date(tr.first)) : null,
    ms: tr.first !== null && tr.last !== null ? tr.last - tr.first : null,
  };
}

/** The person's verdict on Tony's last work in this chat, from their next message: a label, never the words. */
const outcomeOf = (prompt) => { const s = String(prompt || '').slice(0, 400); const hit = OUTCOMES.find(([, re]) => re.test(s)); return hit ? hit[0] : 'unclear'; };

/** The {type:"tony-outcome"} line for a UserPromptSubmit payload, or null when there is no open Tony line here. */
function outcomeLine(hub, payload, now) {
  const session = String((payload && payload.session_id) || '');
  if (!session) return null;
  // This month's file, else last month's (a run just before midnight on the last day). The mark goes in the run's file.
  const p = parts(now);
  const prev = Number(p.month) === 1 ? `${Number(p.year) - 1}-12` : `${p.year}-${String(Number(p.month) - 1).padStart(2, '0')}`;
  for (const month of [monthOf(now), prev]) {
    let text = '';
    try { text = fs.readFileSync(logFile(hub, month), 'utf8'); } catch (_) { continue; }
    let last = null;
    const marked = new Set();
    for (const raw of text.split(/\r?\n/)) {
      if (!raw.trim()) continue;
      let j;
      try { j = JSON.parse(raw); } catch (_) { continue; }
      if (j && j.type === 'tony' && j.session === session) last = j;
      else if (j && j.type === 'tony-outcome' && j.session === session) marked.add(j.run);
    }
    if (!last) continue;
    if (marked.has(last.run)) return null;
    return { v: 1, type: 'tony-outcome', at: cdt(now), month, session, run: last.run, outcome: outcomeOf(payload.prompt), from: 'next message' };
  }
  return null;
}

function append(hub, line) {
  const f = logFile(hub, line.month);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.appendFileSync(f, JSON.stringify(line) + '\n', 'utf8');
}

function main(argv, env, input, now) {
  let payload = null;
  try { payload = JSON.parse(input); } catch (_) { return null; }
  if (!payload || typeof payload !== 'object') return null;
  const ev = payload.hook_event_name || argv[2];
  if (ev !== 'SubagentStop' && ev !== 'UserPromptSubmit') return null;
  const hub = findHub(payload, argv[3], env);
  if (!hub) return null;
  const line = ev === 'SubagentStop' ? turnLine(payload, now) : outcomeLine(hub, payload, now);
  if (line) append(hub, line);
  return line;
}

if (require.main === module) {
  try {
    let input = '';
    try { input = fs.readFileSync(0, 'utf8'); } catch (_) { input = ''; }
    main(process.argv, process.env, input, new Date());
  } catch (_) { /* rule 1: never fail the session */ }
  process.exitCode = 0;
}

module.exports = { main, turnLine, outcomeOf, readTranscript, findHub, logFile, monthOf, cdt };
