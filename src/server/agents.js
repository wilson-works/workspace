'use strict';

/**
 * agents.js — the Agents' wing: an office for each of your specialist agents, in its own branding,
 * with a door into its dashboard.
 *
 * config/agents.json names each agent once. GET /api/agents answers, per agent: who it is, its
 * brand, its doors, whether it is running (re-checked at most every PROBE_EVERY_MS and never awaited
 * by a request), and how many of its sessions are at a desk now. Only the count of sessions leaves: a
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

const AGENTS = path.join(__dirname, '..', '..', 'config', 'agents.json');
const PROBE_EVERY_MS = 20000;
const PROBE_TIMEOUT_MS = 1500;
const REMOTE_TIMEOUT_MS = 4000;
const KEY_RE = /^[a-z][a-z0-9-]{0,30}$/;

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
 * @param opts { file, self (this machine), probe (injectable), now }
 */
function createAgents(opts) {
  const o = opts || {};
  const probe = o.probe || probeOnce;
  const up = new Map(); // key -> { up, at }
  let checking = null;
  let lastCheck = 0;
  // A tailnet probe from any machine; a loopback probe only on the agent's own machine.
  const probed = (a) => !!(a.probe && (a.probe.url ? tailnetUrl(a.probe.url) : a.probe.port && (a.machine || o.self) === o.self));

  function refresh(force) {
    if (checking) return checking;
    if (!force && Date.now() - lastCheck < PROBE_EVERY_MS) return Promise.resolve();
    lastCheck = Date.now();
    const mine = loadAgents(o.file).filter(probed);
    checking = Promise.all(mine.map(async (a) => { up.set(a.key, { up: await probe(a.probe), at: Date.now() }); }))
      .finally(() => { checking = null; });
    return checking;
  }

  /** GET /api/agents */
  function view(sessions, now) {
    refresh(false);
    const at = typeof now === 'number' ? now : Date.now();
    return {
      asOf: at,
      agents: loadAgents(o.file).map((a) => {
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
          art: typeof a.art === 'string' && /^\/agents\/[\w.-]+\.svg$/.test(a.art) ? a.art : null,
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

  return { view, refresh };
}

module.exports = { createAgents, loadAgents, sessionsOf, probeOnce, tailnetUrl, PROBE_EVERY_MS };
