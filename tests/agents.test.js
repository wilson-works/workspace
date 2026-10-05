'use strict';

/**
 * agents.test.js — the Agents' wing (src/server/agents.js). Each agent in
 * config/agents.json gets an office; its door opens only while it leads
 * somewhere; another machine's loopback port is never probed, only a tailnet
 * address; what stands in the door and what it says on a knock are kept to the
 * office's own files and short lines; only the count of its sessions and their
 * floor keys leave the server, never their titles.
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

test("an agent running here has an open door; one that is down has none; another machine's loopback is never probed", async () => {
  const probed = [];
  let up = true;
  const ag = A.createAgents({ file, dirs: [], self: 'DESK', probe: async (p) => { probed.push(p.port); return up; } });
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
  const ag = A.createAgents({ file, dirs: [], self: 'DESK', probe: async () => false });
  await ag.refresh(true);
  const sessions = [
    { id: 's-idle', machine: 'DESK', name: 'C04 receipts week 14', room: 'the-bookkeeper', state: 'idle', last_at: 900 },
    { id: 's-busy', machine: 'DESK', name: 'Private work', room: 'the bookkeeper', state: 'working', last_at: 500, display: { label: 'Elm · DESK · private work' } },
    { id: 's-other', machine: 'DESK', name: 'Office upgrades', room: 'workspace', state: 'working' },
  ];
  const ada = ag.view(sessions, 1000).agents[0];
  assert.equal(ada.at_desks, 2);
  assert.equal(ada.working, 1);
  // "Talk to" opens the working desk, and a question from any of its desks puts a bubble by its door:
  // floor keys only.
  assert.deepEqual(ada.desk, { key: 'DESK:s-busy', machine: 'DESK' });
  assert.deepEqual(ada.desks.slice().sort(), ['DESK:s-busy', 'DESK:s-idle']);
  assert.ok(!JSON.stringify(ag.view(sessions, 1000)).includes('C04'), 'no session title in the payload');
});

test('the figure inside the door is one of the office\'s own svgs, and jokes are a dozen short strings at most', () => {
  const f = path.join(dir, 'agents-art.json');
  const jokes = Array.from({ length: 15 }, (_, i) => `joke ${i}`);
  fs.writeFileSync(f, JSON.stringify({ agents: [
    { key: 'ok', name: 'Ok', art: '/agents/ok-hello.svg', jokes: ['short', 7, 'x'.repeat(161), null, 'x'.repeat(160)] },
    { key: 'many', name: 'Many', art: 'https://evil.example/a.svg', jokes },
    { key: 'up', name: 'Up', art: '/agents/../server.js' },
    { key: 'none', name: 'None', jokes: 'not a list' },
  ] }));
  const v = A.createAgents({ file: f, dirs: [], self: 'DESK', probe: async () => false }).view([], 1000).agents;
  assert.equal(v[0].art, '/agents/ok-hello.svg');
  assert.deepEqual(v[0].jokes, ['short', 'x'.repeat(160)], 'non-strings and anything over 160 characters are dropped');
  assert.equal(v[1].art, null, 'never another site');
  assert.equal(v[1].jokes.length, 12);
  assert.equal(v[2].art, null, 'never outside /agents/');
  assert.equal(v[3].art, null);
  assert.deepEqual(v[3].jokes, []);
});

test('a tailnet probe checks an agent on any machine; a non-tailnet url is never probed', async () => {
  const f = path.join(dir, 'agents-remote.json');
  fs.writeFileSync(f, JSON.stringify({ agents: [
    { key: 'lap', name: 'Lap', machine: 'LAPTOP', status: 'live', door: { local: 'http://127.0.0.1:4318/', phone: 'https://laptop.example.ts.net/' }, probe: { url: 'https://laptop.example.ts.net/mark.svg' } },
    { key: 'rogue', name: 'Rogue', machine: 'LAPTOP', status: 'live', door: { local: null, phone: 'https://example.com/' }, probe: { url: 'https://example.com/health' } },
  ] }));
  const seen = [];
  let up = true;
  const ag = A.createAgents({ file: f, dirs: [], self: 'DESK', probe: async (p) => { seen.push(p.url); return up; } });
  await ag.refresh(true);
  assert.deepEqual(seen, ['https://laptop.example.ts.net/mark.svg'], 'only the tailnet probe is made');
  const [lap, rogue] = ag.view([], 1000).agents;
  assert.equal(lap.state, 'running');
  assert.equal(lap.door.phone, 'https://laptop.example.ts.net/');
  assert.equal(lap.door.local, null, "the laptop's loopback is not a door on this machine");
  assert.equal(rogue.state, 'elsewhere');
  up = false;
  await ag.refresh(true);
  const down = ag.view([], 2000).agents[0];
  assert.equal(down.state, 'off');
  assert.equal(down.door.phone, null, 'no door into an agent that is down');
  assert.equal(A.tailnetUrl('http://laptop.example.ts.net/'), null, 'http is refused');
  assert.equal(A.tailnetUrl('https://evil.example.com/'), null, 'a non-tailnet name is refused');
  assert.equal(await A.probeOnce({ url: 'https://example.com/' }), false, 'the real probe refuses it without a request');
});

test('config/agents.json: the shipped placeholder is the planned "your-specialist", with a valid key and brand', () => {
  const root = path.join(__dirname, '..');
  const agents = A.loadAgents(path.join(root, 'config', 'agents.json'));
  assert.deepEqual(agents.map((a) => a.key), ['your-specialist']);
  const [a] = agents;
  assert.equal(a.status, 'planned');
  assert.equal(a.probe, null, 'a planned agent has nothing to probe');
  for (const c of ['bg', 'panel', 'ink', 'accent', 'accent2']) assert.match(String(a.brand[c]), /^#[0-9a-f]{6}$/i, `brand.${c}`);
  const v = A.createAgents({ file: path.join(root, 'config', 'agents.json'), dirs: [], self: 'DESK', probe: async () => true }).view([], 1000);
  assert.equal(v.agents[0].state, 'planned');
  assert.ok(a.jokes.length >= 2, 'a knock can answer with a different joke');
  assert.deepEqual(v.agents[0].jokes, a.jokes, 'no joke is dropped');
});

// A probe must never hit a path that hands out a session token: a dashboard's /open often answers with a
// redirect carrying its token, so the office probes another path and leaves the door to the person's own browser.
test('config/agents.json: every mark and figure exists, no probe path is a door path or /open, a phone door is https', () => {
  const root = path.join(__dirname, '..');
  const cfg = path.join(root, 'config', 'agents.json');
  const view = A.createAgents({ file: cfg, dirs: [], self: 'DESK', probe: async () => false }).view([], 1000).agents;
  for (const a of A.loadAgents(cfg)) {
    for (const img of [a.brand && a.brand.mark, a.art].filter(Boolean)) {
      const svg = fs.readFileSync(path.join(root, 'public', img.replace(/^\//, '')), 'utf8');
      assert.match(svg, /<svg\b/);
      for (const m of svg.matchAll(/<!--([\s\S]*?)-->/g)) assert.ok(!m[1].includes('--'), `${a.key}: no "--" inside an SVG comment (it breaks the image)`);
    }
    if (a.art) assert.equal(view.find((x) => x.key === a.key).art, a.art, `${a.key}: its figure passes the server's check`);
    if (a.door && a.door.phone) assert.match(a.door.phone, /^https:\/\//, `${a.key}: a phone door is https on the tailnet`);
    if (!a.probe) continue;
    const probePath = a.probe.url ? new URL(a.probe.url).pathname : a.probe.path || '/';
    const doorPaths = [a.door && a.door.local, a.door && a.door.phone].filter(Boolean).map((u) => new URL(u).pathname);
    assert.notEqual(probePath, '/open', `${a.key}: /open hands out a token`);
    assert.ok(!doorPaths.includes(probePath), `${a.key}: the probe ${probePath} must not be a door (${doorPaths.join(', ')})`);
    if (a.probe.url) assert.ok(A.tailnetUrl(a.probe.url), `${a.key}: a remote probe goes to an https tailnet name`);
  }
});

test('route: #/agents is a place', async () => {
  const { parseRoute, formatRoute } = await import('../src/ui/route.js');
  assert.deepEqual(parseRoute('#/agents'), { tab: 'agents' });
  assert.equal(formatRoute({ tab: 'agents' }), '#/agents');
});
