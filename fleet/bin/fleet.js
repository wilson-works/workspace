#!/usr/bin/env node
'use strict';

/**
 * fleet.js — the fleet's command line: several computers working together through one private
 * repo of your own (fleet/README.md). Every command is a thin call into fleet/lib/fleet.js.
 *
 *   fleet init [--name fleet-ops] [--remote <url|path>] [--create-repo] [--machine NAME] [--role R]
 *   fleet join <owner/name | url> [--machine NAME] [--role R]
 *   fleet sync [--quiet]
 *   fleet post "<text>"
 *   fleet handoff --to <NAME|any> "<title>" (--body <text> | --body-file <file>) [--repo <repo>] [--branch <b>]
 *   fleet pickup [<id>] [--any]          fleet done <id> [--note <text>] [--any]
 *   fleet board [--add "<title>" [--for <NAME|any>]]
 *   fleet claim <id> [--any]   fleet finish <id> [--branch <b>] [--any]   fleet archive <id>
 *   fleet status
 *   fleet schedule [--at 08:30] [--remove]
 *   fleet remove
 *
 * Every command takes --hub <your Hub folder> (else the Hub is found by hub/lib/root.js) and
 * --dry-run (print the plan, write nothing). Exit codes: 0 done or plan shown, 1 failed, 2 refused,
 * 3 the sync stopped on files that are not this computer's, 4 the sync stopped on a conflict.
 */

const readline = require('readline');
const fleet = require('../lib/fleet');

const VALUE = new Set(['hub', 'machine', 'role', 'name', 'remote', 'to', 'body', 'body-file', 'repo', 'branch', 'note', 'add', 'for', 'at']);
const FLAG = new Set(['create-repo', 'dry-run', 'yes', 'quiet', 'any', 'remove', 'help']);

const HELP = `fleet: your computers working together, through one private repo of your own.

First computer:   fleet init                   (creates <you>/fleet-ops on GitHub, private, after you say yes)
Each other one:   fleet join <you>/fleet-ops --role builder
Every day:        fleet schedule               (syncs at 08:30; --at 07:00 to change it, --remove to stop)

  fleet sync                     send this computer's notes and get the others'
  fleet status                   every computer, when it last synced, what is waiting for this one
  fleet post "text"              a note in this computer's comms file
  fleet handoff --to MINI "title" --body "what is done, what is next, how to check it"
                                 [--repo <repo> --branch <branch>]
  fleet pickup                   the handoffs waiting for this computer; fleet pickup <id> takes one
  fleet done <id> --note "..."   close a handoff you took
  fleet board                    the work orders; --add "title" --for MINI puts one on it
  fleet claim <id> | finish <id> | archive <id>
  fleet remove                   take this computer out (the repo stays yours, and private)

Any command: --hub <your Hub folder>, --dry-run (show the plan, change nothing).`;

function parse(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--') || a === '--') { if (a !== '--') pos.push(a); continue; }
    const eq = a.indexOf('=');
    const key = eq > 0 ? a.slice(2, eq) : a.slice(2);
    if (VALUE.has(key)) {
      const v = eq > 0 ? a.slice(eq + 1) : argv[i + 1];
      if (eq < 0) i += 1;
      if (v === undefined) return { error: `--${key} needs a value after it.` };
      flags[key] = v;
    } else if (FLAG.has(key)) flags[key] = true;
    else return { error: `There is no option --${key}. Try: fleet help` };
  }
  return { cmd: pos[0], pos: pos.slice(1), flags };
}

/** Ask in the terminal. Only a typed yes counts. null when there is no one at a terminal to ask. */
function ask(question) {
  if (!process.stdin.isTTY) return Promise.resolve(null);
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (a) => { rl.close(); resolve(/^\s*y(es)?\s*$/i.test(a)); });
  });
}

async function main(argv) {
  const p = parse(argv);
  const out = (s) => process.stdout.write(`${s}\n`);
  if (p.error) { out(p.error); return fleet.REFUSED; }
  const f = p.flags;
  if (!p.cmd || p.cmd === 'help' || f.help) { out(HELP); return fleet.OK; }
  const base = {
    hub: f.hub, machine: f.machine, role: f.role, dryRun: !!f['dry-run'], yes: !!f.yes, quiet: !!f.quiet, ask, out,
  };
  const id = p.pos[0];
  switch (p.cmd) {
    case 'init': return fleet.init(Object.assign(base, { name: f.name, remote: f.remote, createRepo: !!f['create-repo'] }));
    case 'join': return fleet.join(Object.assign(base, { target: id }));
    case 'sync': return fleet.sync(base);
    case 'post': return fleet.post(Object.assign(base, { text: p.pos.join(' ') }));
    case 'handoff':
      return fleet.handoff(Object.assign(base, {
        to: f.to, title: p.pos.join(' '), body: f.body, bodyFile: f['body-file'], repo: f.repo, branch: f.branch,
      }));
    case 'pickup': return fleet.pickup(Object.assign(base, { id, any: !!f.any }));
    case 'done': return fleet.done(Object.assign(base, { id, note: f.note, any: !!f.any }));
    case 'board': return fleet.board(Object.assign(base, { add: f.add, for: f.for }));
    case 'claim': return fleet.claim(Object.assign(base, { id, any: !!f.any }));
    case 'finish': return fleet.finish(Object.assign(base, { id, branch: f.branch, any: !!f.any }));
    case 'archive': return fleet.archive(Object.assign(base, { id }));
    case 'status': return fleet.status(base);
    case 'schedule': return fleet.schedule(Object.assign(base, { at: f.at, remove: !!f.remove }));
    case 'remove': return fleet.remove(base);
    default:
      out(`There is no fleet command "${p.cmd}". Try: fleet help`);
      return fleet.REFUSED;
  }
}

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = typeof code === 'number' ? code : 0; },
  (e) => { process.stdout.write(`Something went wrong: ${(e && e.message) || e}\n`); process.exitCode = 1; },
);
