#!/usr/bin/env node
'use strict';

/**
 * agent.js — look after the specialist agents on this computer.
 *
 *   node agents/bin/agent.js list                     every agent: running or off, its door, or what is wrong
 *   node agents/bin/agent.js start <key>              start its dashboard (detached; pid in dashboard/.pid)
 *   node agents/bin/agent.js start --all              start every agent that has a start command and is down
 *   node agents/bin/agent.js stop <key>               stop its dashboard: the pid in dashboard/.pid, and only that
 *   node agents/bin/agent.js remove <key> [--yes] [--dry-run]
 *                                                     stop it, then move its folder (and its subagent file) to
 *                                                     <Hub>/90-Archive/_DumpQueue/agent-<key>-<YYYY-MM-DD>/
 *   any of them [--hub <root>]                        use <Hub>/50-AI/agents instead of the office's agents folders
 *
 * remove's Hub is --hub, else the Hub the agent's folder sits in, else the one hub/lib/root.js finds.
 *
 * remove asks first (--yes says yes). It never deletes anything: the folder waits in the _DumpQueue
 * until you delete it yourself. A dashboard this tool did not start (no dashboard/.pid) is never stopped
 * by it: it says so instead of stopping "whatever holds the port".
 * Exit codes: 0 done (or plan shown), 1 failed, 2 refused.
 */

const fs = require('fs');
const path = require('path');
const lib = require('../lib/agents');
const cli = require('../lib/cli');
const config = require('../../src/server/config');

const { out, fwd, refuse, fail } = cli;

function dirsFrom(flags) {
  if (flags.hub) return [path.join(cli.hubFrom(flags), '50-AI', 'agents')];
  const own = config.agentsDirs();
  return own.length ? own : [path.join(cli.hubFrom(flags), '50-AI', 'agents')];
}

function find(dirs, key) {
  const a = lib.listAgents(dirs).find((x) => x.key === key);
  if (!a) refuse(`There is no agent called ${key} in ${dirs.map(fwd).join(', ')}. See them all: node agents/bin/agent.js list`);
  return a;
}

async function start(a) {
  if (!a.ok) return { ok: false, line: `! ${a.key} cannot start: ${a.errors.join(' ')}` };
  const m = a.manifest;
  if (!m.start) return { ok: true, line: `= ${m.name} has no start command in agent.json; nothing to start.` };
  const pid = lib.runningPid(a.dir);
  if (pid) return { ok: true, line: `= ${m.name} is already running (pid ${pid}).` };
  if (m.probe && m.probe.port && await lib.probeLocal(m.probe)) {
    return { ok: true, line: `= ${m.name} already answers on port ${m.probe.port} (started some other way).` };
  }
  const started = await lib.startAgent(a.dir);
  if (m.probe && m.probe.port && !(await lib.waitUp(m.probe, 15000))) {
    return { ok: false, line: `! started ${m.name} (pid ${started}), but it did not answer within 15 seconds. See ${fwd(path.join(a.dir, 'dashboard', 'dashboard.log'))}.` };
  }
  return { ok: true, line: `+ started ${m.name} (pid ${started})${m.door && m.door.local ? `: ${m.door.local}` : ''}` };
}

(async () => {
  const { _: pos, flags } = cli.parseArgs(process.argv.slice(2), ['hub']);
  const [cmd, key] = pos;
  const dirs = dirsFrom(flags);

  if (cmd === 'list' || !cmd) {
    const all = lib.listAgents(dirs);
    if (!all.length) { out(`No agents yet in ${dirs.map(fwd).join(', ')}. Make one: node agents/bin/new-agent.js <key> --name <Name> --title <Title>`); return; }
    for (const a of all) {
      if (!a.ok) { out(`! ${a.key.padEnd(16)} not valid: ${a.errors.join(' ')}`); continue; }
      const m = a.manifest;
      const up = m.probe && m.probe.port ? await lib.probeLocal(m.probe) : null;
      const pid = lib.runningPid(a.dir);
      const state = up === null ? 'no dashboard' : up ? 'running' : 'off';
      out(`  ${a.key.padEnd(16)} ${`${m.name}${m.title ? `, ${m.title}` : ''}`.padEnd(36)} ${state.padEnd(12)} ${(m.door && m.door.local) || ''}${pid ? `  pid ${pid}` : ''}`);
    }
    return;
  }

  if (cmd === 'start') {
    const list = flags.all ? lib.listAgents(dirs) : [find(dirs, key || refuse('Which agent? node agents/bin/agent.js start <key>, or start --all.'))];
    let ok = true;
    for (const a of list) {
      const r = await start(a);
      out(r.line);
      ok = ok && r.ok;
    }
    if (!ok) process.exit(1);
    return;
  }

  if (cmd === 'stop') {
    const a = find(dirs, key || refuse('Which agent? node agents/bin/agent.js stop <key>'));
    const name = (a.manifest && a.manifest.name) || a.key;
    const r = await lib.stopAgent(a.dir);
    out(r.stopped ? `Stopped ${name} (pid ${r.stopped}).` : `${name} was not started by agent.js (no running pid in dashboard/.pid), so nothing was stopped.`);
    return;
  }

  if (cmd === 'remove') {
    const a = find(dirs, key || refuse('Which agent? node agents/bin/agent.js remove <key>'));
    const hub = cli.hubFrom(flags, a.dir); // the Hub that holds the agent
    const name = (a.manifest && a.manifest.name) || a.key;
    const sub = path.join(hub, '.claude', 'agents', `${a.key}.md`);
    const pid = lib.runningPid(a.dir);
    const to = lib.moveToDumpQueue(a.dir, hub, a.key, { dryRun: true });
    out(`Plan for removing ${name}:`);
    if (pid) out(`  - stop its dashboard (pid ${pid})`);
    out(`  - ${fwd(a.dir)} moves to ${fwd(to)}`);
    if (fs.existsSync(sub)) out(`  - ${fwd(sub)} moves there too`);
    out('  Nothing is deleted. Delete that folder yourself once you are sure.');
    if (flags['dry-run']) { out('Nothing was moved (dry run).'); return; }
    if (!flags.yes && !(await lib.ask(`Move ${name} to the _DumpQueue?`))) { out('Nothing was moved.'); return; }
    if (pid) await lib.stopAgent(a.dir);
    const moved = lib.moveToDumpQueue(a.dir, hub, a.key, { subagentFile: sub });
    out(`Moved ${name} to ${fwd(moved)}. Its office leaves the Agents' wing.`);
    return;
  }

  refuse(`"${cmd}" is not a command. Use list, start <key>, start --all, stop <key> or remove <key>.`);
})().catch((e) => fail(e.message));
