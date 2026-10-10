#!/usr/bin/env node
'use strict';
/**
 * office-read.js — print the reader's state JSON and exit.
 *
 * Every data claim the office makes can be checked without opening a browser.
 * This is that entry point.
 *
 *   node bin/office-read.js --root <fixture folder>      a fixture
 *   node bin/office-read.js --live [--summary]           this machine
 */
const { read } = require('../src/server/reader');
const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const path = require('path');
const { homeDir, ownerClaudeHome } = require('../src/server/home');
const live = args.includes('--live');
const root = arg('--root', '.');
const claude = ownerClaudeHome(homeDir());
const state = live
  ? read(homeDir(), { officeHome: homeDir(), projects: path.join(claude, 'projects'), commsPaths: [path.join(claude, 'comms.db')] })
  : read(root, {});
if (args.includes('--summary')) {
  const s = state;
  process.stdout.write(
    `verdict=${s.verdict.word} count=${s.verdict.count} dark=${s.verdict.dark.length}\n` +
    `machines=${s.machines.map((m) => m.name).join(',')} desks=${s.desks.length} ended=${s.desks_ended}\n` +
    `alarms=${s.alarms.length} sources=${s.sources.read}/${s.sources.total} no_fact=${s.sources.no_fact}\n`
  );
} else {
  process.stdout.write(JSON.stringify(state, null, 2) + '\n');
}
