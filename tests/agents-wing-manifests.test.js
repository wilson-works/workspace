'use strict';

/**
 * agents-wing-manifests.test.js — the Agents' wing picks up agent.json manifests by itself
 * (src/server/agents.js with opts.dirs, and the /agent-files route in src/server/server.js).
 *
 * A valid manifest in an agents folder shows as an office on this machine, with its mark and figure
 * as /agent-files/<key>/<file>; one that fails the contract is left out; config/agents.json wins a
 * key both name; the "your-specialist" placeholder hides once any real agent exists; a new manifest
 * is probed at once, not after the 20-second wait. The route serves only an .svg or .png directly
 * inside that agent's own folder, sandboxed. Every port here is one the system hands out.
 */

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const path = require('path');
const A = require('../src/server/agents');
const lib = require('../agents/lib/agents');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-wing-'));
const dir = path.join(base, 'agents');
const placeholderOnly = path.join(__dirname, '..', 'config', 'agents.json');
after(() => fs.rmSync(base, { recursive: true, force: true }));

lib.scaffold(path.join(dir, 'alpha'), { key: 'alpha', name: 'Alpha', title: 'The First Desk', line: 'Does the first thing.', color: '#34D399', port: 7701 });
lib.scaffold(path.join(dir, 'beta'), { key: 'beta', name: 'Beta', title: 'The Second Desk', port: 7702 });
// beta breaks the contract: its probe is its door.
const betaFile = path.join(dir, 'beta', 'agent.json');
fs.writeFileSync(betaFile, JSON.stringify(Object.assign(JSON.parse(fs.readFileSync(betaFile, 'utf8')), { probe: { port: 7702, path: '/' } })));
fs.writeFileSync(path.join(dir, 'alpha', 'notes.txt'), 'not an image');
fs.mkdirSync(path.join(dir, 'alpha', 'sub'));
fs.writeFileSync(path.join(dir, 'alpha', 'sub', 'deep.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
fs.writeFileSync(path.join(base, 'outside.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');

function spare() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

test('a valid manifest is an office on this machine; a broken one is left out; the placeholder hides', async () => {
  const probed = [];
  const ag = A.createAgents({ file: placeholderOnly, dirs: [dir], self: 'DESK', probe: async (p) => { probed.push(p.port); return true; } });
  await ag.refresh(true);
  assert.deepEqual(probed, [7701], 'only the valid manifest is probed');
  const v = ag.view([], 1000).agents;
  assert.deepEqual(v.map((a) => a.key), ['alpha'], 'beta fails the contract; your-specialist hides once a real agent exists');
  const [alpha] = v;
  assert.equal(alpha.name, 'Alpha');
  assert.equal(alpha.title, 'The First Desk');
  assert.equal(alpha.machine, 'DESK', "a manifest agent runs on this machine");
  assert.equal(alpha.state, 'running');
  assert.equal(alpha.door.local, 'http://127.0.0.1:7701/');
  assert.equal(alpha.brand.mark, '/agent-files/alpha/mark.svg');
  assert.equal(alpha.brand.accent, '#34D399');
  assert.equal(alpha.art, '/agent-files/alpha/art.svg');
  assert.equal(alpha.jokes.length, 3);

  const alone = A.createAgents({ file: placeholderOnly, dirs: [], self: 'DESK', probe: async () => false }).view([], 1000).agents;
  assert.deepEqual(alone.map((a) => a.key), ['your-specialist'], 'with no real agent the placeholder stays');
});

test('config/agents.json wins a key both name; its other agents stay beside the manifests', () => {
  const f = path.join(base, 'config-dup.json');
  fs.writeFileSync(f, JSON.stringify({ agents: [
    { key: 'alpha', name: 'Alpha (config)', machine: 'LAPTOP', status: 'live', door: { local: null, phone: null }, probe: null, brand: {} },
    { key: 'kit', name: 'Kit', machine: 'DESK', status: 'planned', brand: {} },
  ] }));
  const v = A.createAgents({ file: f, dirs: [dir], self: 'DESK', probe: async () => false }).view([], 1000).agents;
  assert.deepEqual(v.map((a) => a.key), ['alpha', 'kit']);
  assert.equal(v[0].name, 'Alpha (config)');
  assert.equal(v[0].machine, 'LAPTOP');
  assert.equal(v[0].art, null, "the config entry's own (absent) figure, not the manifest's");
});

test('an agent that appears later is probed at once, not after the 20-second wait', async () => {
  const later = path.join(base, 'later');
  fs.mkdirSync(later);
  const probed = [];
  const ag = A.createAgents({ file: placeholderOnly, dirs: [later], self: 'DESK', probe: async (p) => { probed.push(p.port); return true; } });
  await ag.refresh(true);
  assert.deepEqual(probed, []);
  lib.scaffold(path.join(later, 'gamma'), { key: 'gamma', name: 'Gamma', title: 'The Third Desk', port: 7703 });
  await ag.refresh(false);
  assert.deepEqual(probed, [7703]);
  assert.equal(ag.view([], 1000).agents[0].state, 'running');
  await ag.refresh(false);
  assert.deepEqual(probed, [7703], 'once checked, it waits for the next round like the rest');
});

test('the figure check: the office\'s own svgs, or an svg/png in that agent\'s own /agent-files folder, nothing else', () => {
  const f = path.join(base, 'config-art.json');
  fs.writeFileSync(f, JSON.stringify({ agents: [
    { key: 'one', name: 'One', art: '/agent-files/one/art.svg' },
    { key: 'two', name: 'Two', art: '/agent-files/two/figure.png' },
    { key: 'three', name: 'Three', art: '/agent-files/other/art.svg' },
    { key: 'four', name: 'Four', art: '/agent-files/four/../agent.json' },
    { key: 'five', name: 'Five', art: '/agent-files/five/art.gif' },
    { key: 'six', name: 'Six', art: '/agent-files/six/sub/art.svg' },
    { key: 'seven', name: 'Seven', art: '/agents/seven.svg' },
  ] }));
  const art = A.createAgents({ file: f, dirs: [], self: 'DESK', probe: async () => false }).view([], 1000).agents.map((a) => a.art);
  assert.deepEqual(art, ['/agent-files/one/art.svg', '/agent-files/two/figure.png', null, null, null, null, '/agents/seven.svg']);
});

test('fileFor: only an .svg or .png directly inside a valid agent\'s own folder', () => {
  const ag = A.createAgents({ file: placeholderOnly, dirs: [dir], self: 'DESK', probe: async () => false });
  assert.equal(ag.fileFor('alpha', 'art.svg'), path.join(dir, 'alpha', 'art.svg'));
  assert.equal(ag.fileFor('alpha', 'mark.svg'), path.join(dir, 'alpha', 'mark.svg'));
  for (const [key, name] of [
    ['alpha', '../outside.svg'], ['alpha', '..\\outside.svg'], ['alpha', 'sub/deep.svg'], ['alpha', 'agent.json'],
    ['alpha', 'notes.txt'], ['alpha', 'missing.svg'], ['beta', 'art.svg'], ['nobody', 'art.svg'], ['../agents', 'art.svg'],
  ]) assert.equal(ag.fileFor(key, name), null, `${key}/${name}`);
  try {
    fs.symlinkSync(path.join(base, 'outside.svg'), path.join(dir, 'alpha', 'link.svg'));
  } catch (_) { return; } // no right to make links here: nothing more to check
  assert.equal(ag.fileFor('alpha', 'link.svg'), null, 'a link is never followed');
});

test('the server serves /agent-files/<key>/<file> from that folder, sandboxed, and nothing else', async () => {
  const { start } = require('../src/server/server');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-wing-home-'));
  const port = await spare();
  const h = start({ root: home, home, port, push: false, agentsFile: placeholderOnly, agentsDirs: [dir] });
  const get = (p) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method: 'GET', headers: { Host: `127.0.0.1:${port}` } }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
  try {
    await new Promise((r) => (h.server.listening ? r() : h.server.once('listening', r)));
    const ok = await get('/agent-files/alpha/art.svg');
    assert.equal(ok.status, 200);
    assert.match(ok.headers['content-type'], /^image\/svg\+xml/);
    assert.match(ok.headers['content-security-policy'], /sandbox/);
    assert.equal(ok.headers['x-content-type-options'], 'nosniff');
    assert.equal(ok.body, fs.readFileSync(path.join(dir, 'alpha', 'art.svg'), 'utf8'));
    for (const p of ['/agent-files/alpha/agent.json', '/agent-files/alpha/..%2F..%2Foutside.svg', '/agent-files/alpha/%2e%2e',
      '/agent-files/alpha/sub/deep.svg', '/agent-files/beta/art.svg', '/agent-files/alpha/notes.txt']) {
      assert.equal((await get(p)).status, 404, p);
    }
    const api = JSON.parse((await get('/api/agents')).body);
    assert.deepEqual(api.agents.map((a) => a.key), ['alpha']);
    assert.equal(api.agents[0].art, '/agent-files/alpha/art.svg');
  } finally {
    h.stop();
    fs.rmSync(home, { recursive: true, force: true });
  }
});
