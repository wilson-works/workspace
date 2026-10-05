#!/usr/bin/env node
'use strict';

/**
 * detach-run.js - the second step of bin/detach.js on Windows (bin/detach.vbs runs it).
 *
 *   node detach-run.js <log file> <pid file | -> <program> [args...]
 *
 * Starts <program> detached, with its output appended to <log file>, writes its pid to <pid file>, and exits.
 * Because detach.vbs started this step without passing any handle, the program inherits none of the
 * original caller's either. Exit 0 started; 1 could not start (the reason goes to the log).
 */

const fs = require('fs');
const { spawn } = require('child_process');

const [log, pidFile, program, ...args] = process.argv.slice(2);
const note = (m) => { try { fs.appendFileSync(log, `[${new Date().toISOString()}] detach: ${m}\n`); } catch (_) { /* no log */ } };

try {
  const out = fs.openSync(log, 'a');
  const child = spawn(program === 'node' ? process.execPath : program, args, {
    detached: true, stdio: ['ignore', out, out], windowsHide: true,
  });
  fs.closeSync(out);
  child.on('error', (e) => { note(`could not start ${program}: ${e.message}`); process.exitCode = 1; });
  if (child.pid) {
    if (pidFile && pidFile !== '-') fs.writeFileSync(pidFile, `${child.pid}\n`, 'utf8');
    child.unref();
  }
} catch (e) {
  note(`could not start ${program}: ${e.message}`);
  process.exitCode = 1;
}
