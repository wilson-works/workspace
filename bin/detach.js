'use strict';

/**
 * detach.js - start a long-running program in the background so it can never hold a terminal, or a
 * caller's captured output, open.
 *
 *   startDetached(program, args, { log, pidFile, cwd, env })   returns { pid } (or { pid: null } on Windows,
 *                                                               where the pid arrives in pidFile)
 *   readPid(pidFile, ms)                                       waits up to ms for that pid file; the pid or null
 *
 * Why: on Windows a new process inherits every handle its parent can pass on, and Node always lets it. A
 * program started from a command whose output is being captured (Claude running the installer, one script
 * calling another) then keeps the caller's output pipe open, and the caller waits for as long as the program
 * runs: forever, for the office. WScript.Shell.Run starts a program without passing it any handle, so on
 * Windows the start goes through bin/detach.vbs, which runs bin/detach-run.js, which starts the program with
 * its output in the log file and writes its pid. Elsewhere a plain detached start is enough.
 *
 * The environment and the working folder pass through unchanged. Exit codes: none; it throws when the
 * program cannot be started at all.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const VBS = path.join(__dirname, 'detach.vbs');
const RUN = path.join(__dirname, 'detach-run.js');

function startDetached(program, args, opts) {
  const o = opts || {};
  const log = o.log;
  if (!log) throw new Error('startDetached needs a log file.');
  fs.mkdirSync(path.dirname(log), { recursive: true });
  if (o.pidFile) { try { fs.rmSync(o.pidFile, { force: true }); } catch (_) { /* replaced below */ } }

  if (process.platform === 'win32') {
    const argv = ['//B', '//Nologo', VBS, process.execPath, RUN, log, o.pidFile || '-', program].concat(args || []);
    const w = spawn('wscript.exe', argv, { cwd: o.cwd, env: o.env || process.env, detached: true, stdio: 'ignore', windowsHide: true });
    w.on('error', () => { /* no wscript: reported by the caller's own check that the program answers */ });
    w.unref();
    return { pid: null };
  }

  const out = fs.openSync(log, 'a');
  let child;
  try {
    child = spawn(program, args || [], { cwd: o.cwd, env: o.env || process.env, detached: true, stdio: ['ignore', out, out] });
  } finally {
    fs.closeSync(out);
  }
  child.on('error', () => { /* reported below through the missing pid */ });
  if (!child.pid) throw new Error(`Could not start ${program}.`);
  child.unref();
  if (o.pidFile) fs.writeFileSync(o.pidFile, `${child.pid}\n`, 'utf8');
  return { pid: child.pid };
}

/** The pid written to pidFile, waiting up to ms (default 5 s) for it to appear. */
async function readPid(pidFile, ms) {
  const until = Date.now() + (ms || 5000);
  for (;;) {
    try {
      const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
      if (Number.isInteger(pid) && pid > 0) return pid;
    } catch (_) { /* not written yet */ }
    if (Date.now() > until) return null;
    await new Promise((r) => setTimeout(r, 100));
  }
}

module.exports = { startDetached, readPid };
