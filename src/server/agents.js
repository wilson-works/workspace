'use strict';

/**
 * agents.js — the Agents' wing: an office for each of your specialist agents, in its own branding,
 * with a door into its dashboard.
 *
 * Two places name agents, and the office reads both on every request:
 *   - config/agents.json (agents on any machine, written by hand);
 *   - every <dir>/<key>/agent.json in the agents folders (opts.dirs, default config.agentsDirs(): the
 *     Hub's 50-AI/agents). new-agent and install-agent write these; writing one IS the registration.
 *     Only manifests that pass the contract (agents/lib/agents.js validateManifest) are shown. A
 *     manifest agent runs on this machine. Its mark and art become /agent-files/<key>/<file>, which
 *     the server serves from that agent's own folder (fileFor).
 * config/agents.json wins a key both name. The placeholder "your-specialist" is hidden once any
 * other agent exists.
 *
 * GET /api/agents answers, per agent: who it is, its
 * brand, its doors, whether it is running (re-checked at most every PROBE_EVERY_MS, at once for an
 * agent never checked yet, and never awaited by a request), and how many of its sessions are at a
 * desk now. Only the count of sessions leaves: a
 * specialist's sessions can be private work, so their titles never do.
 *
 * Two kinds of probe:
 *   { port, path }  loopback, checked only on the agent's own machine;
 *   { url }         its tailnet address (https://<machine>.<tailnet>.ts.net/...), checked from any
 *                   machine, so an agent on the laptop shows running on the desk and on the phone.
 * Up means an HTTP answer below 500 (a 403 without a login is up; tailscale serve answers 502 when the
 * agent behind it is down). A probe must never hit a page that hands out a login token.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const contract = require('../../agents/lib/agents');

const AGENTS = path.join(__dirname, '..', '..', 'config', 'agents.json');
const PROBE_EVERY_MS = 20000;
const PROBE_TIMEOUT_MS = 1500;
const REMOTE_TIMEOUT_MS = 4000;
const KEY_RE = /^[a-z][a-z0-9-]{0,30}$/;
const PLACEHOLDER = 'your-specialist';
const fileUrl = (key, name) => `/agent-files/${key}/${name}`;

/** The figure in the door: one of the office's own svgs, or an svg/png in that agent's own folder. */
function artOk(a) {
  if (typeof a.art !== 'string') return false;
  if (/^\/agents\/[\w.-]+\.svg$/.test(a.art)) return true;
  const own = fileUrl(a.key, '');
  return a.art.startsWith(own) && contract.isImageName(a.art.slice(own.length));
}

/** The agents named by agent.json files that pass the contract, shaped like config/agents.json entries. */
function manifestAgents(dirs) {
  return contract.listAgents(dirs).filter((x) => x.ok).map(({ key, dir, manifest: m }) => {
    const brand = Object.assign({}, m.brand);
    if (m.brand.mark) brand.mark = fileUrl(key, m.brand.mark);
    return {
      key, name: m.name, title: m.title || null, line: m.line || null, status: m.status || 'live', repo: null,
      machine: null, // it runs on the computer it is installed on: this one
      door: { local: (m.door && m.door.local) || null, phone: (m.door && m.door.phone) || null },
      probe: m.probe || null, match: m.match || [], brand,
      art: m.art ? fileUrl(key, m.art) : null,
      jokes: m.jokes || [],
      // Its folder and the command that starts its dashboard, for Wake and Sleep (wake.js). Server-side
      // only: view() never sends either to the page.
      dir, start: typeof m.start === 'string' ? m.start : null,
    };
  });
}

/** A remote probe goes to a tailnet name only: the office never reaches out to the internet. */
function tailnetUrl(u) {
  try {
    const x = new URL(String(u));
    return x.protocol === 'https:' && /\.ts\.net$/i.test(x.hostname) ? x : null;
  } catch (_) {
    return null;
  }
}

function loadAgents(file) {
  try {
    const cfg = JSON.parse(fs.readFileSync(file || AGENTS, 'utf8'));
    return (cfg.agents || []).filter((a) => a && KEY_RE.test(String(a.key || '')));
  } catch (_) {
    return [];
  }
}

/** An HTTP answer below 500 within the timeout: up. A refusal, silence or a 5xx: down. */
function probeOnce(probe) {
  return new Promise((resolve) => {
    const remote = probe.url ? tailnetUrl(probe.url) : null;
    if (probe.url && !remote) { resolve(false); return; }
    const opts = remote
      ? { host: remote.hostname, port: remote.port || 443, path: remote.pathname + remote.search, timeout: REMOTE_TIMEOUT_MS }
      : { host: '127.0.0.1', port: probe.port, path: probe.path || '/', timeout: PROBE_TIMEOUT_MS };
    const req = (remote ? https : http).get(opts, (res) => {
      res.resume();
      resolve(res.statusCode < 500);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

/** Sessions on the floor that are this agent's, by its match words in their title or code tree. */
const norm = (s) => String(s || '').toLowerCase().replace(/[-_]+/g, ' ');
function sessionsOf(agent, sessions) {
  const words = (agent.match || []).map(norm).filter(Boolean);
  if (!words.length) return [];
  return (sessions || []).filter((s) => {
    const hay = norm([s.name, s.room, s.display && s.display.label].filter(Boolean).join(' '));
    return words.some((w) => hay.includes(w));
  });
}

/**
 * @param opts { file, dirs (agents folders; default config.agentsDirs()), self (this machine),
 *               probe (injectable), now }
 */
function createAgents(opts) {
  const o = opts || {};
  const probe = o.probe || probeOnce;
  const up = new Map(); // key -> { up, at }
  let checking = null;
  let lastCheck = 0;
  // A tailnet probe from any machine; a loopback probe only on the agent's own machine.
  const probed = (a) => !!(a.probe && (a.probe.url ? tailnetUrl(a.probe.url) : a.probe.port && (a.machine || o.self) === o.self));
  const dirs = () => (o.dirs !== undefined ? o.dirs : require('./config').agentsDirs());

  /** config/agents.json, then every manifest it does not already name; the placeholder only while alone. */
  function all() {
    const own = loadAgents(o.file);
    const named = new Set(own.map((a) => a.key));
    const list = own.concat(manifestAgents(dirs()).filter((a) => !named.has(a.key)));
    return list.some((a) => a.key !== PLACEHOLDER) ? list.filter((a) => a.key !== PLACEHOLDER) : list;
  }

  function refresh(force) {
    if (checking) return checking;
    const mine = all().filter(probed);
    if (!force && Date.now() - lastCheck < PROBE_EVERY_MS && mine.every((a) => up.has(a.key))) return Promise.resolve();
    lastCheck = Date.now();
    checking = Promise.all(mine.map(async (a) => { up.set(a.key, { up: await probe(a.probe), at: Date.now() }); }))
      .finally(() => { checking = null; });
    return checking;
  }

  /**
   * The file behind /agent-files/<key>/<name>: an .svg or .png directly inside that agent's own folder
   * (no "..", no sub-folder, no link), or null.
   */
  function fileFor(key, name) {
    if (!KEY_RE.test(String(key)) || !contract.isImageName(name)) return null;
    const hit = contract.listAgents(dirs()).find((x) => x.key === key && x.ok);
    if (!hit) return null;
    const f = path.join(hit.dir, name);
    if (path.dirname(f) !== hit.dir) return null;
    try { return fs.lstatSync(f).isFile() ? f : null; } catch (_) { return null; }
  }

  /** GET /api/agents */
  function view(sessions, now) {
    refresh(false);
    const at = typeof now === 'number' ? now : Date.now();
    return {
      asOf: at,
      agents: all().map((a) => {
        const here = (a.machine || o.self) === o.self;
        const seen = up.get(a.key);
        const at_desks = sessionsOf(a, sessions);
        let state;
        if (a.status === 'planned') state = 'planned';
        else if (probed(a)) state = !seen ? 'checking' : seen.up ? 'running' : 'off';
        else if (!here) state = 'elsewhere';
        else state = a.status === 'building' ? 'building' : 'no-dashboard';
        return {
          key: a.key, name: a.name, title: a.title || null, line: a.line || null,
          machine: a.machine || o.self, status: a.status || null, repo: a.repo || null,
          brand: a.brand || {},
          // Who stands inside the open door (one of the office's own svgs, never another site), and what
          // it says when someone knocks (a dozen short lines at most).
          art: artOk(a) ? a.art : null,
          jokes: (Array.isArray(a.jokes) ? a.jokes : []).filter((j) => typeof j === 'string' && j.length <= 160).slice(0, 12),
          // A door is only offered while it leads somewhere: running (the local door on its own machine
          // only), or on another machine this office cannot probe. A stopped, planned or unbuilt
          // agent's door stays shut.
          door: {
            local: here && state === 'running' ? (a.door && a.door.local) || null : null,
            phone: state === 'running' || state === 'elsewhere' ? (a.door && a.door.phone) || null : null,
          },
          state,
          checked_at: seen ? seen.at : null,
          at_desks: at_desks.length,
          working: at_desks.filter((s) => s.state === 'working').length,
          // Its desks as floor keys (machine:session), never titles: the page puts a bubble by its door
          // for each question one of them has asked you, and "Talk to" opens the busiest.
          desks: at_desks.map((s) => `${s.machine}:${s.id}`),
          desk: at_desks.length
            ? (() => { const s = at_desks.slice().sort((x, y) => (y.state === 'working') - (x.state === 'working') || (y.last_at || 0) - (x.last_at || 0))[0]; return { key: `${s.machine}:${s.id}`, machine: s.machine }; })()
            : null,
        };
      }),
    };
  }

  return { view, refresh, fileFor, all };
}

module.exports = { createAgents, loadAgents, manifestAgents, sessionsOf, probeOnce, tailnetUrl, PROBE_EVERY_MS };
