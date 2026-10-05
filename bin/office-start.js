#!/usr/bin/env node
'use strict';

/**
 * office-start.js - start the office, once.
 *
 *   node bin/office-start.js              start it (nothing happens if it is already up)
 *   node bin/office-start.js --restart    stop this office and its forwarder, then start again
 *                                         (after changing workspace.config.json)
 *
 * Run by hand, by the SessionStart hook (ensure-office.js), or at login
 * (`node bin/install.js startup --apply`). It:
 *   1. starts the forwarder, which sends this machine's floor to the hub when
 *      this machine is not the hub (it exits by itself on the hub);
 *   2. exits quietly if something already listens on the port - a second copy
 *      would only fail on EADDRINUSE;
 *   3. waits up to 90 s for Tailscale when it is installed, because at login
 *      its service is often still starting - and without this machine's
 *      Tailscale name the phone gets 403 (the server only answers names it was
 *      told about);
 *   4. starts the server detached, logging to <office home>/office.log;
 *   5. starts each specialist agent with autostart: true whose probe does not answer
 *      (agents/lib/agents.js autostart), detached, never blocking the office. Only when the office
 *      itself was started here: an agent someone stopped stays stopped while the office runs.
 * The Tailscale name is looked up, never hardcoded, and remembered in
 * <office home>/tailscale-name.txt, so a restart while Tailscale is still
 * starting (or belongs to another user on this computer) keeps the phone working.
 */

const net = require('net');
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const config = require('../src/server/config');

const PORT = config.officePort();
const repo = path.resolve(__dirname, '..');
const home = require('../src/server/home').homeDir();

/** Where the Tailscale command line is: workspace.config.json tailscale_cli, else the usual place. */
function tailscaleCli() {
  const own = config.load().tailscale_cli;
  if (own) return own;
  if (process.platform === 'win32') return 'C:/Program Files/Tailscale/tailscale.exe';
  if (process.platform === 'darwin' && fs.existsSync('/Applications/Tailscale.app/Contents/MacOS/Tailscale')) {
    return '/Applications/Tailscale.app/Contents/MacOS/Tailscale';
  }
  return 'tailscale';
}

function installed(cli) {
  if (path.isAbsolute(cli)) return fs.existsSync(cli);
  try {
    execFileSync(cli, ['version'], { stdio: 'ignore', timeout: 5000, windowsHide: true });
    return true;
  } catch (_) { return false; }
}

function portInUse() {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port: PORT }, () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    s.setTimeout(2000, () => { s.destroy(); resolve(false); });
  });
}

// { name } when Tailscale is up; { refused: true } when it is up but owned by
// another user on this computer, so asking again will never work; {} otherwise.
function tailscaleName(cli) {
  try {
    const st = JSON.parse(execFileSync(cli, ['status', '--json'], { encoding: 'utf8', timeout: 10000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }));
    const name = st && st.Self && st.Self.DNSName ? String(st.Self.DNSName).replace(/\.$/, '') : '';
    return st.BackendState === 'Running' && name ? { name } : {};
  } catch (e) {
    return /already in use by/i.test(`${e.stderr || ''}${e.stdout || ''}${e.message || ''}`) ? { refused: true } : {};
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/**
 * --restart: stop THIS office (the pid it stamps in office.alive) and its forwarder (the pid in
 * forwarder.lock). Only those two pids, never "whatever holds the port".
 */
async function stopRunning(note) {
  const pids = [];
  try { pids.push(Number(JSON.parse(fs.readFileSync(path.join(home, 'office.alive'), 'utf8')).pid)); } catch (_) { /* none */ }
  try { pids.push(Number(fs.readFileSync(path.join(home, 'forwarder.lock'), 'utf8').trim())); } catch (_) { /* none */ }
  for (const pid of pids.filter(alive)) {
    try { process.kill(pid); note(`restart: stopped pid ${pid}`); } catch (e) { note(`restart: could not stop pid ${pid}: ${e.message}`); }
  }
  for (let i = 0; i < 20 && await portInUse(); i += 1) await sleep(250);
}

(async () => {
  fs.mkdirSync(home, { recursive: true });
  const log = path.join(home, 'office.log');
  const note = (m) => fs.appendFileSync(log, `[${new Date().toISOString()}] start: ${m}\n`);
  if (process.argv.includes('--restart')) await stopRunning(note);

  // Started before the port check on purpose: an office that is already up
  // must not mean a forwarder that is not. It holds a pid lock, so a second
  // copy exits at once, and on the hub machine it exits by itself.
  try {
    const fwd = spawn(process.execPath, [path.join(repo, 'bin', 'office-forward.js')], {
      cwd: repo, detached: true, stdio: 'ignore', windowsHide: true,
    });
    fwd.unref();
  } catch (e) { note(`could not start the forwarder: ${e.message}`); }

  if (await portInUse()) {
    note(`port ${PORT} already in use - not starting a second office`);
    process.stdout.write(`The office is already running: http://127.0.0.1:${PORT}/\n`);
    return;
  }

  // The office stamps office.alive every 30 s; saying when the last one stopped
  // narrows the moment an office ended to half a minute.
  try {
    const last = JSON.parse(fs.readFileSync(path.join(home, 'office.alive'), 'utf8'));
    note(`previous office pid ${last.pid} (up since ${last.started_at}) was last seen alive at ${last.alive_at}`);
  } catch (_) { /* first start, or it never stamped */ }

  const nameFile = path.join(home, 'tailscale-name.txt');
  let remembered = null;
  try { remembered = fs.readFileSync(nameFile, 'utf8').trim() || null; } catch (_) { /* never looked up yet */ }

  const cli = tailscaleCli();
  const hasTailscale = installed(cli);
  let name = null;
  let refused = false;
  for (let i = 0; hasTailscale && i < 18 && !name; i += 1) {
    const got = tailscaleName(cli);
    name = got.name || null;
    refused = !!got.refused;
    if (refused && remembered) break;
    if (!name) await sleep(5000);
  }
  if (name && name !== remembered) {
    try { fs.writeFileSync(nameFile, `${name}\n`); } catch (e) { note(`could not remember the Tailscale name: ${e.message}`); }
  }
  if (hasTailscale && !name && remembered) {
    name = remembered;
    note(`Tailscale ${refused ? 'belongs to another user on this computer' : 'is not running'} - using the remembered name ${name}`);
  }
  if (hasTailscale && !name && refused) note('Tailscale belongs to another user on this computer and no name is remembered yet - starting without it');
  else if (hasTailscale && !name) note('Tailscale is installed but not running after 90 s - starting without it; restart the office once Tailscale is up');

  const args = [path.join(repo, 'src', 'server', 'server.js'), '--port', String(PORT)];
  if (name) args.push('--allow-host', name);
  const out = fs.openSync(log, 'a');
  const child = spawn(process.execPath, args, { cwd: repo, detached: true, stdio: ['ignore', out, out], windowsHide: true });
  child.unref();
  note(`started pid ${child.pid}${name ? ` allowing ${name}` : ''}`);
  process.stdout.write(`The office is starting: http://127.0.0.1:${PORT}/${name ? `  (and https://${name}/ once tailscale serve is on)` : ''}\n`);

  // 5. The specialist agents that asked for it (autostart: true in their agent.json) and are down get
  //    their dashboards started too: detached, each logging to its own dashboard/dashboard.log. The
  //    office is already on its way; a failure here is noted in office.log and never stops anything.
  try {
    const started = await require('../agents/lib/agents').autostart(config.agentsDirs(), note);
    if (started.length) process.stdout.write(`Started ${started.length === 1 ? 'the agent' : 'the agents'} ${started.join(', ')}.\n`);
  } catch (e) { note(`could not start the agents: ${e.message}`); }
})();
