'use strict';

/**
 * agents.js — the Agents' wing: an office for each of your specialist agents, in its own branding,
 * with a door into its dashboard.
 *
 * config/agents.json names each agent once. GET /api/agents answers, per agent: who it is, its
 * brand, its doors, whether it is running here (a loopback HTTP probe, any answer counts, re-checked
 * at most every PROBE_EVERY_MS and never awaited by a request), and how many of its sessions are at a
 * desk now. Only the count of sessions leaves: a specialist's sessions can be private work, so their
 * titles never do.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const AGENTS = path.join(__dirname, '..', '..', 'config', 'agents.json');
const PROBE_EVERY_MS = 20000;
const PROBE_TIMEOUT_MS = 1500;
const KEY_RE = /^[a-z][a-z0-9-]{0,30}$/;

function loadAgents(file) {
  try {
    const cfg = JSON.parse(fs.readFileSync(file || AGENTS, 'utf8'));
    return (cfg.agents || []).filter((a) => a && KEY_RE.test(String(a.key || '')));
  } catch (_) {
    return [];
  }
}

/** Any HTTP answer from 127.0.0.1:<port><path> within the timeout: up. A refusal or silence: down. */
function probeOnce(probe) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: probe.port, path: probe.path || '/', timeout: PROBE_TIMEOUT_MS }, (res) => {
      res.resume();
      resolve(true);
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

  function refresh(force) {
    if (checking) return checking;
    if (!force && Date.now() - lastCheck < PROBE_EVERY_MS) return Promise.resolve();
    lastCheck = Date.now();
    const mine = loadAgents(o.file).filter((a) => a.probe && a.probe.port && (a.machine || o.self) === o.self);
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
        else if (!here) state = 'elsewhere';
        else if (!a.probe) state = a.status === 'building' ? 'building' : 'no-dashboard';
        else state = !seen ? 'checking' : seen.up ? 'running' : 'off';
        return {
          key: a.key, name: a.name, title: a.title || null, line: a.line || null,
          machine: a.machine || o.self, status: a.status || null, repo: a.repo || null,
          brand: a.brand || {},
          door: { local: here && state === 'running' ? (a.door && a.door.local) || null : null, phone: (a.door && a.door.phone) || null },
          state,
          checked_at: seen ? seen.at : null,
          at_desks: at_desks.length,
          working: at_desks.filter((s) => s.state === 'working').length,
        };
      }),
    };
  }

  return { view, refresh };
}

module.exports = { createAgents, loadAgents, sessionsOf, probeOnce, PROBE_EVERY_MS };
