#!/usr/bin/env node
'use strict';

/**
 * install-agent.js — install an agent package you were given, and give it an office.
 *
 *   node agents/bin/install-agent.js <package> [--hub <root>] [--yes] [--dry-run] [--force] [--no-start]
 *
 *   node agents/bin/install-agent.js agents/examples/quill --yes
 *   node agents/bin/install-agent.js C:\Users\alex\Downloads\quill.zip
 *   node agents/bin/install-agent.js https://github.com/alex-example/quill-agent.git
 *
 * A package is a folder, a .zip file or a git address, with agent.json at its top (agents/CONTRACT.md).
 * It is checked against the contract first; a package that fails is refused and nothing is written.
 * Nothing from the package runs while it is installed: a .zip is opened with tar (Windows), ditto
 * (macOS) or unzip, and a git address is cloned with `git clone --depth 1`, into a temporary folder.
 *
 * It is copied to <agents folder>/<key>/. When that folder is already there and differs, it is kept
 * ("!") unless --force or you say yes; a replaced one moves to <Hub>/90-Archive/_DumpQueue/. When its
 * port is taken (another agent.json, or anything listening), it gets a free one: probe.port and
 * door.local are rewritten ("~"). Its subagent goes to <Hub>/.claude/agents/<key>.md. When its
 * agent.json says autostart: true, its dashboard is started after a yes (or --yes).
 * --yes answers yes to starting it, never to replacing your copy; only --force replaces.
 * Exit codes: 0 done (or plan shown), 1 failed, 2 refused.
 */

const fs = require('fs');
const path = require('path');
const lib = require('../lib/agents');
const cli = require('../lib/cli');

const { out, refuse, fail } = cli;

(async () => {
  const { _: pos, flags } = cli.parseArgs(process.argv.slice(2), ['hub']);
  const src = pos[0];
  if (!src) refuse('Name the package: node agents/bin/install-agent.js <folder, .zip file or git address>.');
  const dry = !!flags['dry-run'];

  const hub = cli.hubFrom(flags);
  const agentsDir = cli.agentsDirFor(flags, hub);
  out(dry ? `Plan for installing ${src} (dry run: nothing is written):` : `Installing ${src}:`);

  const r = await lib.installPackage(src, agentsDir, {
    dirs: cli.allDirs(agentsDir),
    subagentsDir: path.join(hub, '.claude', 'agents'),
    hubRoot: hub,
    dryRun: dry,
    yes: !!flags.yes,
    force: !!flags.force,
    start: !flags['no-start'],
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
