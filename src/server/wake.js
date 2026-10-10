'use strict';

/**
 * wake.js — Wake, Sleep and Restart on an agent's door, and Sleep all.
 *
 *   POST /api/agents/<key>/wake      start its dashboard; answers once its probe does (or after 15 s: starting)
 *   POST /api/agents/<key>/sleep     stop its dashboard, and every run it has going
 *   POST /api/agents/<key>/restart   sleep, then wake (what a dashboard needs after its code changes)
 *   POST /api/agents/sleep-all       sleep every agent awake on this computer, and stop their runs
 *
 * What makes this safe behind a button your phone can press:
 *   - What runs comes only from the agent's own agent.json `start`, in its own folder, through the same
 *     start every other way of starting it uses (agents/lib/agents.js startAgent: no shell, detached,
 *     its pid in dashboard/.pid). A request names an agent key and nothing else.
 *   - Only an agent installed on this computer (an agent.json in an agents folder) with a `start` and a
 *     probe port. A planned agent is never woken: its door stays shut.
 *   - Sleep stops only the pid in its dashboard/.pid, and only while that process is still the program
 *     its `start` names. Never by name, never by port. Anything else is refused in words.
 *   - Its runs: node processes whose command line names something inside the agent's own folder by its
 *     full path (a research run its dashboard started, say). A run is started on its own, so stopping
 *     the dashboard alone leaves it going. Found by that path, never by a name; the office itself is
 *     never on the list.
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const contract = require('../../agents/lib/agents');
const { probeOnce } = require('./agents');

const WAKE_WAIT_MS = 15000;
const SLEEP_WAIT_MS = 8000;
const POLL_MS = 500;
const KEY_RE = /^[a-z][a-z0-9-]{0,30}$/;

const pidFileOf = (dir) => path.join(dir, 'dashboard', '.pid');

function readPid(dir) {
  try {
    const pid = Number(fs.readFileSync(pidFileOf(dir), 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch (_) { return null; }
}

/** Is a process alive? (signal 0 checks without touching it; EPERM means it exists.) */
function aliveDefault(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** The command line of a live pid, or null. The pid is a checked integer before it reaches the command. */
function commandLineDefault(pid) {
  return new Promise((resolve) => {
    if (!Number.isInteger(pid) || pid <= 0) { resolve(null); return; }
    const done = (err, out) => resolve(err ? null : String(out).trim() || null);
    if (process.platform === 'win32') {
      const ps = `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`;
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 20000, windowsHide: true }, done);
      return;
    }
    execFile('ps', ['-ww', '-o', 'command=', '-p', String(pid)], { timeout: 10000 }, done);
  });
}

/** Every node process this account can see: [{ pid, cmd }]. One whose command line is hidden is left out. */
function listNodeDefault() {
  return new Promise((resolve) => {
    const opts = { timeout: 20000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 };
    if (process.platform === 'win32') {
      const ps = 'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" | ForEach-Object { if ($_.CommandLine) { [string]$_.ProcessId + [char]9 + $_.CommandLine } }';
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], opts, (err, out) => {
        if (err) { resolve([]); return; }
        resolve(String(out).split(/\r?\n/).map((l) => /^(\d+)\t(.+)$/.exec(l.trim())).filter(Boolean)
          .map((m) => ({ pid: Number(m[1]), cmd: m[2] })));
      });
      return;
    }
    execFile('ps', ['-axww', '-o', 'pid=', '-o', 'command='], opts, (err, out) => {
      if (err) { resolve([]); return; }
      resolve(String(out).split('\n').map((l) => /^\s*(\d+)\s+(.+)$/.exec(l)).filter(Boolean)
        .map((m) => ({ pid: Number(m[1]), cmd: m[2].trim() }))
        .filter((p) => /^(?:\S*\/)?node(?:\s|$)/.test(p.cmd)));
    });
  });
}

/** Stop a pid and what it started (Windows needs /F: a node with no console has no window to close). */
function killDefault(pid) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { timeout: 15000, windowsHide: true }, () => resolve());
      return;
    }
    try { process.kill(pid, 'SIGTERM'); } catch (_) { /* gone already */ }
    resolve();
  });
}

/** Is this command line the program `argv` names: the same program, with every one of its arguments? */
function isProgram(cmdLine, argv) {
  const norm = (x) => String(x || '').toLowerCase().replace(/\\/g, '/').replace(/"/g, '');
  const base = (p) => path.posix.basename(norm(p)).replace(/\.exe$/, '');
  const exe = /^\s*"([^"]+)"|^\s*(\S+)/.exec(String(cmdLine || ''));
  if (!exe || !argv || !argv.length) return false;
  if (base(exe[1] || exe[2]) !== base(argv[0] === 'node' ? process.execPath : argv[0])) return false;
  const line = norm(cmdLine);
  return argv.slice(1).every((x) => line.includes(norm(x)));
}

/**
 * An agent's runs: node processes whose command line names something inside its folder `dir` by full
 * path, at the start of an argument (after a space, a quote or "="). `except`: pids never on the list.
 */
function runsOf(dir, procs, except) {
  const norm = (x) => String(x || '').toLowerCase().replace(/\\/g, '/');
  const root = `${norm(dir).replace(/\/+$/, '')}/`;
  return (procs || []).filter((p) => {
    if (except && except.has(p.pid)) return false;
    const line = norm(p.cmd);
    for (let i = line.indexOf(root); i >= 0; i = line.indexOf(root, i + 1)) {
      if (i === 0 || /[\s"'=]/.test(line[i - 1])) return true;
    }
    return false;
  });
}

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const names = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0]);

/**
 * @param opts { agents (agents.js createAgents: its all()), self, onChange,
 *               probe, start, commandLine, listNode, kill, alive, waitMs, sleepWaitMs, pollMs }
 *   (everything but agents and self can be swapped, for the tests)
 */
function createWaker(opts) {
  const o = opts || {};
  const self = o.self;
  const probe = o.probe || probeOnce;
  const start = o.start || contract.startAgent;
  const commandLine = o.commandLine || commandLineDefault;
  const listNode = o.listNode || listNodeDefault;
  const kill = o.kill || killDefault;
  const alive = o.alive || aliveDefault;
  const waitMs = o.waitMs != null ? o.waitMs : WAKE_WAIT_MS;
  const sleepWaitMs = o.sleepWaitMs != null ? o.sleepWaitMs : SLEEP_WAIT_MS;
  const pollMs = o.pollMs || POLL_MS;
  const changed = () => { try { if (o.onChange) o.onChange(); } catch (_) { /* the view catches up on its own */ } };
  const inFlight = new Map(); // key -> Promise of a wake
  const list = () => (o.agents && typeof o.agents.all === 'function' ? o.agents.all() : []);
  const reply = (status, message, extra) => Object.assign({ ok: status < 400, status, message }, extra || {});

  /** Why the office cannot wake or stop this agent, in words, or null when it can. */
  function whyNot(a) {
    if (a.machine && a.machine !== self) return `${a.name} runs on ${a.machine}, so only the office there can wake or stop ${a.name}.`;
    if (!a.dir) return `${a.name} has no folder on this computer, so the office can't start ${a.name}.`;
    if (a.status === 'planned') return `${a.name} hasn't moved in yet.`;
    if (!a.start) return `${a.name}'s agent.json has no start command, so the office can't start ${a.name}.`;
    if (!a.probe || !a.probe.port) return `The office can't tell whether ${a.name} is running, so it won't start ${a.name}.`;
    return null;
  }

  /** The agent, its program and its probe, or the refusal to send back. */
  function vet(key) {
    const none = { refusal: reply(404, "There's no agent by that name in this office.") };
    if (!KEY_RE.test(String(key || ''))) return none;
    const a = list().find((x) => x.key === key);
    if (!a) return none;
    const why = whyNot(a);
    if (why) return { refusal: reply(409, why) };
    return { a, argv: contract.splitCommand(a.start), check: { port: a.probe.port, path: a.probe.path || '/' } };
  }

  async function wake(key) {
    const v = vet(key);
    if (v.refusal) return v.refusal;
    if (inFlight.has(key)) return reply(202, `${v.a.name} is already waking up.`, { state: 'starting' });
    const job = (async () => {
      const { a, check } = v;
      if (await probe(check)) { changed(); return reply(200, `${a.name} is already awake.`, { state: 'running', already: true }); }
      let pid;
      try {
        pid = await start(a.dir);
      } catch (e) {
        return reply(500, `${a.name} could not be started. ${String(e && e.message).slice(0, 200)}`);
      }
      changed();
      const until = Date.now() + waitMs;
      for (;;) {
        if (await probe(check)) { changed(); return reply(200, `${a.name} is awake.`, { state: 'running' }); }
        if (pid && !alive(pid)) { changed(); return reply(500, `${a.name} started and stopped again. Its dashboard/dashboard.log says why.`); }
        if (Date.now() >= until) break;
        await sleepMs(pollMs);
      }
      changed();
      return reply(202, `${a.name} is still starting. The door opens when ${a.name} answers.`, { state: 'starting' });
    })().finally(() => { inFlight.delete(key); changed(); });
    inFlight.set(key, job);
    return job;
  }

  /** Stop the agent's runs (runsOf); how many were stopped. */
  async function stopRuns(dir, skip) {
    const except = new Set([process.pid, process.ppid].concat(skip || []));
    const runs = runsOf(dir, await listNode(), except);
    for (const r of runs) await kill(r.pid);
    return runs.length;
  }
  const runWords = (n, name) => (n > 0 ? ` The office also stopped ${n === 1 ? 'the run' : `the ${n} runs`} ${name} had going.` : '');

  async function sleep(key) {
    const v = vet(key);
    if (v.refusal) return v.refusal;
    const { a, argv, check } = v;
    if (inFlight.has(key)) return reply(409, `${a.name} is still waking up. Try again in a moment.`);

    // Only the pid in its dashboard/.pid, while that process is still the program its start names.
    const pid = readPid(a.dir);
    const live = !!pid && alive(pid);
    let target = null;
    if (live && isProgram(await commandLine(pid), argv)) target = pid;
    if (!target) {
      if (await probe(check)) {
        return reply(409, `The office didn't start this copy of ${a.name} and can't be sure which program it is, so it won't stop it. Close ${a.name} wherever ${a.name} was started.`);
      }
      if (pid && !live) { try { fs.rmSync(pidFileOf(a.dir), { force: true }); } catch (_) { /* a stale pid file only */ } }
      const runs = await stopRuns(a.dir, []);
      changed();
      return reply(200, `${a.name} is already asleep.${runWords(runs, a.name)}`, { state: 'off', already: true, runs });
    }

    await kill(target);
    const runs = await stopRuns(a.dir, [target]);
    const until = Date.now() + sleepWaitMs;
    let down = false;
    for (;;) {
      down = !alive(target) && !(await probe(check));
      if (down || Date.now() >= until) break;
      await sleepMs(pollMs);
    }
    if (!alive(target) && readPid(a.dir) === target) {
      try { fs.rmSync(pidFileOf(a.dir), { force: true }); } catch (_) { /* the next start replaces it */ }
    }
    changed();
    return down
      ? reply(200, `${a.name} is asleep.${runWords(runs, a.name)}`, { state: 'off', runs })
      : reply(500, `The office asked ${a.name} to stop, but ${a.name} is still answering.`);
  }

  /** Sleep, then wake: what a dashboard needs after its code changes. */
  async function restart(key) {
    const s = await sleep(key);
    if (!s.ok) return s;
    const w = await wake(key);
    if (!w.ok) return w;
    const name = (list().find((x) => x.key === key) || {}).name || key;
    return reply(w.status, w.status === 200 ? `${name} restarted.${runWords(s.runs || 0, name)}` : w.message, { state: w.state });
  }

  /**
   * Sleep every agent on this computer the office can stop, and every run they have going. One the
   * office did not start and cannot identify is left running, and the reply names it.
   */
  async function sleepAll() {
    const slept = [];
    const left = [];
    let runs = 0;
    for (const a of list().filter((x) => !whyNot(x))) {
      const r = await sleep(a.key);
      runs += r.runs || 0;
      if (r.ok && !r.already) slept.push(a.name);
      else if (!r.ok) left.push(r);
    }
    const parts = [slept.length ? `Put to sleep: ${names(slept)}.` : 'Every agent here was already asleep.'];
    if (runs) parts.push(`Stopped ${runs === 1 ? '1 run' : `${runs} runs`} they had going.`);
    if (left.length === 1) parts.push(left[0].message);
    else if (left.length) parts.push(`${left.length} could not be put to sleep from here: press Sleep on each one's door to see why.`);
    changed();
    return reply(left.length ? 207 : 200, parts.join(' '), { slept: slept.length, runs, left: left.length });
  }

  /** What the door needs: can it be woken or stopped from here, why not, and is a wake under way. */
  function status(a) {
    const why = whyNot(a);
    if (why) return { can: false, why, starting: false, sleep: false };
    return { can: true, why: null, starting: inFlight.has(a.key), sleep: true };
  }

  return { wake, sleep, restart, sleepAll, status };
}

module.exports = { createWaker, isProgram, runsOf, WAKE_WAIT_MS };
