#!/usr/bin/env node
'use strict';

/**
 * install-agent.js — install an agent from our catalog, or a package of your own, and give it an office.
 *
 *   node agents/bin/install-agent.js <key or package> [--hub <root>] [--port <n>] [--yes] [--dry-run] [--force] [--no-start]
 *
 *   node agents/bin/install-agent.js louise
 *   node agents/bin/install-agent.js C:\Users\alex\Downloads\my-agent.zip
 *   node agents/bin/install-agent.js https://github.com/alex-example/my-agent.git
 *
 * A key is one of the WilsonWorks agents in agents/catalog.json (agents/lib/catalog.js): it stands for
 * that agent's package. A package is a folder, a .zip file or a git address, with agent.json at its top
 * (agents/CONTRACT.md). Anything else is refused, and the catalog is listed.
 * It is checked against the contract first; a package that fails is refused and nothing is written.
 * The skills its agent.json requires (requires.skills) that the Hub lacks are copied from the Hub's
 * pinned pack and recorded in <Hub>/.hub/installed.json ("+" each); one the pack does not have either
 * refuses the package, before anything is written.
 * Nothing from the package runs while it is installed: a .zip is opened with tar (Windows), ditto
 * (macOS) or unzip, and a git address is cloned with `git clone --depth 1`, into a temporary folder.
 *
 * It is copied to <agents folder>/<key>/. When that folder is already there and differs, it is kept
 * ("!") unless --force or you say yes; a replaced one moves to <Hub>/90-Archive/_DumpQueue/. When its
 * port is taken (another agent.json, or anything listening), it gets a free one: probe.port and
 * door.local are rewritten ("~"). --port asks for a port of your own (refused when it is taken). Its subagent goes to <Hub>/.claude/agents/<key>.md. When its
 * agent.json says autostart: true, its dashboard is started after a yes (or --yes).
 * --yes answers yes to starting it, never to replacing your copy; only --force replaces.
 * Exit codes: 0 done (or plan shown), 1 failed, 2 refused.
 */

const fs = require('fs');
const path = require('path');
const lib = require('../lib/agents');
const cli = require('../lib/cli');
const catalog = require('../lib/catalog');

const { out, refuse, fail } = cli;

(async () => {
  const { _: pos, flags } = cli.parseArgs(process.argv.slice(2), ['hub', 'port']);
  const src = pos[0];
  if (!src) refuse('Name the agent or the package: node agents/bin/install-agent.js <one of ours, such as louise, or a folder, .zip file or git address>.');
  const dry = !!flags['dry-run'];

  let found;
  try { found = catalog.resolve(src); } catch (e) { refuse(e.message); }
  const hub = cli.hubFrom(flags);
  const agentsDir = cli.agentsDirFor(flags, hub);
  const what = found.entry ? `${found.entry.name}, from ${found.source}` : src;
  out(dry ? `Plan for installing ${what} (dry run: nothing is written):` : `Installing ${what}:`);

  const r = await lib.installPackage(found.source, agentsDir, {
    dirs: cli.allDirs(agentsDir),
    subagentsDir: path.join(hub, '.claude', 'agents'),
    hubRoot: hub,
    dryRun: dry,
    yes: !!flags.yes,
    force: !!flags.force,
    start: !flags['no-start'],
    port: flags.port === undefined ? undefined : Number(flags.port),
    ask: lib.ask,
  });
  r.lines.forEach((l) => out(`  ${l}`));
  if (r.refused) {
    refuse(`This package cannot be installed:\n${r.errors.map((e) => `  - ${e}`).join('\n')}`);
  }
  if (dry) { out('Nothing was written. Run it again without --dry-run to install it.'); return; }
  if (r.kept) return;

  const m = JSON.parse(fs.readFileSync(path.join(r.target, 'agent.json'), 'utf8').replace(/^﻿/, ''));
  out('');
  if (m.door && m.door.local) out(`${m.name}'s door: ${m.door.local}${r.started ? '' : `  (start it with: node agents/bin/agent.js start ${r.key})`}`);
  if (cli.officeReads(agentsDir)) out(`${m.name} now has an office in the Agents' wing.`);
  else out(`To give ${m.name} an office, add "${cli.fwd(agentsDir)}" to agents_dirs in workspace.config.json.`);
  if (r.startFailed) process.exit(1);
})().catch((e) => fail(e.message));
