'use strict';

/**
 * agents-catalog.test.js — the WilsonWorks agents anyone can install (agents/catalog.json, read by
 * agents/lib/catalog.js), install-agent <key>, and `agent.js catalog`.
 *
 * Hermetic: a temp catalog (WW_AGENT_CATALOG) whose one agent is a package made here with the template,
 * a temp Hub, and nothing started (--no-start). The shipped catalog is only read.
 *
 * Proves: the shipped catalog lists Louise first, free, from her git address, with the question the
 * installer asks; a key (any case) resolves to its source, a relative folder from the catalog's own
 * folder; a folder, a .zip file or a git address stays as it is; an unknown name is refused with the
 * catalog listed; a catalog without a source, or not JSON, is a plain sentence; install-agent <key>
 * installs from the catalog and an unknown name exits 2 with the catalog; `agent.js catalog` marks what
 * is installed.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawnSync } = require('child_process');
const lib = require('../agents/lib/agents');
const catalog = require('../agents/lib/catalog');

const REPO = path.join(__dirname, '..');
const INSTALL = path.join(REPO, 'agents', 'bin', 'install-agent.js');
const AGENT = path.join(REPO, 'agents', 'bin', 'agent.js');

function spare() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

/** A temp catalog with one agent, "sample", whose source is a relative folder beside the catalog. */
async function world(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-catalog-'));
  const hub = path.join(base, 'Hub');
  fs.mkdirSync(path.join(hub, '.hub'), { recursive: true });
  fs.writeFileSync(path.join(hub, '.hub', 'hub.json'), JSON.stringify({ format: 1, machine: 'DESK', role: 'command', code_zone: '20-Coding/Projects' }));
  const cat = path.join(base, 'cat');
  lib.scaffold(path.join(cat, 'packages', 'sample'), { key: 'sample', name: 'Sample', title: 'The Sample Desk', port: await spare() });
  const file = path.join(cat, 'catalog.json');
  fs.writeFileSync(file, JSON.stringify({ agents: [
    { key: 'sample', name: 'Sample', title: 'The Sample Desk', line: 'Does the sample job.', source: 'packages/sample', price: 'free', offer: 'Sample can move in. Install it?' },
  ] }));
  const before = process.env.WW_AGENT_CATALOG;
  process.env.WW_AGENT_CATALOG = file;
  t.after(() => {
    if (before === undefined) delete process.env.WW_AGENT_CATALOG; else process.env.WW_AGENT_CATALOG = before;
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 3 });
  });
  return { base, hub, cat, file, pkg: path.join(cat, 'packages', 'sample'), agents: path.join(hub, '50-AI', 'agents') };
}

test('the shipped catalog: Louise first, free, from her git address, with the installer\'s question', () => {
  const before = process.env.WW_AGENT_CATALOG;
  delete process.env.WW_AGENT_CATALOG;
  try {
    assert.equal(catalog.file(), path.join(REPO, 'agents', 'catalog.json'));
    const list = catalog.read();
    assert.ok(list.length >= 1);
    assert.equal(list[0].key, 'louise');
    assert.equal(list[0].name, 'Louise');
    assert.equal(list[0].title, 'The Research Librarian');
    assert.equal(list[0].price, 'free');
    assert.equal(list[0].source, 'https://github.com/wilson-works/louise.git');
    assert.match(list[0].offer, /^Louise, the research librarian, can move into your office now\. Install her\?$/);
    assert.equal(new Set(list.map((a) => a.key)).size, list.length, 'each key once');
    for (const a of list) {
      assert.ok(lib.KEY_RE.test(a.key), a.key);
      assert.ok(!a.line || a.line.length <= 200, `${a.key}: its line fits an agent.json line`);
      assert.ok(lib.GIT_URL_RE.test(a.source), `${a.key}: a shipped source is a git address`);
    }
    assert.equal(catalog.resolve('louise').source, 'https://github.com/wilson-works/louise.git');
  } finally {
    if (before !== undefined) process.env.WW_AGENT_CATALOG = before;
  }
});

test('resolve: a key (any case) is its source; a folder, .zip or git address stays; anything else is refused with the catalog', async (t) => {
  const w = await world(t);
  assert.equal(catalog.file(), path.resolve(w.file));

  const byKey = catalog.resolve('sample');
  assert.equal(byKey.source, path.resolve(w.pkg), 'a relative source is read from the catalog\'s folder');
  assert.equal(byKey.entry.name, 'Sample');
  assert.equal(catalog.resolve('  SAMPLE ').source, path.resolve(w.pkg));
  assert.equal(catalog.find('sample').price, 'free');
  assert.equal(catalog.find('nobody'), null);

  assert.deepEqual(catalog.resolve(w.pkg), { source: w.pkg, entry: null }, 'a folder');
  const zip = path.join(w.base, 'agent.zip');
  fs.writeFileSync(zip, 'PK');
  assert.deepEqual(catalog.resolve(zip), { source: zip, entry: null }, 'a .zip file');
  for (const g of ['https://github.com/alex-example/my-agent.git', 'git@github.com:alex-example/my-agent.git', 'ssh://git@example.com/a.git']) {
    assert.deepEqual(catalog.resolve(g), { source: g, entry: null }, g);
  }

  for (const bad of ['nobody', 'missing.zip', path.join(w.base, 'no-such-folder')]) {
    assert.throws(() => catalog.resolve(bad), (e) => {
      assert.equal(e.refused, true);
      assert.match(e.message, /is not a folder, a \.zip file, a git address or one of our agents/);
      assert.match(e.message, /sample +Sample, The Sample Desk/);
      assert.match(e.message, /Install one: node agents\/bin\/install-agent\.js <key>/);
      return true;
    }, bad);
  }
});

test('lines: each agent with its line, marked installed or not installed when asked', async (t) => {
  await world(t);
  const plain = catalog.lines();
  assert.equal(plain[0], 'The WilsonWorks agents you can install:');
  assert.ok(!plain.join('\n').includes('installed\n'), 'no marks unless asked');
  assert.ok(plain.some((l) => l.includes('Does the sample job.')));
  assert.match(catalog.lines(new Set(['sample'])).join('\n'), /sample +Sample, The Sample Desk +free +installed/);
  assert.match(catalog.lines(new Set()).join('\n'), /sample +Sample, The Sample Desk +free +not installed/);
});

test('a catalog that is not JSON, or an entry without a source or with a bad key, is a plain sentence', async (t) => {
  const w = await world(t);
  fs.writeFileSync(w.file, '{ not json');
  assert.throws(() => catalog.read(), /The agent catalog .* cannot be read/);
  fs.writeFileSync(w.file, JSON.stringify({ agents: [{ key: 'sample', name: 'Sample' }] }));
  assert.throws(() => catalog.read(), /Entry 1 .* needs a key .*, a name and a source/);
  fs.writeFileSync(w.file, JSON.stringify({ agents: [{ key: 'Not A Key', name: 'X', source: 'x' }] }));
  assert.throws(() => catalog.read(), /Entry 1/);
  fs.writeFileSync(w.file, JSON.stringify({ list: [] }));
  assert.throws(() => catalog.read(), /needs a list called "agents"/);
});

test('install-agent <key> installs from the catalog; an unknown name exits 2 with the catalog; agent.js catalog marks it installed', async (t) => {
  const w = await world(t);
  const env = Object.assign({}, process.env, {
    HUB_ROOT: w.hub,
    WW_AGENT_CATALOG: w.file,
    WORKSPACE_CONFIG: path.join(w.base, 'no-workspace.config.json'),
    WORKSPACE_HOME: path.join(w.base, 'office-home'),
  });
  const run = (bin, ...args) => spawnSync(process.execPath, [bin, ...args], { env, encoding: 'utf8', timeout: 60000, windowsHide: true });

  const unknown = run(INSTALL, 'nobody', '--hub', w.hub, '--no-start');
  assert.equal(unknown.status, 2, unknown.stdout);
  assert.match(unknown.stdout, /NOT DONE: "nobody" is not a folder, a \.zip file, a git address or one of our agents/);
  assert.match(unknown.stdout, /sample +Sample, The Sample Desk/);
  assert.ok(!fs.existsSync(w.agents), 'nothing written');

  const before = run(AGENT, 'catalog', '--hub', w.hub);
  assert.equal(before.status, 0, before.stdout);
  assert.match(before.stdout, /sample +Sample, The Sample Desk +free +not installed/);

  const dry = run(INSTALL, 'sample', '--hub', w.hub, '--dry-run');
  assert.equal(dry.status, 0, dry.stdout);
  assert.match(dry.stdout, /Plan for installing Sample, from .*packages.sample/);
  assert.ok(!fs.existsSync(path.join(w.agents, 'sample')), 'a dry run writes nothing');

  const ok = run(INSTALL, 'Sample', '--hub', w.hub, '--yes', '--no-start');
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(ok.stdout, /Installing Sample, from /);
  assert.ok(fs.existsSync(path.join(w.agents, 'sample', 'agent.json')));
  assert.equal(lib.runningPid(path.join(w.agents, 'sample')), null, '--no-start starts nothing');

  const after = run(AGENT, 'catalog', '--hub', w.hub);
  assert.match(after.stdout, /sample +Sample, The Sample Desk +free +installed/);
  assert.doesNotMatch(after.stdout, /not installed/);
});
