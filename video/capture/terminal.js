#!/usr/bin/env node
'use strict';

/**
 * terminal.js — write src/data/terminal.json, the terminal scenes, from what the sandbox computers
 * really printed (capture/install.js keeps each command's output in <sandbox>/capture-log/<step>.json).
 *
 *   node capture/terminal.js [--sandboxes <dir>] [--ids v4,v5,v6]
 *
 * Contract:
 *   - Every line shown is a line the command printed, in its order. An entry that leaves lines out
 *     says so where it does, with a line of its own: "…". So an excerpt never passes for the whole.
 *   - The sandbox's folders are written as the invented person's own: <sandbox>\Hub as
 *     C:\Users\alex\Hub and <sandbox>\home as C:\Users\alex, with either slash.
 *   - The command shown is the one that ran (install.js records it; new-agent and the handoff are
 *     rebuilt from the same arguments install.js passed), less --hub, which names the folder it ran in.
 *   - Refuses (exit 2, nothing written) when any line still holds the sandbox folder, this computer's
 *     user or name, a drive path outside the invented folders, or a phrase the release scan refuses.
 * Exit 0 written, 1 failed, 2 refused.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { WORLD, baseFrom, idsFrom, sandboxes } = require('./sandbox');
const { shown, NEW_AGENT, HANDOFF } = require('./install');

const OUT = path.join(__dirname, '..', 'src', 'data', 'terminal.json');
// The invented person's own folder: the one their Windows computer's Hub sits in.
const HOME = path.win32.dirname(WORLD.computers.find((c) => c.hub).hub_root);
const say = (m) => process.stdout.write(`${m}\n`);

/* Which lines each scene keeps: [from] or [from, to] patterns, matched in order; all: every line. */
const ENTRIES = {
  install: {
    on: 'DESK', cps: 60,
    steps: [{ log: 'install-1', pick: [
      [/^Downloading the workspace/, /^Installing the WilsonWorks/],
      [/^What is where:/, /The install record/],
      [/change\(s\) made\./],
    ] }],
  },
  install2: {
    on: 'DESK', cps: 60,
    steps: [{ log: 'install-2', pick: [
      [/^Updating /], [/^Installing the WilsonWorks/],
      [/^skills - /, /^ {2}= the daily sync is scheduled/],
      [/^Nothing changed\./],
    ] }],
  },
  nav: { on: 'DESK', steps: [{ log: 'nav', all: true }] },
  newAgent: { on: 'DESK', cps: 60, steps: [{ log: 'new-agent', cmd: shown('node 50-AI\\workspace\\agents\\bin\\new-agent.js', NEW_AGENT), all: true }] },
  installAgent: { on: 'DESK', steps: [{ log: 'install-agent', all: true }] },
  fleetInit: {
    on: 'DESK', cps: 60,
    steps: [{ log: 'install-1', pick: [
      [/^fleet - /, /^ {2}\+ 50-AI\/fleet-ops {2}\(the clone\)/],
      [/^ {2}\+ machines\/DESK\.json/, /^Synced DESK/],
      [/^fleet schedule: DESK/, /Windows Task Scheduler/],
    ] }],
  },
  fleetJoin: {
    on: 'MINI', cps: 60,
    steps: [{ log: 'install-1', pick: [
      [/^fleet - /, /^Synced MINI/],
      [/^fleet schedule: MINI/, /Windows Task Scheduler/],
      [/change\(s\) made\./],
    ] }],
  },
  handoff: { on: 'DESK', cps: 90, steps: [{ log: 'handoff', cmd: shown('fleet', HANDOFF), all: true }] },
  take: { on: 'MINI', steps: [{ log: 'pickup-list', all: true }, { log: 'pickup', all: true }] },
  sync: { on: 'MINI', steps: [{ log: 'daily-sync', all: true }] },
  status: { on: 'DESK', steps: [{ log: 'status-live', all: true }] },
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The sandbox's folders as the invented person's own, with either slash. */
function plainPaths(text, all) {
  let t = text;
  for (const sb of all) {
    for (const slash of ['\\', '/']) {
      const root = sb.root.split(/[\\/]/).join(slash);
      const home = slash === '\\' ? HOME : HOME.split('\\').join('/');
      t = t.replace(new RegExp(esc(`${root}${slash}Hub`), 'gi'), `${home}${slash}Hub`);
      t = t.replace(new RegExp(esc(`${root}${slash}home`), 'gi'), home);
    }
  }
  return t;
}

/** The lines to show: the picked ranges, with "…" wherever lines were left out. */
function pickLines(lines, pick) {
  const keep = new Set();
  let at = 0;
  for (const [from, to] of pick) {
    const s = lines.findIndex((l, i) => i >= at && from.test(l));
    if (s < 0) throw new Error(`no line matching ${from} after line ${at + 1}`);
    const e = to ? lines.findIndex((l, i) => i >= s && to.test(l)) : s;
    if (e < 0) throw new Error(`no line matching ${to} after line ${s + 1}`);
    for (let i = s; i <= e; i += 1) keep.add(i);
    at = e + 1;
  }
  const out = [];
  let gap = false;
  lines.forEach((l, i) => {
    if (keep.has(i)) { if (gap) out.push('…'); gap = false; out.push(l); } else gap = true;
  });
  if (gap) out.push('…');
  return out;
}

/** Anything that would put the real computer, a real folder or a refused phrase on screen. */
function leaks(text, base) {
  const bad = [
    [new RegExp(esc(base), 'i'), 'the sandbox folder'],
    [new RegExp(esc(base.split('\\').join('/')), 'i'), 'the sandbox folder'],
    [/ws-fresh/i, 'a sandbox name'],
    [new RegExp(esc(os.homedir()), 'i'), 'the real user folder'],
    [new RegExp(`\\b${esc(os.userInfo().username)}\\b`, 'i'), 'the real user name'],
    [new RegExp(`\\b${esc(os.hostname())}\\b`, 'i'), "this computer's name"],
    [/(?<![A-Za-z])[A-Z]:[\\/](?![\\/])(?!Users[\\/]alex\b|Program Files\b)/i, 'a drive path outside the invented folders'],
    [/SANDBOX/i, 'the word sandbox'],
    [/\bup[\s-]*to[\s-]*date\b/i, 'a phrase the release scan refuses'],
  ];
  const found = [];
  for (const line of text.split('\n')) for (const [re, why] of bad) if (re.test(line)) found.push(`${why}: ${line.trim()}`);
  return found;
}

function build(base, ids) {
  const all = sandboxes(base, ids);
  const byName = Object.fromEntries(all.map((sb) => [sb.name, sb]));
  const data = {
    _: 'What the terminal scenes show, written by capture/terminal.js from the sandbox computers\' real runs (capture/install.js). Every line is one the command printed, in order; "…" marks where lines were left out. The sandbox folder is written as the invented person\'s own (C:\\Users\\alex).',
  };
  for (const [key, e] of Object.entries(ENTRIES)) {
    const sb = byName[e.on];
    const steps = e.steps.map((s) => {
      const file = path.join(sb.root, 'capture-log', `${s.log}.json`);
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (j.code !== 0) throw new Error(`${e.on} ${s.log} exited ${j.code}; it is not shown.`);
      const lines = plainPaths(j.out, all).split('\n');
      let out;
      try { out = s.all ? lines : pickLines(lines, s.pick); } catch (err) { throw new Error(`${key} (${e.on} ${s.log}): ${err.message}`); }
      return { cmd: plainPaths(s.cmd || j.display, all), out, source: `${e.on} ${s.log}` };
    });
    // A command run in the person's folder (the installer) shows that folder; the rest, the Hub.
    const prompt = e.steps[0].log.startsWith('install-') && e.steps[0].log !== 'install-agent' ? `${HOME}>` : `${HOME}\\Hub>`;
    const entry = { title: `Terminal, on ${e.on}`, prompt, steps: steps.map(({ cmd, out }) => ({ cmd, out })) };
    if (e.cps) entry.cps = e.cps;
    entry.sources = steps.map((s) => s.source);
    entry.excerpt = steps.some((s) => s.out.includes('…'));
    data[key] = entry;
  }
  return data;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  try {
    const base = baseFrom(argv);
    const data = build(base, idsFrom(argv));
    const text = `${JSON.stringify(data, null, 2)}\n`;
    const onScreen = Object.entries(data).filter(([k]) => k !== '_')
      .flatMap(([, v]) => [v.title, v.prompt].concat(...v.steps.map((s) => [s.cmd].concat(s.out)))).join('\n');
    const found = leaks(onScreen, base);
    if (found.length) { say(`REFUSED: terminal.json would show:\n  ${[...new Set(found)].join('\n  ')}\nNothing was written.`); process.exit(2); }
    fs.writeFileSync(OUT, text, 'utf8');
    for (const [k, v] of Object.entries(data)) if (k !== '_') say(`${k}: ${v.steps.length} command(s), ${v.steps.reduce((n, s) => n + s.out.length, 0)} line(s)${v.excerpt ? ', an excerpt' : ''}`);
    say(`wrote ${path.relative(path.join(__dirname, '..'), OUT)}`);
    process.exit(0);
  } catch (e) {
    say(`FAILED: ${e.message}`);
    process.exit(1);
  }
}

module.exports = { pickLines, plainPaths, leaks };
