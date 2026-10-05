'use strict';

/**
 * agents-scaffold.test.js — making a new agent (agents/lib/agents.js scaffold, the subagent
 * registration, freePort, the template dashboard) and the new-agent command.
 *
 * scaffold writes every template file with its placeholders filled ({{agent_dir}} is left for the
 * registration, which fills it with the agent's folder); a dry run writes nothing; an existing folder
 * is refused. The subagent file: absent +, same =, yours differs ! (kept), replace ~. freePort skips
 * ports another agent.json claims and ports something listens on. The dashboard binds 127.0.0.1,
 * answers /health with {"ok":true}, shows its name and counts, and refuses a foreign Host; it is
 * stopped by the pid it recorded. new-agent refuses a bad or existing key, writes nothing on
 * --dry-run, and registers the subagent under the Hub. Every port here is one the system hands out.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');
const lib = require('../agents/lib/agents');

const REPO = path.join(__dirname, '..');
const NEW_AGENT = path.join(REPO, 'agents', 'bin', 'new-agent.js');

/** A port nothing listens on right now, as the system hands it out. */
function spare() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

function get(port, p, host) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method: 'GET', headers: { Host: host || `127.0.0.1:${port}` } }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
    });
    req.on('error', reject);
    req.end();
  });
}

const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

/** A minimal Hub: the marker is what makes a folder one. */
function makeHub() {
  const hub = tmp('agents-hub');
  fs.mkdirSync(path.join(hub, '.hub'), { recursive: true });
  fs.writeFileSync(path.join(hub, '.hub', 'hub.json'), JSON.stringify({ format: 1, machine: 'DESK', role: 'command', code_zone: '20-Coding/Projects' }));
  return hub;
}

test('scaffold writes every template file, filled; a dry run writes nothing; an existing folder is refused', () => {
  const base = tmp('agents-scaffold');
  try {
    const dir = path.join(base, 'sample');
    const dry = lib.scaffold(dir, { key: 'sample', name: 'Sample', title: 'The Sample Desk', line: 'Reads everything.', color: '#38BDF8', port: 7611, dryRun: true });
    assert.ok(!fs.existsSync(dir), 'a dry run writes nothing');
    const made = lib.scaffold(dir, { key: 'sample', name: 'Sample', title: 'The Sample Desk', line: 'Reads everything.', color: '#38BDF8', port: 7611 });
    assert.deepEqual(made.lines, dry.lines, 'the plan is what gets written');

    const want = ['CLAUDE.md', 'README.md', 'agent.json', 'art.svg', 'brains/README.md', 'brains/example-topic.md',
      'dashboard/package.json', 'dashboard/server.js', 'mark.svg', 'memory/MEMORY.md', 'rules/README.md', 'rules/never-send-without-a-yes.md', 'subagent.md'];
    for (const f of want) assert.ok(fs.existsSync(path.join(dir, ...f.split('/'))), f);
    assert.equal(made.lines.length, want.length);
    assert.ok(made.lines.every((l) => l.startsWith('+ ')));

    const m = JSON.parse(fs.readFileSync(path.join(dir, 'agent.json'), 'utf8'));
    assert.deepEqual(lib.validateManifest(m), { ok: true, errors: [] });
    assert.equal(m.key, 'sample');
    assert.equal(m.probe.port, 7611);
    assert.equal(m.door.local, 'http://127.0.0.1:7611/');
    assert.equal(m.brand.accent, '#38BDF8');
    assert.equal(m.autostart, true);
    assert.deepEqual(lib.listAgents([base]).map((a) => [a.key, a.ok]), [['sample', true]], 'its images are there too');

    for (const f of want) {
      const text = fs.readFileSync(path.join(dir, ...f.split('/')), 'utf8');
      const left = (text.match(/\{\{\w+\}\}/g) || []).filter((t) => t !== '{{agent_dir}}');
      assert.deepEqual(left, [], `${f}: every placeholder is filled`);
      if (f !== 'subagent.md') assert.ok(!text.includes('{{agent_dir}}'), `${f}: only the subagent keeps {{agent_dir}}`);
    }
    assert.match(fs.readFileSync(path.join(dir, 'mark.svg'), 'utf8'), />S</, 'the mark is its initial');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'dashboard', 'package.json'), 'utf8')).type, 'commonjs',
      'the dashboard stays CommonJS even under a folder whose package.json says type: module');
    assert.match(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'), /# Sample, The Sample Desk/);

    assert.throws(() => lib.scaffold(dir, { key: 'sample', name: 'Sample', title: 'x', port: 7611 }), /already exists/);
    assert.throws(() => lib.scaffold(path.join(base, 'Bad'), { key: 'Bad', name: 'Bad', title: 'x', port: 7611 }), /not a key/);
    assert.throws(() => lib.scaffold(path.join(base, 'long'), { key: 'long', name: 'x'.repeat(41), title: 'x', port: 7611 }), /contract/);
    assert.ok(!fs.existsSync(path.join(base, 'long')), 'nothing is written when the manifest would fail');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('the subagent: {{agent_dir}} becomes its folder; absent +, same =, yours differs ! and is kept, replace ~', () => {
  const base = tmp('agents-sub');
  try {
    const dir = path.join(base, 'agents', 'sample');
    lib.scaffold(dir, { key: 'sample', name: 'Sample', title: 'The Sample Desk', port: 7611 });
    const text = lib.subagentText(dir);
    const folder = path.resolve(dir).replace(/\\/g, '/');
    assert.match(text, /^---\r?\nname: sample\r?\ndescription: "Sample, The Sample Desk\./);
    assert.match(text, /\r?\nmodel: \w+\r?\n---/);
    assert.ok(text.includes(`You are Sample, The Sample Desk. Before working, read ${folder}/CLAUDE.md`));
    assert.ok(!text.includes('{{'), 'nothing left to fill');

    const subs = path.join(base, 'hub', '.claude', 'agents');
    assert.match(lib.registerSubagent(subs, 'sample', text, { dryRun: true }), /^\+ /);
    assert.ok(!fs.existsSync(path.join(subs, 'sample.md')), 'a dry run writes nothing');
    assert.match(lib.registerSubagent(subs, 'sample', text), /^\+ /);
    assert.equal(fs.readFileSync(path.join(subs, 'sample.md'), 'utf8'), text);
    assert.match(lib.registerSubagent(subs, 'sample', text), /^= /);
    fs.writeFileSync(path.join(subs, 'sample.md'), 'my own edit');
    assert.match(lib.registerSubagent(subs, 'sample', text), /^! .*kept/);
    assert.equal(fs.readFileSync(path.join(subs, 'sample.md'), 'utf8'), 'my own edit', 'yours is kept');
    assert.match(lib.registerSubagent(subs, 'sample', text, { replace: true }), /^~ /);
    assert.equal(fs.readFileSync(path.join(subs, 'sample.md'), 'utf8'), text);

    // An agent folder with no subagent.md of its own still gets one, from the template.
    fs.rmSync(path.join(dir, 'subagent.md'));
    assert.equal(lib.subagentText(dir), text);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('freePort skips a port another agent.json claims and a port something listens on', async () => {
  const base = tmp('agents-ports');
  const holder = net.createServer();
  try {
    const claimed = await spare();
    const dir = path.join(base, 'kit');
    lib.scaffold(dir, { key: 'kit', name: 'Kit', title: 'x', port: claimed });
    const p1 = await lib.freePort([base], claimed);
    assert.notEqual(p1, claimed, 'claimed by kit\'s agent.json');
    assert.ok(p1 > claimed);
    assert.equal(lib.usedPorts([base]).has(claimed), true);
    assert.equal(lib.usedPorts([base], 'kit').has(claimed), false, 'its own port is not taken from itself');

    const busy = await spare();
    await new Promise((r) => holder.listen(busy, '127.0.0.1', r));
    assert.equal(await lib.listening(busy), true);
    const p2 = await lib.freePort([], busy);
    assert.notEqual(p2, busy, 'something listens there');
  } finally {
    holder.close();
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('the dashboard: 127.0.0.1 only, its page in its own name, /health without a token, a foreign Host refused, stopped by its pid', async () => {
  const base = tmp('agents-dash');
  const dir = path.join(base, 'sample');
  try {
    const port = await spare();
    lib.scaffold(dir, { key: 'sample', name: 'Sample', title: 'The Sample Desk', line: 'Reads everything.', port });
    const pid = await lib.startAgent(dir);
    assert.equal(Number(fs.readFileSync(path.join(dir, 'dashboard', '.pid'), 'utf8').trim()), pid, 'the pid is recorded');
    assert.equal(await lib.waitUp({ port, path: '/health' }, 15000), true, 'it answers within 15 s');

    const health = await get(port, '/health');
    assert.equal(health.status, 200);
    assert.deepEqual(JSON.parse(health.body), { ok: true });

    const page = await get(port, '/');
    assert.equal(page.status, 200);
    assert.match(page.type, /text\/html/);
    assert.match(page.body, /Sample/);
    assert.match(page.body, /The Sample Desk/);
    assert.match(page.body, /<p class="n">1<\/p><p class="w">brain topic<\/p>/, 'one topic besides the README');
    assert.match(page.body, /<p class="n">1<\/p><p class="w">rule<\/p>/);
    assert.match(page.body, /<p class="n">1<\/p><p class="w">memory line<\/p>/);
    assert.match(page.body, /I was set up/, 'the latest memory line');

    assert.equal((await get(port, '/', `localhost:${port}`)).status, 200);
    const foreign = await get(port, '/', 'evil.example.com');
    assert.equal(foreign.status, 403, 'a name it was not given is refused (DNS rebinding)');
    assert.ok(!foreign.body.includes('Sample'));
    const mark = await get(port, '/mark.svg');
    assert.equal(mark.status, 200);
    assert.match(mark.type, /image\/svg\+xml/);

    // A memory line written now shows on the next visit: the page is read fresh.
    fs.appendFileSync(path.join(dir, 'memory', 'MEMORY.md'), '- 2026-10-05 Sources go at the end (memory/x.md)\n');
    assert.match((await get(port, '/')).body, /Sources go at the end/);

    assert.deepEqual(await lib.stopAgent(dir), { stopped: pid });
    assert.ok(!fs.existsSync(path.join(dir, 'dashboard', '.pid')));
    assert.equal(await lib.probeLocal({ port, path: '/health' }), false, 'it is down');
    assert.deepEqual(await lib.stopAgent(dir), { none: true }, 'stopping again stops nothing');
  } finally {
    const left = lib.runningPid(dir);
    if (left) await lib.stopAgent(dir);
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('new-agent: refuses a bad or taken key, writes nothing on --dry-run, makes the agent and its subagent under the Hub', async () => {
  const hub = makeHub();
  const env = Object.assign({}, process.env, {
    HUB_ROOT: hub,
    WORKSPACE_CONFIG: path.join(hub, 'no-workspace.config.json'),
    WORKSPACE_HOME: path.join(hub, 'office-home'),
  });
  const run = (...args) => spawnSync(process.execPath, [NEW_AGENT, ...args], { env, encoding: 'utf8', timeout: 60000 });
  try {
    const port = await spare();
    const agents = path.join(hub, '50-AI', 'agents');

    const bad = run('Sample', '--name', 'Sample', '--title', 'The Sample Desk', '--hub', hub, '--no-start');
    assert.equal(bad.status, 2, bad.stdout);
    assert.match(bad.stdout, /NOT DONE/);

    const noName = run('sample', '--title', 'The Sample Desk', '--hub', hub, '--no-start');
    assert.equal(noName.status, 2, noName.stdout);

    const dry = run('sample', '--name', 'Sample', '--title', 'The Sample Desk', '--hub', hub, '--port', String(port), '--dry-run');
    assert.equal(dry.status, 0, dry.stdout);
    assert.match(dry.stdout, /\+ .*sample\/agent\.json/);
    assert.ok(!fs.existsSync(path.join(agents, 'sample')), 'a dry run writes nothing');
    assert.ok(!fs.existsSync(path.join(hub, '.claude', 'agents', 'sample.md')));

    const made = run('sample', '--name', 'Sample', '--title', 'The Sample Desk', '--line', 'Reads everything.', '--hub', hub, '--port', String(port), '--no-start');
    assert.equal(made.status, 0, made.stdout);
    const m = JSON.parse(fs.readFileSync(path.join(agents, 'sample', 'agent.json'), 'utf8'));
    assert.equal(m.probe.port, port);
    assert.equal(m.door.local, `http://127.0.0.1:${port}/`);
    const sub = fs.readFileSync(path.join(hub, '.claude', 'agents', 'sample.md'), 'utf8');
    assert.ok(sub.includes(`${path.resolve(agents, 'sample').replace(/\\/g, '/')}/CLAUDE.md`), 'the subagent points at the agent folder');
    assert.ok(made.stdout.includes(`http://127.0.0.1:${port}/`), 'it prints its door');
    assert.match(made.stdout, /now has an office in the Agents' wing/);
    assert.ok(!fs.existsSync(path.join(agents, 'sample', 'dashboard', '.pid')), '--no-start starts nothing');

    const again = run('sample', '--name', 'Sample', '--title', 'The Sample Desk', '--hub', hub, '--no-start');
    assert.equal(again.status, 2, 'a key that exists is refused');
    assert.match(again.stdout, /already an agent called sample/);

    const taken = run('nova', '--name', 'Nova', '--title', 'The Night Desk', '--hub', hub, '--port', String(port), '--no-start');
    assert.equal(taken.status, 2, 'a port another agent.json claims is refused');
    assert.ok(!fs.existsSync(path.join(agents, 'nova')));

    // A subagent file of yours that differs is kept, and the agent is still made.
    fs.mkdirSync(path.join(hub, '.claude', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(hub, '.claude', 'agents', 'nova.md'), 'mine');
    const kept = run('nova', '--name', 'Nova', '--title', 'The Night Desk', '--hub', hub, '--port', String(await spare()), '--no-start');
    assert.equal(kept.status, 0, kept.stdout);
    assert.match(kept.stdout, /! .*nova\.md.*kept/);
    assert.equal(fs.readFileSync(path.join(hub, '.claude', 'agents', 'nova.md'), 'utf8'), 'mine');
  } finally {
    fs.rmSync(hub, { recursive: true, force: true });
  }
});
