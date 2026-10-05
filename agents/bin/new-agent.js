#!/usr/bin/env node
'use strict';

/**
 * new-agent.js — make a specialist agent and give it an office in the Agents' wing.
 *
 *   node agents/bin/new-agent.js <key> --name <Name> --title <Title> [--line <text>] [--color <#rrggbb>]
 *                                [--hub <root>] [--port <n>] [--no-start] [--dry-run] [--yes]
 *
 *   node agents/bin/new-agent.js iris --name Iris --title "The Research Desk" --line "Reads everything on a topic."
 *
 * It finds the Hub (--hub, else hub/lib/root.js), and writes the agent from agents/template/ into
 * <Hub>/50-AI/agents/<key>/ (or the office's first agents folder): agent.json, CLAUDE.md, brains/,
 * rules/, memory/, a dashboard, its mark and figure. It picks a port from 7600 that no other agent.json
 * uses and nothing listens on (or takes --port), and writes the Claude Code subagent to
 * <Hub>/.claude/agents/<key>.md (one that is already there and differs is yours: kept, "!").
 * Unless --no-start, it starts the dashboard and waits until /health answers.
 *
 * Writing agent.json into the agents folder IS the registration: the office finds it by itself, and
 * nothing else is edited. A key that already exists is refused; nothing is ever overwritten.
 * --dry-run prints the plan and writes nothing. --yes answers yes to any question, never to replacing
 * a file of yours. Exit codes: 0 done (or plan shown), 1 failed, 2 refused.
 */

const fs = require('fs');
const path = require('path');
const lib = require('../lib/agents');
const cli = require('../lib/cli');

const { out, fwd, refuse, fail } = cli;

(async () => {
  const { _: pos, flags } = cli.parseArgs(process.argv.slice(2), ['name', 'title', 'line', 'color', 'hub', 'port']);
  const key = pos[0];
  const usage = 'node agents/bin/new-agent.js <key> --name <Name> --title <Title>';
  if (!key) refuse(`Name the new agent: ${usage}. A key is short and lower-case, with dashes: research-desk.`);
  if (!lib.KEY_RE.test(key)) refuse(`"${key}" cannot be a key. Use lower-case letters, digits and dashes, starting with a letter, at most 31 characters: research-desk.`);
  if (typeof flags.name !== 'string' || !flags.name.trim()) refuse(`Give it a name: ${usage}.`);
  if (typeof flags.title !== 'string' || !flags.title.trim()) refuse(`Give it a title, the job on its door: --title "The Research Desk".`);
  if (flags.color !== undefined && !/^#[0-9a-f]{6}$/i.test(String(flags.color))) refuse('--color must be a colour written #rrggbb, for example #38BDF8.');
  const dry = !!flags['dry-run'];

  const hub = cli.hubFrom(flags);
  const agentsDir = cli.agentsDirFor(flags, hub);
  const dirs = cli.allDirs(agentsDir);
  const target = path.join(agentsDir, key);

  if (fs.existsSync(target)) refuse(`There is already an agent called ${key} at ${target}. Pick another key, or remove that one first: node agents/bin/agent.js remove ${key}`);
  const dup = lib.listAgents(dirs).find((a) => a.key === key);
  if (dup) refuse(`An agent called ${key} is already in ${path.dirname(dup.dir)}. Pick another key.`);
  if (require('../../src/server/agents').loadAgents().some((a) => a.key === key)) {
    refuse(`config/agents.json already has an agent called ${key}, and it would hide this one in the office. Pick another key.`);
  }

  let port;
  if (flags.port !== undefined) {
    port = Number(flags.port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) refuse('--port must be a whole number from 1024 to 65535.');
    if (lib.usedPorts(dirs).has(port)) refuse(`Port ${port} belongs to another agent. Leave out --port and a free one is picked.`);
    if (await lib.listening(port)) refuse(`Something on this computer is already using port ${port}. Leave out --port and a free one is picked.`);
  } else {
    port = await lib.freePort(dirs, lib.PORT_FROM);
  }

  const name = flags.name.trim();
  out(dry ? `Plan for ${name} (dry run: nothing is written):` : `Making ${name}, ${flags.title.trim()}:`);
  let made;
  try {
    made = lib.scaffold(target, { key, name, title: flags.title, line: typeof flags.line === 'string' ? flags.line : '', color: flags.color, port, dryRun: dry });
  } catch (e) {
    refuse(e.message);
  }
  made.lines.forEach((l) => out(`  ${l}`));
  out(`  ${lib.registerSubagent(path.join(hub, '.claude', 'agents'), key, lib.subagentText(target, made.manifest), { dryRun: dry })}`);

  const door = made.manifest.door.local;
  if (dry) {
    out(`  + its dashboard on port ${port}${flags['no-start'] ? ' (not started: --no-start)' : ', started'}`);
    out('Nothing was written. Run it again without --dry-run to make it.');
    return;
  }

  if (!flags['no-start']) {
    let pid;
    try { pid = await lib.startAgent(target); } catch (e) { fail(`${name} was made, but its dashboard did not start: ${e.message}`); }
    if (!(await lib.waitUp(made.manifest.probe, 15000))) {
      fail(`${name} was made and started (pid ${pid}), but its dashboard did not answer within 15 seconds. See ${fwd(path.join(target, 'dashboard', 'dashboard.log'))}.`);
    }
    out(`  + started its dashboard (pid ${pid})`);
  }

  out('');
  out(`${name}'s door: ${door}${flags['no-start'] ? `  (start it with: node agents/bin/agent.js start ${key})` : ''}`);
  if (cli.officeReads(agentsDir)) {
    out(`${name} now has an office in the Agents' wing.`);
  } else {
    out(`The office reads its agents from ${cli.allDirs([]).map(fwd).join(', ') || 'no folder yet'}, not ${fwd(agentsDir)}.`);
    out(`To give ${name} an office there, add "${fwd(agentsDir)}" to agents_dirs in workspace.config.json.`);
  }
  out(`Teach it in ${fwd(path.join(target, 'CLAUDE.md'))}, brains/ and rules/. In a session on your Hub, ask for ${name} by name.`);
})().catch((e) => fail(e.message));
