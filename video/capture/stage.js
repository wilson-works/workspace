#!/usr/bin/env node
'use strict';

/**
 * stage.js — bring the sandbox office up for filming, and take it down again.
 *
 *   node capture/stage.js up   [--sandboxes <dir>]
 *   node capture/stage.js down [--sandboxes <dir>]
 *   node capture/stage.js status [--sandboxes <dir>]
 *
 * up: seeds all three computers (seed.js), starts the DESK office from this repo's server
 *     (office-server.js), starts Iris's and Quill's stand-in dashboards (demo-agent.js), and starts
 *     the MINI and LAPTOP forwarders (bin/office-forward.js), which send their floors to the DESK
 *     office every 15 seconds, the way a second computer does over the tailnet. Each program runs
 *     with its own computer's sandbox environment, and its pid is recorded.
 * down: stops exactly those pids, and nothing else (never "whatever holds the port").
 * Exit 0 done, 1 failed, 2 refused.
 */

const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { WORLD, RIG, baseFrom, sandboxes } = require('./sandbox');
const { seed } = require('./seed');

const args = process.argv.slice(2);
const cmd = args[0];
const base = baseFrom(args);
const all = sandboxes(base);
const desk = all.find((s) => s.computer.hub);
const spokes = all.filter((s) => !s.computer.hub);
const say = (m) => process.stdout.write(`${m}\n`);

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
function readPid(file) {
  try { return Number(fs.readFileSync(file, 'utf8').trim()); } catch (_) { return null; }
}
function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port }, () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    s.setTimeout(1000, () => { s.destroy(); resolve(false); });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitPort(port, ms) {
  for (let t = 0; t < ms; t += 250) { if (await portOpen(port)) return true; await sleep(250); }
  return false;
}

/** Every pid this stage starts, by where it is recorded. */
function pidFiles() {
  const out = [{ what: 'DESK office', file: path.join(desk.office, 'video-office.pid') }];
  for (const a of WORLD.agents) out.push({ what: `${a.name} dashboard`, file: path.join(desk.run, `${a.key}.pid`) });
  for (const s of spokes) out.push({ what: `${s.name} forwarder`, file: path.join(s.office, 'forwarder.lock') });
  return out;
}

function launch(sb, script, scriptArgs, log) {
  fs.mkdirSync(sb.run, { recursive: true });
  const out = fs.openSync(path.join(sb.run, log), 'a');
  const child = spawn(process.execPath, [script].concat(scriptArgs), {
    cwd: RIG, env: sb.env, detached: true, stdio: ['ignore', out, out], windowsHide: true,
  });
  child.unref();
  return child.pid;
}

async function up() {
  for (const p of pidFiles()) {
    const pid = readPid(p.file);
    if (alive(pid) && p.file.endsWith('.pid')) { say(`REFUSED: the ${p.what} is already running (pid ${pid}). Run "stage.js down" first.`); return 2; }
  }
  const ports = [desk.computer.office_port].concat(WORLD.agents.map((a) => a.port));
  for (const port of ports) {
    if (await portOpen(port)) { say(`REFUSED: port ${port} is already in use by something this stage did not start.`); return 2; }
  }
  const r = seed(base);
  if (!r.ok) { say(`NOT STAGED: ${r.error}`); return r.refused ? 2 : 1; }
  for (const [name, c] of Object.entries(r.computers)) say(`seeded ${name}: ${c.sessions.length} session(s)`);

  // The dashboards first: the office probes every agent the moment it starts.
  for (const a of WORLD.agents) {
    launch(desk, path.join(__dirname, 'demo-agent.js'), [a.key, '--pid-file', path.join(desk.run, `${a.key}.pid`)], `${a.key}.log`);
  }
  for (const a of WORLD.agents) {
    if (!(await waitPort(a.port, 10000))) { say(`FAILED: ${a.name}'s dashboard did not open port ${a.port}`); return 1; }
    say(`${a.name}'s dashboard: http://127.0.0.1:${a.port}/`);
  }
  const agentsFile = r.computers[desk.name].agentsFile;
  launch(desk, path.join(__dirname, 'office-server.js'), ['--agents-file', agentsFile], 'office.log');
  if (!(await waitPort(desk.computer.office_port, 15000))) { say(`FAILED: the DESK office did not open port ${desk.computer.office_port}; see ${path.join(desk.run, 'office.log')}`); return 1; }
  say(`DESK office: http://127.0.0.1:${desk.computer.office_port}/`);
  for (const s of spokes) {
    // --dev-identity stands in for the name tailscale serve stamps on a tailnet request.
    launch(s, path.join(RIG, 'bin', 'office-forward.js'), ['--dev-identity', `${WORLD.person.toLowerCase()}@example.com`], 'forward.out');
    say(`${s.name} forwarder started (feeds the DESK office every 15 s)`);
  }
  return 0;
}

async function down() {
  let stopped = 0;
  for (const p of pidFiles()) {
    const pid = readPid(p.file);
    if (!alive(pid)) continue;
    try { process.kill(pid); stopped += 1; say(`stopped the ${p.what} (pid ${pid})`); } catch (e) { say(`could not stop the ${p.what} (pid ${pid}): ${e.message}`); }
  }
  for (const p of pidFiles()) if (p.file.endsWith('.pid')) fs.rmSync(p.file, { force: true });
  say(stopped ? `stopped ${stopped} program(s)` : 'nothing was running');
  return 0;
}

function status() {
  for (const p of pidFiles()) {
    const pid = readPid(p.file);
    say(`${p.what}: ${alive(pid) ? `running (pid ${pid})` : 'not running'}`);
  }
  return 0;
}

(async () => {
  let code;
  if (cmd === 'up') code = await up();
  else if (cmd === 'down') code = await down();
  else if (cmd === 'status') code = status();
  else { say('Usage: node capture/stage.js up|down|status [--sandboxes <dir>]'); code = 2; }
  process.exit(code);
})().catch((e) => { say(`FAILED: ${e.message}`); process.exit(1); });
