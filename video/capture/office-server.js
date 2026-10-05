#!/usr/bin/env node
'use strict';

/**
 * office-server.js — start one sandbox office from this repo's own server, for filming.
 *
 *   node capture/office-server.js [--agents-file <agents.json>]
 *
 * Contract: run with a sandbox's environment (capture/sandbox.js env). It starts the office exactly
 * as `src/server/server.js` does with no arguments (live: this computer's hook stream and Claude
 * folder, both inside the sandbox), on the port and office home from the sandbox's settings, and
 * writes its pid to <office home>/video-office.pid so it is stopped by that pid and nothing else.
 * --agents-file gives the Agents' wing a list of its own (phase 1, before the wing finds agent.json
 * files by itself). It binds 127.0.0.1 only, like every office.
 */

const fs = require('fs');
const path = require('path');

const RIG = path.resolve(__dirname, '..', '..');
const { start } = require(path.join(RIG, 'src', 'server', 'server.js'));
const config = require(path.join(RIG, 'src', 'server', 'config'));
const { homeDir, claudeHome } = require(path.join(RIG, 'src', 'server', 'home'));

const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

const home = homeDir();
const opts = {
  root: home,
  home,
  port: config.officePort(),
  officeHome: home,
  projects: path.join(claudeHome(), 'projects'),
  commsPaths: [path.join(claudeHome(), 'comms.db')],
  commsZones: config.codeRoots().filter((z) => fs.existsSync(z)),
};
const agentsFile = arg('--agents-file');
if (agentsFile) opts.agentsFile = path.resolve(agentsFile);

const h = start(opts);
fs.writeFileSync(path.join(home, 'video-office.pid'), String(process.pid), 'utf8');
process.stdout.write(`sandbox office ${require(path.join(RIG, 'src', 'server', 'geography')).thisMachine()} listening on ${h.url}\n`);
