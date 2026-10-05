#!/usr/bin/env node
'use strict';

/**
 * stage.js — bring the installed sandbox computers' offices up for filming, and take them down again.
 *
 *   node capture/stage.js up     [--sandboxes <dir>] [--ids v4,v5,v6]
 *   node capture/stage.js down   [--sandboxes <dir>] [--ids v4,v5,v6]
 *   node capture/stage.js status [--sandboxes <dir>] [--ids v4,v5,v6]
 *
 * up: seeds the invented day (seed.js), then on MINI and LAPTOP starts the forwarder that sends that
 *     computer's floor to the DESK office every 15 s (bin/office-forward.js --dev-identity: the name
 *     tailscale serve would stamp on a tailnet request, for a local drill), and then starts each
 *     computer's own office the way a person does, with its installed bin/office-start.js (which
 *     also starts the agents' dashboards). Each computer runs with its own sandbox environment.
 * down: stops exactly the programs those left pid files for: each office (office.alive), each
 *     forwarder (forwarder.lock) and each agent dashboard (dashboard/.pid). Never "whatever holds
 *     the port".
 * Exit 0 done, 1 failed, 2 refused.
 */

const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { WORLD, baseFrom, idsFrom, sandboxes } = require('./sandbox');
const { seed } = require('./seed');

const argv = process.argv.slice(2);
const cmd = argv[0];
const say = (m) => process.stdout.write(`${m}\n`);

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
function pidIn(file, json) {
  try {
    const t = fs.readFileSync(file, 'utf8').trim();
    return Number(json ? JSON.parse(t).pid : t);
  } catch (_) { return null; }
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

/** Every program the stage can leave running, and where its pid is. */
function running(all) {
  const out = [];
  for (const sb of all) {
    out.push({ what: `${sb.name} office`, pid: pidIn(path.join(sb.office, 'office.alive'), true) });
    out.push({ what: `${sb.name} forwarder`, pid: pidIn(path.join(sb.office, 'forwarder.lock')) });
    let keys = [];
    try { keys = fs.readdirSync(sb.agents).filter((k) => fs.existsSync(path.join(sb.agents, k, 'agent.json'))); } catch (_) { keys = []; }
    for (const k of keys) out.push({ what: `${sb.name} agent ${k}`, pid: pidIn(path.join(sb.agents, k, 'dashboard', '.pid')) });
  }
  return out.filter((p) => alive(p.pid));
}

async function up(base, all) {
  for (const sb of all) if (!fs.existsSync(sb.config)) { say(`REFUSED: ${sb.name} is not installed (capture/install.js).`); return 2; }
  const r = seed(base, null, all.map((s) => s.id));
  if (!r.ok) { say(`NOT STAGED: ${r.error}`); return 1; }
  for (const [name, c] of Object.entries(r.computers)) say(`seeded ${name}: ${c.sessions.length} session(s)`);
  for (const sb of all.filter((s) => !s.computer.hub)) {
    if (alive(pidIn(path.join(sb.office, 'forwarder.lock')))) continue;
    fs.mkdirSync(sb.office, { recursive: true });
    const out = fs.openSync(path.join(sb.office, 'forward.out'), 'a');
    const child = spawn(process.execPath, [path.join(sb.workspace, 'bin', 'office-forward.js'), '--dev-identity', `${WORLD.person.toLowerCase()}@example.com`],
      { cwd: sb.workspace, env: sb.env, detached: true, stdio: ['ignore', out, out], windowsHide: true });
    child.unref();
    say(`${sb.name} forwarder started: its floor goes to the DESK office every 15 s`);
  }
  await sleep(1500);
  for (const sb of all) {
    const s = spawnSync(process.execPath, [path.join(sb.workspace, 'bin', 'office-start.js')],
      { cwd: sb.workspace, env: sb.env, encoding: 'utf8', timeout: 150000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    say(`${sb.name}: ${String(s.stdout || s.stderr || '').trim().split('\n').pop()}`);
  }
  for (const sb of all) {
    if (!(await waitPort(sb.computer.office_port, 20000))) { say(`FAILED: the ${sb.name} office did not open port ${sb.computer.office_port}`); return 1; }
  }
  for (const a of WORLD.agents) {
    if (!(await waitPort(a.port, 20000))) { say(`FAILED: ${a.name}'s dashboard did not open port ${a.port}`); return 1; }
  }
  for (const p of running(all)) say(`running: ${p.what} (pid ${p.pid})`);
  return 0;
}

function down(all) {
  const list = running(all);
  for (const p of list) {
    try { process.kill(p.pid); say(`stopped ${p.what} (pid ${p.pid})`); } catch (e) { say(`could not stop ${p.what} (pid ${p.pid}): ${e.message}`); }
  }
  say(list.length ? `stopped ${list.length} program(s)` : 'nothing was running');
  return 0;
}

(async () => {
  const base = baseFrom(argv);
  const all = sandboxes(base, idsFrom(argv));
  let code;
  if (cmd === 'up') code = await up(base, all);
  else if (cmd === 'down') code = down(all);
  else if (cmd === 'status') { const l = running(all); for (const p of l) say(`running: ${p.what} (pid ${p.pid})`); if (!l.length) say('nothing is running'); code = 0; }
  else { say('Usage: node capture/stage.js up|down|status [--sandboxes <dir>] [--ids v4,v5,v6]'); code = 2; }
  process.exit(code);
})().catch((e) => { say(`FAILED: ${e.message}`); process.exit(1); });
