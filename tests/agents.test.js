'use strict';

/**
 * agents.test.js — the Agents' wing (src/server/agents.js). Each agent in
 * config/agents.json gets an office; its door opens only when it is running on
 * this machine (or when it has a published phone door); an agent on another
 * machine is never probed; only the count of its sessions leaves the server,
 * never their titles.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = require('../src/server/agents');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-'));
const file = path.join(dir, 'agents.json');
fs.writeFileSync(file, JSON.stringify({ agents: [
  { key: 'ada', name: 'Ada', machine: 'DESK', status: 'live', door: { local: 'http://127.0.0.1:7480/open', phone: null }, probe: { port: 7480, path: '/' }, match: ['the-bookkeeper'] },
  { key: 'rex', name: 'Rex', machine: 'LAPTOP', status: 'building', door: { local: null, phone: null }, probe: { port: 7490 }, match: ['rex'] },
  { key: 'kit', name: 'Kit', machine: 'DESK', status: 'planned', door: { local: null, phone: 'https://desk.example.ts.net:8443/' }, probe: null, match: ['kit'] },
  { key: 'Bad Key!', name: 'nope' },
] }));

test('an agent running here has an open door; one that is down has none; another machine is never probed', async () => {
  const probed = [];
  let up = true;
  const ag = A.createAgents({ file, self: 'DESK', probe: async (p) => { probed.push(p.port); return up; } });
  await ag.refresh(true);
  assert.deepEqual(probed, [7480], 'only the agent on this machine with a probe');
  const v = ag.view([], 1000);
  assert.deepEqual(v.agents.map((a) => a.key), ['ada', 'rex', 'kit'], 'a bad key is dropped');
  const [ada, rex, kit] = v.agents;
  assert.equal(ada.state, 'running');
  assert.equal(ada.door.local, 'http://127.0.0.1:7480/open');
  assert.equal(rex.state, 'elsewhere');
  assert.equal(rex.machine, 'LAPTOP');
  assert.equal(kit.state, 'planned');
  assert.equal(kit.door.local, null);
  assert.equal(kit.door.phone, null, "a planned agent's door stays shut, phone door included");

  up = false;
  await ag.refresh(true);
  const down = ag.view([], 2000).agents[0];
  assert.equal(down.state, 'off');
  assert.equal(down.door.local, null, 'no door into an agent that is not running');
  assert.equal(down.door.phone, null, 'nor a phone door');
});

test("an agent's sessions are counted by its match words; their titles never leave", async () => {
  const ag = A.createAgents({ file, self: 'DESK', probe: async () => false });
  await ag.refresh(true);
  const sessions = [
    { id: 's-idle', machine: 'DESK', name: 'C04 receipts week 14', room: 'the-bookkeeper', state: 'idle', last_at: 900 },
    { id: 's-busy', machine: 'DESK', name: 'Private work', room: 'the bookkeeper', state: 'working', last_at: 500, display: { label: 'Elm · DESK · private work' } },
    { id: 's-other', machine: 'DESK', name: 'Office upgrades', room: 'workspace', state: 'working' },
  ];
  const ada = ag.view(sessions, 1000).agents[0];
  assert.equal(ada.at_desks, 2);
  assert.equal(ada.working, 1);
  assert.ok(!JSON.stringify(ag.view(sessions, 1000)).includes('C04'), 'no session title in the payload');
});

test('config/agents.json: the shipped placeholder is the planned "your-specialist", with a valid key and brand', () => {
  const root = path.join(__dirname, '..');
  const agents = A.loadAgents(path.join(root, 'config', 'agents.json'));
  assert.deepEqual(agents.map((a) => a.key), ['your-specialist']);
  const [a] = agents;
  assert.equal(a.status, 'planned');
  assert.equal(a.probe, null, 'a planned agent has nothing to probe');
  for (const c of ['bg', 'panel', 'ink', 'accent', 'accent2']) assert.match(String(a.brand[c]), /^#[0-9a-f]{6}$/i, `brand.${c}`);
  const v = A.createAgents({ file: path.join(root, 'config', 'agents.json'), self: 'DESK', probe: async () => true }).view([], 1000);
  assert.equal(v.agents[0].state, 'planned');
});

// A probe must never hit a path that hands out a session token: a dashboard's /open often answers with a
// redirect carrying its token, so the office probes another path and leaves the door to the person's own browser.
test('config/agents.json: every mark exists, no probe path is a door path or /open, and a phone door is https', () => {
  const root = path.join(__dirname, '..');
  const agents = A.loadAgents(path.join(root, 'config', 'agents.json'));
  for (const a of agents) {
    if (a.brand && a.brand.mark) {
      const svg = fs.readFileSync(path.join(root, 'public', a.brand.mark.replace(/^\//, '')), 'utf8');
      assert.match(svg, /<svg\b/);
      for (const m of svg.matchAll(/<!--([\s\S]*?)-->/g)) assert.ok(!m[1].includes('--'), `${a.key}: no "--" inside an SVG comment (it breaks the image)`);
    }
    if (a.door && a.door.phone) assert.match(a.door.phone, /^https:\/\//, `${a.key}: a phone door is https on the tailnet`);
    if (!a.probe) continue;
    const doorPaths = [a.door && a.door.local, a.door && a.door.phone].filter(Boolean).map((u) => new URL(u).pathname);
    assert.notEqual(a.probe.path || '/', '/open', `${a.key}: /open hands out a token`);
    assert.ok(!doorPaths.includes(a.probe.path || '/'), `${a.key}: the probe must not be a door (${doorPaths.join(', ')})`);
  }
});

test('route: #/agents is a place', async () => {
  const { parseRoute, formatRoute } = await import('../src/ui/route.js');
  assert.deepEqual(parseRoute('#/agents'), { tab: 'agents' });
  assert.equal(formatRoute({ tab: 'agents' }), '#/agents');
});
