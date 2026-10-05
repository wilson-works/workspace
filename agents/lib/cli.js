'use strict';

/**
 * cli.js — what the three agent commands (new-agent, install-agent, agent) share: reading their
 * arguments, finding the Hub, and knowing which agents folders the office reads.
 *
 * The Hub is `--hub <root>` (it must hold .hub/hub.json), else hub/lib/root.js finds it. Agents live
 * in <Hub>/50-AI/agents when --hub is given, else in the office's first agents folder
 * (workspace.config.json agents_dirs, whose default is that same <Hub>/50-AI/agents).
 *
 * Exits: refuse() is 2 (bad arguments, or something it will not do), fail() is 1.
 */

const path = require('path');
const root = require('../../hub/lib/root');
const config = require('../../src/server/config');

const out = (s = '') => process.stdout.write(`${s}\n`);
const fwd = (p) => String(p).replace(/\\/g, '/');

function refuse(msg) { out(`NOT DONE: ${msg}`); process.exit(2); }
function fail(msg) { out(`FAILED: ${msg}`); process.exit(1); }

/** { _: positional words, flags: { name: value or true } }. `valued` names the flags that take a value. */
function parseArgs(argv, valued) {
  const res = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) { res._.push(a); continue; }
    const eq = a.indexOf('=');
    const name = a.slice(2, eq > 0 ? eq : undefined);
    if (eq > 0) res.flags[name] = a.slice(eq + 1);
    else if (valued.includes(name)) {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) refuse(`--${name} needs a value.`);
      res.flags[name] = argv[i += 1];
    } else res.flags[name] = true;
  }
  return res;
}

/** The Hub: --hub (it must be one), else the one hub/lib/root.js finds, looking up from `from` first. */
function hubFrom(flags, from) {
  if (flags.hub) {
    const h = path.resolve(String(flags.hub));
    if (!root.isHub(h)) refuse(`There is no Hub at ${h} (no .hub/hub.json there). Check the folder, or run the installer first.`);
    return h;
  }
  try { return root.resolveHubRoot(from ? { from } : undefined); } catch (e) { return refuse(`${e.message} Or pass --hub <your Hub folder>.`); }
}

/** The folder new agents go in. */
function agentsDirFor(flags, hub) {
  if (flags.hub) return path.join(hub, '50-AI', 'agents');
  return config.agentsDirs()[0] || path.join(hub, '50-AI', 'agents');
}

const same = (a, b) => {
  const n = (p) => (process.platform === 'linux' ? path.resolve(p) : path.resolve(p).toLowerCase());
  return n(a) === n(b);
};

/** Every agents folder the office reads, with `extra` first. */
function allDirs(extra) {
  const dirs = [];
  for (const d of [].concat(extra || [], config.agentsDirs())) if (d && !dirs.some((x) => same(x, d))) dirs.push(path.resolve(d));
  return dirs;
}

/** True when the office reads this agents folder. */
function officeReads(dir) { return config.agentsDirs().some((d) => same(d, dir)); }

module.exports = { out, fwd, refuse, fail, parseArgs, hubFrom, agentsDirFor, allDirs, officeReads };
