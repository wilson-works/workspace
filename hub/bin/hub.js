#!/usr/bin/env node
'use strict';

/**
 * hub.js — the Hub's command line (the API is hub/lib/hub.js).
 *
 *   node hub/bin/hub.js init [--root <dir>] [--machine NAME] [--role command|builder|mobile] [--owner Name]
 *                            [--code-zone <rel>] [--dry-run] [--yes]
 *   node hub/bin/hub.js nav [--root <dir>] [--dry-run]
 *   node hub/bin/hub.js new-project <name> [--root <dir>] [--dry-run]
 *   node hub/bin/hub.js doctor [--root <dir>]
 *   node hub/bin/hub.js where [--root <dir>]
 *
 * The Hub is --root, else the one hub/lib/root.js finds: HUB_ROOT, else walking up from the current folder (or from
 * this file), else the usual places. `init` with no --root and no Hub found refuses and says to pass --root.
 *
 * init prints one line per item: + add, ~ change, = already there, ! yours differs and is kept. --dry-run writes
 * nothing. Without --yes, in a terminal, it asks before replacing a file of yours; with --yes, or with no terminal to
 * ask in, the answer is always no.
 *
 * Exit codes: 0 done (or plan shown, or the doctor found nothing to fix); 1 failed, or the doctor found something to
 * fix; 2 refused (bad arguments, no Hub, a name it will not use).
 */

const os = require('os');
const path = require('path');
const readline = require('readline');
const rootLib = require('../lib/root');
const hub = require('../lib/hub');

const { HubError } = hub;
const out = (s = '') => process.stdout.write(`${s}\n`);

const USAGE = `The Hub: one folder that holds all your work, in zones, with rules Claude follows to find its way.

  hub init [--root <folder>] [--machine NAME] [--role command|builder|mobile] [--owner Name]
           [--code-zone <folder>] [--dry-run] [--yes]
        Make a Hub, or add what is missing to the one you have. Shows what it does, one line each:
        + add   ~ change   = already there   ! yours is different, so it is kept
  hub nav [--root <folder>] [--dry-run]
        Rebuild NAV.md, the plain-English map of the Hub. Edit .hub/nav.json to change its rows.
  hub new-project <name> [--root <folder>] [--dry-run]
        Make a project in the code zone: a kebab-case name, like garden-planner.
  hub doctor [--root <folder>]
        Check the Hub and list anything out of place. Changes nothing.
  hub where [--root <folder>]
        Say where the Hub and its code zone are, and how they were found.

Run it as: node hub/bin/hub.js <command> (from the workspace folder).`;

const VALUE_FLAGS = ['root', 'machine', 'role', 'owner', 'code-zone'];
const ALLOWED = {
  init: ['root', 'machine', 'role', 'owner', 'code-zone', 'dry-run', 'yes'],
  nav: ['root', 'dry-run'],
  'new-project': ['root', 'dry-run'],
  doctor: ['root'],
  where: ['root'],
};

function parse(argv) {
  const a = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '-h' || t === '--help') { a.help = true; continue; }
    if (!t.startsWith('--')) { a._.push(t); continue; }
    const eq = t.indexOf('=');
    const key = (eq > 0 ? t.slice(2, eq) : t.slice(2));
    if (VALUE_FLAGS.includes(key)) {
      const v = eq > 0 ? t.slice(eq + 1) : argv[(i += 1)];
      if (v === undefined || v === '' || (eq < 0 && v.startsWith('--'))) throw new HubError(`--${key} needs a value.`);
      a.flags[key] = v;
    } else if (key === 'dry-run' || key === 'yes') {
      a.flags[key] = true;
    } else {
      throw new HubError(`There is no option ${t}. Run hub --help to see them.`);
    }
  }
  return a;
}

/** { root, how }: --root, else the Hub this computer has. */
function findRoot(flags, cmd) {
  if (flags.root) {
    const root = path.resolve(flags.root);
    if (cmd !== 'init' && !rootLib.isHub(root)) {
      throw new HubError(`There is no Hub at ${root} (no .hub/hub.json). Make one with: hub init --root "${root}"`);
    }
    return { root, how: 'given with --root' };
  }
  let found;
  try { found = rootLib.findHubRoot(); } catch (e) { throw new HubError(e.message); }
  if (found) return found;
  if (cmd === 'init') {
    throw new HubError(`No Hub was found on this computer. To make one, say where with --root, for example: hub init --root "${path.join(os.homedir(), 'Hub')}"`);
  }
  try { rootLib.resolveHubRoot(); } catch (e) { throw new HubError(e.message); }
  throw new HubError('No Hub found. Pass --root <folder>.');
}

/** Asks one yes/no question in the terminal. Anything but y or yes is no. */
function askInTerminal(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${question} (y/N) `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(String(answer).trim()));
    });
  });
}

function summary(items, dryRun) {
  const n = (m) => items.filter((i) => i.mark === m).length;
  const kept = n('!') ? ` ${n('!')} kept as yours (marked !).` : '';
  if (dryRun) return `Dry run: nothing was written. ${n('+')} to add, ${n('~')} to change.${kept}`;
  if (!n('+') && !n('~')) return `Nothing changed.${kept}`;
  return `Done: ${n('+')} added, ${n('~')} changed.${kept}`;
}

async function cmdInit(flags) {
  const { root } = findRoot(flags, 'init');
  const opts = {
    machine: flags.machine, role: flags.role, owner: flags.owner, codeZone: flags['code-zone'],
    dryRun: !!flags['dry-run'], yes: !!flags.yes,
  };
  if (!opts.yes && !opts.dryRun && process.stdin.isTTY) opts.ask = askInTerminal;
  out(`Hub: ${root}`);
  const res = await hub.init(root, opts);
  for (const it of res.items) out(it.line);
  out(summary(res.items, opts.dryRun));
  if (!opts.dryRun && res.changed) out('Next: read NAV.md, then make a project with hub new-project <kebab-name>.');
  return 0;
}

function cmdNav(flags) {
  const { root } = findRoot(flags, 'nav');
  const dryRun = !!flags['dry-run'];
  const r = hub.writeNav(root, { dryRun });
  if (r.kept) {
    out('! NAV.md  was not made by hub nav (no stamp line); kept. To have it generated, rename yours and run hub nav again.');
  } else if (r.changed) {
    out(`${r.created ? '+' : '~'} NAV.md  ${r.created ? 'generated' : 'regenerated'}${dryRun ? ' (dry run: nothing was written)' : ''}`);
  } else {
    out('= NAV.md  already matches the Hub');
  }
  return 0;
}

function cmdNewProject(flags, names) {
  if (names.length !== 1) throw new HubError('Give one project name, like: hub new-project garden-planner');
  const { root } = findRoot(flags, 'new-project');
  const r = hub.newProject(root, names[0], { dryRun: !!flags['dry-run'] });
  for (const it of r.items) out(it.line);
  for (const n of r.notes) out(`Note: ${n}`);
  if (r.dryRun) out('Dry run: nothing was written.');
  else out(`Made ${r.dir}. Open it, fill in its CLAUDE.md, and start a branch for your first change.`);
  return 0;
}

function cmdDoctor(flags) {
  const { root } = findRoot(flags, 'doctor');
  const r = hub.doctor(root);
  out(`Hub doctor: ${root}`);
  for (const it of r.items) out(`  ${it.level.padEnd(5)} ${it.text}`);
  const count = (l) => r.items.filter((i) => i.level === l).length;
  const notes = count('note') ? `, ${count('note')} to look at` : '';
  out(`Doctor: ${count('ok')} ok${notes}, ${r.fixes ? `${r.fixes} to fix` : 'nothing to fix'}.`);
  return r.fixes ? 1 : 0;
}

function cmdWhere(flags) {
  const { root, how } = findRoot(flags, 'where');
  const h = rootLib.readHub(root) || {};
  let zone;
  try { zone = rootLib.codeZone(root); } catch (_) { zone = 'none yet (run hub init)'; }
  out(`Hub root:  ${root}`);
  out(`Found:     ${how}`);
  out(`Code zone: ${zone}`);
  if (h.machine) out(`Computer:  ${h.machine}${h.role ? ` (${h.role})` : ''}`);
  return 0;
}

async function main(argv) {
  const a = parse(argv);
  const cmd = a._[0];
  if (a.help || !cmd || cmd === 'help') { out(USAGE); return 0; }
  if (!ALLOWED[cmd]) throw new HubError(`There is no command "${cmd}". Run hub --help to see them.`);
  for (const f of Object.keys(a.flags)) {
    if (!ALLOWED[cmd].includes(f)) throw new HubError(`hub ${cmd} does not take --${f}.`);
  }
  const rest = a._.slice(1);
  if (cmd !== 'new-project' && rest.length) throw new HubError(`hub ${cmd} does not take "${rest[0]}".`);
  if (cmd === 'init') return cmdInit(a.flags);
  if (cmd === 'nav') return cmdNav(a.flags);
  if (cmd === 'new-project') return cmdNewProject(a.flags, rest);
  if (cmd === 'doctor') return cmdDoctor(a.flags);
  return cmdWhere(a.flags);
}

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (err) => {
    if (err && err.exitCode === 2) {
      out(`NOT DONE: ${err.message}`);
      process.exitCode = 2;
    } else {
      out(`FAILED: ${err && err.message ? err.message : err}`);
      process.exitCode = 1;
    }
  },
);
