#!/usr/bin/env node
'use strict';

/**
 * office-turn.js - one turn of a session the office started (dispatch.js), or a few back to back when notes keep
 * arriving. dispatch.startTurn() starts it detached; nothing else should.
 *
 *   node bin/office-turn.js <job id>
 *
 * In order:
 *   1. takes the job's turn lock (<id>.turn.json, created exclusively), or leaves: one turn at a time;
 *   2. claims the notes waiting in the session's inbox (the same atomic rename as the office's hooks) and makes the
 *      prompt: the brief on its first turn, then the notes;
 *   3. runs Claude Code headless in the job's working folder (the Hub, or the home folder) with the job's model, effort and permission mode, the prompt on stdin
 *      and its stream (JSON) read here line by line, under the job's time cap;
 *   4. records what came of it: steps, how long, whether it finished, why not. Never a word of the stream: the
 *      session's own transcript holds its conversation, and the office reads that on request (dispatch.talk);
 *   5. a helper's final reply goes to its lead as an office note, which starts the lead's next turn (or wakes a chat);
 *   6. when more notes arrived meanwhile, another turn; then the lock goes and the job reads idle.
 * Its own log (<home>/dispatch/logs/<id>.log) says when a turn started and how it ended, nothing more.
 */

const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const D = require('../src/server/dispatch');
const inbox = require('../src/server/inbox');

const MAX_CHAINED = 6;
const EXIT_WAIT_MS = 45 * 1000;
const PROGRESS_MS = 3000;

const id = process.argv[2];
const home = D.homeDir();
const logFile = () => path.join(D.dirs(home).logs, `${id}.log`);
function note(m) {
  try {
    fs.mkdirSync(D.dirs(home).logs, { recursive: true });
    fs.appendFileSync(logFile(), `[${new Date().toISOString()}] ${m}\n`);
  } catch (_) { /* no log */ }
}

const lockFile = () => D.file(home, id, '.turn.json');
function takeLock() {
  for (let i = 0; i < 2; i += 1) {
    try {
      const fd = fs.openSync(lockFile(), 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, started_at: Date.now() }));
      fs.closeSync(fd);
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') return false;
      let l = null;
      try { l = JSON.parse(fs.readFileSync(lockFile(), 'utf8')); } catch (_) { l = null; }
      if (l && D.alive(l.pid)) return false;
      // A dead runner's lock is moved aside by rename, which only one runner can win; the loser finds it gone and
      // tries the exclusive create again (or meets the winner's lock there).
      const stale = `${lockFile()}.stale-${process.pid}`;
      try { fs.renameSync(lockFile(), stale); } catch (_) { continue; }
      try { fs.rmSync(stale, { force: true }); } catch (_) { /* a leftover name, not a lock */ }
    }
  }
  return false;
}
function releaseLock() {
  try {
    const l = JSON.parse(fs.readFileSync(lockFile(), 'utf8'));
    if (l && l.pid === process.pid) fs.rmSync(lockFile(), { force: true });
  } catch (_) { /* gone */ }
}

/** The notes waiting for the session, claimed so no hook hands them over twice; delivery recorded first. */
function claimNotes(sessionId) {
  const dir = inbox.inboxDir(home);
  const box = path.join(dir, `${sessionId}.jsonl`);
  if (!fs.existsSync(box)) return [];
  const claim = `${box}.claim-${process.pid}`;
  try { fs.renameSync(box, claim); } catch (_) { return []; }
  let notes = [];
  try {
    notes = fs.readFileSync(claim, 'utf8').split(/\r?\n/).filter((l) => l.trim())
      .map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
  } catch (_) { notes = []; }
  const now = Date.now();
  try {
    if (notes.length) {
      fs.mkdirSync(path.join(dir, 'delivered'), { recursive: true });
      fs.appendFileSync(path.join(dir, 'delivered', `${sessionId}.jsonl`),
        notes.map((n) => JSON.stringify({ id: n.id, queued_at: n.queued_at, delivered_at: now, via: 'Dispatch' })).join('\n') + '\n', 'utf8');
    }
    fs.unlinkSync(claim);
  } catch (_) { /* delivered below all the same */ }
  return notes;
}

function killTree(pid) {
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 15000 });
    else process.kill(pid, 'SIGTERM');
  } catch (_) { /* gone already */ }
}

/** Why a turn failed, in plain words, from what Claude Code printed on stderr (never shown itself). */
function failWords(code, stderr, result) {
  const s = `${stderr || ''} ${(result && result.subtype) || ''}`;
  if (/usage limit|rate.?limit|quota/i.test(s)) return "The plan's usage limit was reached. A note tries again.";
  if (/model/i.test(s) && /(not (found|available|supported)|invalid|unknown|requires)/i.test(s)) return "That model isn't available to Claude Code here.";
  if (/log ?in|auth|credential|unauthori[sz]ed/i.test(s)) return 'Claude Code on this computer needs signing in again.';
  if (/max.?turns/i.test(s)) return 'It ran out of turns before finishing.';
  return `Claude Code stopped with code ${code == null ? 'unknown' : code}.`;
}

/** One Claude Code turn. Resolves { ok, stop, ms, steps, out_tokens, denials, text, error, started }. */
function runTurn(job, prompt, claude, workRoot) {
  return new Promise((resolve) => {
    const system = (() => { try { return fs.readFileSync(D.file(home, job.id, '.system.md'), 'utf8'); } catch (_) { return D.systemPrompt(job); } })();
    const args = ['-p', '--output-format', 'stream-json', '--verbose',
      '--model', job.model_id, '--effort', job.effort, '--permission-mode', job.mode, '--permission-prompts', 'none',
      '-n', job.name, '--append-system-prompt', system];
    if (job.session_started) args.push('--resume', job.session_id);
    else args.push('--session-id', job.session_id);
    if (job.as) args.push('--agent', job.as);
    if (job.place_dir) args.push('--add-dir', job.place_dir);
    args.push('--disallowedTools', 'AskUserQuestion', 'CronCreate', 'ScheduleWakeup');

    const env = D.sessionFreeEnv(process.env, home);
    Object.assign(env, { WORKSPACE_DISPATCH: job.id, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_PAGER: 'cat' });
    const started = Date.now();
    let child;
    try {
      child = spawn(claude, args, { cwd: workRoot, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch (e) {
      resolve({ ok: false, stop: 'error', ms: 0, steps: 0, error: `Claude Code could not be started (${String(e.message).slice(0, 120)}).` });
      return;
    }
    let buf = '';
    let errTail = '';
    let steps = 0;
    let result = null;
    let init = false;
    let lastWrite = 0;
    let capped = false;
    let settled = false;
    const progress = (force) => {
      const now = Date.now();
      if (!force && now - lastWrite < PROGRESS_MS) return;
      lastWrite = now;
      D.updateJob(home, job.id, (j) => Object.assign(j, { turn: Object.assign({}, j.turn, { steps }) }));
    };
    const onLine = (line) => {
      if (!line || line[0] !== '{') return;
      let j;
      try { j = JSON.parse(line); } catch (_) { return; }
      if (j.type === 'system' && j.subtype === 'init') {
        init = true;
        D.updateJob(home, job.id, (x) => Object.assign(x, { session_started: true, model_actual: typeof j.model === 'string' ? j.model.slice(0, 60) : x.model_actual }));
      } else if (j.type === 'assistant' && j.message && Array.isArray(j.message.content) && !j.parent_tool_use_id) {
        steps += j.message.content.filter((b) => b && b.type === 'tool_use').length;
        progress(false);
      } else if (j.type === 'result') {
        result = j;
        // The answer is in. The process may wait a little for its own hooks; that wait is not the session's work.
        setTimeout(() => { if (!settled) killTree(child.pid); }, EXIT_WAIT_MS).unref();
      }
    };
    child.stdout.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, i).replace(/\r$/, '')); buf = buf.slice(i + 1); }
    });
    child.stderr.on('data', (chunk) => { errTail = (errTail + chunk.toString('utf8')).slice(-2000); });
    child.on('error', (e) => { errTail += ` ${e.message}`; });
    child.stdin.on('error', () => { /* it left before reading: the exit says why */ });
    child.stdin.end(prompt, 'utf8');
    const cap = setTimeout(() => { capped = true; note(`cap of ${job.cap_min} min reached: stopping Claude Code`); killTree(child.pid); }, job.cap_min * 60 * 1000);
    child.on('close', (code) => {
      settled = true;
      clearTimeout(cap);
      if (buf) onLine(buf);
      const ms = Date.now() - started;
      const out = {
        ms, steps, started: init,
        out_tokens: result && result.usage ? result.usage.output_tokens || null : null,
        denials: result && Array.isArray(result.permission_denials) ? result.permission_denials.length : 0,
        text: result && typeof result.result === 'string' ? result.result : '',
      };
      if (capped) resolve(Object.assign(out, { ok: false, stop: 'cap', error: `It ran past its ${job.cap_min}-minute cap and was stopped.` }));
      else if (result && !result.is_error) resolve(Object.assign(out, { ok: true, stop: 'done', error: null }));
      else resolve(Object.assign(out, { ok: false, stop: 'error', error: failWords(code, errTail, result) }));
    });
  });
}

/** A helper's turn is done: its final reply, or why there is none, goes to its lead as an office note. */
function reportUp(job, r) {
  if (!job.parent) return;
  const c = D.loadConfig();
  const mins = Math.max(1, Math.round(r.ms / 60000));
  // What it was asked, in a line, so the lead knows which piece this is (a lead may have several out).
  const asked = D.readBrief(home, job.id).replace(/\s+/g, ' ').trim();
  const head = `${job.name} (${job.model_label}, ${job.effort} effort) ${r.ok ? 'finished' : 'stopped'} after ${mins} min and ${r.steps} step${r.steps === 1 ? '' : 's'}.`
    + `\nYou asked: ${asked.length > 240 ? `${asked.slice(0, 240)}…` : asked}`;
  let body = r.ok ? (r.text || '(It ended its turn without a final message.)') : `It could not finish: ${r.error}`;
  const room = c.limits.report_max_chars - head.length - 120;
  if (body.length > room) body = `${body.slice(0, room)}\n(cut here; the rest is in its conversation on the office)`;
  const sent = inbox.enqueue(home, job.parent.session_id, `${head}\n\n${body}`, 'helper',
    { max: c.limits.report_max_chars, from_name: job.name, ownerCopy: !job.client_work });
  note(sent.ok ? `report sent up to ${job.parent.session_id.slice(0, 8)} (${sent.id})` : `report not sent: ${sent.error}`);
  if (sent.ok) D.updateJob(home, job.id, { reported_at: Date.now() });
}

/**
 * A session the owner started, with "buzz me when it replies" on: one push to their phone as its turn ends. It says
 * that it replied, never what: a lock screen is not the place for a session's words. Tapping it opens its chart.
 * Only a turn that answers the owner's own words buzzes (the brief, a note, an answer to a question), never one
 * started by a helper's report, the group chat or an office nudge: the phone buzzes for questions and for direct
 * replies, nothing else.
 */
function buzz(job, r, fromOwner) {
  if (!job || !job.notify || job.parent || !fromOwner) return;
  try {
    const push = require('../src/server/push');
    const key = encodeURIComponent(`${job.machine}:${job.session_id}`);
    push.sendAll(home, {
      title: `${job.name} ${r.ok ? 'replied' : 'stopped'}`,
      body: r.ok ? 'Open the office to read it.' : 'Open the office to see why.',
      tag: `workspace-reply-${job.id}`, url: `/#/team/${key}`,
    }, { kind: 'reply' }).then((x) => note(`reply buzz: ${x.delivered} of ${x.devices} devices`)).catch(() => null);
  } catch (e) { note(`reply buzz not sent: ${String(e && e.message).slice(0, 120)}`); }
}

async function main() {
  if (!D.ID_RE.test(String(id || ''))) return;
  let job = D.readJob(home, id);
  if (!job) return;
  if (!takeLock()) { note('a turn is already running: leaving'); return; }
  const claude = D.findClaude();
  const workRoot = job.work_root || D.workRoot();
  try {
    if (!claude || !require('fs').existsSync(workRoot)) {
      D.updateJob(home, id, { status: 'failed', reason: !claude ? "Claude Code isn't installed where the office can find it." : "Its working folder can't be found on this computer." });
      return;
    }
    for (let k = 0; k < MAX_CHAINED; k += 1) {
      job = D.readJob(home, id);
      // Closed, or stopped while it was still starting (the tick and office-spawn set 'starting' before a runner starts).
      if (!job || job.status === 'closed' || job.status === 'stopped') break;
      const c = D.loadConfig();
      const hour = (job.turn_times || []).filter((t) => Date.now() - t < 3600 * 1000).length;
      if (hour >= c.limits.max_turns_per_hour) {
        D.updateJob(home, id, { status: 'idle', paused: `It has had ${c.limits.max_turns_per_hour} turns this hour; your note waits for the next.` });
        break;
      }
      const first = !job.turns && !job.session_started;
      const notes = claimNotes(job.session_id);
      if (!first && !notes.length) break;
      const parts = [];
      if (first) parts.push(D.readBrief(home, id));
      for (const n of notes) parts.push(D.noteText(n));
      const prompt = parts.filter(Boolean).join('\n\n---\n\n');
      const n = (job.turns || 0) + 1;
      const startedAt = Date.now();
      D.updateJob(home, id, (j) => Object.assign(j, {
        status: 'working', reason: null, paused: null,
        turn: { n, started_at: startedAt, ended_at: null, ok: null, ms: null, steps: 0, stop: null, denials: 0, notes: notes.length },
        turn_times: (j.turn_times || []).concat([startedAt]).slice(-50),
      }));
      note(`turn ${n} started (${first ? 'the brief' : `${notes.length} note${notes.length === 1 ? '' : 's'}`}; ${job.model_id}, ${job.effort}, ${job.mode})`);
      const r = await runTurn(job, prompt, claude, workRoot);
      note(`turn ${n} ${r.ok ? 'finished' : `ended: ${r.stop}`} in ${Math.round(r.ms / 1000)} s, ${r.steps} steps${r.denials ? `, ${r.denials} refused` : ''}`);
      job = D.updateJob(home, id, (j) => {
        // The owner may have pressed Stop or Close while it ran: that word stands.
        const kept = j.status === 'stopped' || j.status === 'closed';
        return Object.assign(j, {
          status: kept ? j.status : r.ok ? 'idle' : r.stop === 'cap' ? 'stopped' : 'failed',
          reason: kept ? j.reason : r.ok ? null : r.error,
          turns: (j.turns || 0) + 1, steps: (j.steps || 0) + r.steps,
          turn: { n, started_at: startedAt, ended_at: Date.now(), ok: r.ok, ms: r.ms, steps: r.steps, stop: r.stop, denials: r.denials, out_tokens: r.out_tokens, notes: notes.length },
        });
      });
      reportUp(job, r);
      buzz(job, r, first || notes.some((x) => (x.from || 'owner') === 'owner'));
      if (!job || !r.ok || job.status !== 'idle') break;
    }
  } catch (e) {
    note(`runner error: ${String(e && e.message).slice(0, 300)}`);
    D.updateJob(home, id, (j) => Object.assign(j, { status: j.status === 'closed' ? 'closed' : 'failed', reason: 'Its turn stopped on an error in the office.' }));
  } finally {
    const j = D.readJob(home, id);
    if (j && j.status === 'starting') D.updateJob(home, id, { status: 'idle' });
    releaseLock();
  }
}

main().catch((e) => { note(`runner stopped: ${String(e && e.message).slice(0, 300)}`); releaseLock(); });
