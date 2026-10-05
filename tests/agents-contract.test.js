'use strict';

/**
 * agents-contract.test.js — the agent contract (agents/CONTRACT.md, checked by agents/lib/agents.js):
 * a good agent.json passes; each check refuses what CONTRACT.md says it refuses and names the field;
 * the probe rule (never /open, never a door, its port is the door's); requires.skills is names only
 * (lower-case letters and "-", at most 30 characters, at most 30 names); the filled template passes;
 * listAgents reads one level down only, and flags a key that is not its folder's name, a missing
 * image, bad JSON and a key already found in an earlier folder.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const lib = require('../agents/lib/agents');

const good = () => ({
  key: 'sample', name: 'Sample', title: 'The Sample Desk', line: 'Reads everything on a topic.', status: 'live',
  door: { local: 'http://127.0.0.1:7601/', phone: null },
  probe: { port: 7601, path: '/health' },
  start: 'node dashboard/server.js', autostart: true, match: ['sample', 'sample desk'],
  brand: { bg: '#0B1020', panel: '#16213E', ink: '#E6EDF7', accent: '#38BDF8', accent2: '#818CF8', font: 'Inter, system-ui, sans-serif', mark: 'mark.svg' },
  art: 'art.svg', jokes: ['I read the footnotes so you do not have to.'],
});
const errorsOf = (patch) => { const m = good(); patch(m); return lib.validateManifest(m).errors; };

test('a good agent.json passes; the least an office needs is a key, a name and a brand', () => {
  assert.deepEqual(lib.validateManifest(good()), { ok: true, errors: [] });
  assert.equal(lib.validateManifest({ key: 'kit', name: 'Kit', brand: good().brand }).ok, true);
  for (const m of [null, [], 'sample', 42]) assert.equal(lib.validateManifest(m).ok, false, JSON.stringify(m));
});

test('key, name, title, status', () => {
  for (const k of ['Sample', '1sample', 'sample_desk', 'sample desk', '', 'a'.repeat(32)]) {
    assert.match(errorsOf((m) => { m.key = k; }).join(' '), /key/, `key ${JSON.stringify(k)}`);
  }
  for (const k of ['a', 'research-desk-2', 'a'.repeat(31)]) assert.deepEqual(errorsOf((m) => { m.key = k; }), [], k);
  assert.match(errorsOf((m) => { delete m.name; }).join(' '), /name/);
  assert.match(errorsOf((m) => { m.name = 'x'.repeat(41); }).join(' '), /name/);
  assert.deepEqual(errorsOf((m) => { m.name = 'x'.repeat(40); }), []);
  assert.match(errorsOf((m) => { m.title = 7; }).join(' '), /title/);
  assert.match(errorsOf((m) => { m.status = 'busy'; }).join(' '), /status/);
});

test('door.local is plain http on 127.0.0.1 or localhost with a port; door.phone is an https tailnet name or null', () => {
  for (const u of ['http://127.0.0.1:7601/', 'http://localhost:7601/inbox', 'http://127.0.0.1:7601']) {
    assert.deepEqual(errorsOf((m) => { m.door.local = u; }), [], u);
  }
  for (const u of ['https://127.0.0.1:7601/', 'http://192.168.1.5:7601/', 'http://127.0.0.1/', 'http://127.0.0.1:80/',
    'http://127.0.0.1:70000/', 'http://evil.example:7601/', 'http://127.0.0.1.evil.example:7601/', 'http://127.1:7601/']) {
    assert.match(errorsOf((m) => { m.door.local = u; }).join(' '), /door\.local/, u);
  }
  for (const u of [null, 'https://desk.example-tailnet.ts.net/', 'https://desk.example-tailnet.ts.net:8443/sample/']) {
    assert.deepEqual(errorsOf((m) => { m.door.phone = u; }), [], String(u));
  }
  for (const u of ['http://desk.example-tailnet.ts.net/', 'https://example.com/', 'https://ts.net.example.com/', 'https://evil.example/?x=.ts.net']) {
    assert.match(errorsOf((m) => { m.door.phone = u; }).join(' '), /door\.phone/, u);
  }
});

test('the probe rule: {port, path} or a tailnet {url}; never /open, never a door, and on the door\'s port', () => {
  assert.deepEqual(errorsOf((m) => { m.probe = { url: 'https://desk.example-tailnet.ts.net/sample/health' }; m.autostart = false; }), []);
  assert.deepEqual(errorsOf((m) => { m.probe = null; m.autostart = false; }), []);
  assert.match(errorsOf((m) => { m.probe = { port: 80, path: '/health' }; }).join(' '), /probe\.port/);
  assert.match(errorsOf((m) => { m.probe = { port: 7601, path: 'health' }; }).join(' '), /probe\.path/);
  assert.match(errorsOf((m) => { m.probe = { url: 'https://example.com/health' }; m.autostart = false; }).join(' '), /probe\.url/);
  assert.match(errorsOf((m) => { m.probe = { port: 7601, path: '/open' }; }).join(' '), /\/open/);
  assert.match(errorsOf((m) => { m.probe = { port: 7601, path: '/open/abc' }; }).join(' '), /\/open/);
  assert.match(errorsOf((m) => { m.probe = { port: 7601, path: '/' }; }).join(' '), /also a door/, 'the door / is not a probe');
  assert.match(errorsOf((m) => { m.probe = { port: 7602, path: '/health' }; }).join(' '), /must be the same/);
});

test('brand colours, image names, jokes, match, start and autostart', () => {
  assert.match(errorsOf((m) => { m.brand.accent = 'blue'; }).join(' '), /brand\.accent/);
  assert.match(errorsOf((m) => { delete m.brand.ink; }).join(' '), /brand\.ink/);
  assert.match(errorsOf((m) => { delete m.brand; }).join(' '), /brand/);
  for (const f of ['../mark.svg', 'img/mark.svg', 'img\\mark.svg', 'mark.gif', '/mark.svg', 'C:mark.svg', '..svg', 'a..b.svg']) {
    assert.match(errorsOf((m) => { m.brand.mark = f; }).join(' '), /brand\.mark/, f);
    assert.match(errorsOf((m) => { m.art = f; }).join(' '), /\bart\b/, f);
  }
  assert.deepEqual(errorsOf((m) => { m.art = 'figure.png'; m.brand.mark = 'Mark_2.SVG'; }), []);
  assert.match(errorsOf((m) => { m.jokes = Array(13).fill('x'); }).join(' '), /jokes/);
  assert.match(errorsOf((m) => { m.jokes = ['x'.repeat(161)]; }).join(' '), /joke/);
  assert.match(errorsOf((m) => { m.jokes = [7]; }).join(' '), /joke/);
  assert.deepEqual(errorsOf((m) => { m.jokes = Array(12).fill('x'.repeat(160)); }), []);
  assert.match(errorsOf((m) => { m.match = 'sample'; }).join(' '), /match/);
  assert.match(errorsOf((m) => { m.start = ''; }).join(' '), /start/);
  assert.match(errorsOf((m) => { m.autostart = 'yes'; }).join(' '), /autostart/);
  assert.match(errorsOf((m) => { delete m.start; }).join(' '), /start is needed/);
  assert.match(errorsOf((m) => { m.probe = { url: 'https://desk.example-tailnet.ts.net/h' }; }).join(' '), /probe with a port/);
  assert.deepEqual(errorsOf((m) => { delete m.start; m.autostart = false; }), []);
});

test('requires.skills: skill names only, lower-case letters and "-", at most 30 characters, at most 30 of them', () => {
  const skills = (list) => errorsOf((m) => { m.requires = { skills: list }; });
  assert.deepEqual(skills(['marathon-research', 'marathon-research-council', 'distill', 'quick-research']), []);
  assert.deepEqual(skills([]), []);
  assert.deepEqual(errorsOf((m) => { m.requires = {}; }), [], 'requires without skills is fine');
  assert.deepEqual(skills(['a'.repeat(30)]), [], '30 characters is the most');
  assert.deepEqual(skills(Array.from({ length: 30 }, () => 'distill')), [], '30 names is the most');
  for (const bad of ['Distill', 'quick_research', '2nd-brain', 'skill9', '-distill', 'quick research', '../distill', 'a/b', '', 'a'.repeat(31)]) {
    assert.match(skills([bad]).join(' '), /requires\.skills/, `name ${JSON.stringify(bad)}`);
  }
  for (const bad of [[7], [null], [{ name: 'distill' }]]) assert.match(skills(bad).join(' '), /requires\.skills/, JSON.stringify(bad));
  assert.match(skills(Array.from({ length: 31 }, () => 'distill')).join(' '), /at most 30/);
  assert.match(skills('distill').join(' '), /requires\.skills/, 'a list, not one name');
  assert.match(errorsOf((m) => { m.requires = ['distill']; }).join(' '), /requires must be an object/);
  assert.match(errorsOf((m) => { m.requires = 'distill'; }).join(' '), /requires must be an object/);
});

test('the template, filled, passes the contract; a quote in a value is escaped', () => {
  const values = lib.templateValues({ key: 'sample', name: 'Sample', title: 'The Sample Desk', line: 'Reads "everything" \\ twice.', port: 7601 });
  const m = JSON.parse(lib.fill(fs.readFileSync(path.join(lib.TEMPLATE, 'agent.json'), 'utf8'), values, 'json'));
  assert.deepEqual(lib.validateManifest(m), { ok: true, errors: [] });
  assert.equal(m.probe.port, 7601, 'the port is a number');
  assert.equal(m.door.local, 'http://127.0.0.1:7601/');
  assert.equal(m.line, 'Reads "everything" \\ twice.');
  assert.deepEqual(m.match, ['sample', 'sample desk'], 'the title stands in when the name is the key');
  assert.equal(m.requires, undefined, 'a new agent requires no skills until you add them');
});

test('listAgents: one level down only; a folder must match its key; a missing image, bad JSON and a repeat key are errors', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-list-'));
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-list2-'));
  const put = (base, rel, body) => {
    const f = path.join(base, ...rel.split('/'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, typeof body === 'string' ? body : JSON.stringify(body));
  };
  const bare = (key) => { const m = good(); m.key = key; delete m.art; delete m.brand.mark; return m; };
  put(d, 'sample/agent.json', bare('sample'));
  put(d, 'other/agent.json', bare('wrong'));
  put(d, 'broken/agent.json', '{ not json');
  put(d, 'nomark/agent.json', Object.assign(bare('nomark'), { art: 'art.svg' }));
  put(d, 'deep/inner/agent.json', bare('inner'));
  put(d, 'loose.txt', 'not a folder');
  put(d2, 'sample/agent.json', bare('sample'));
  try {
    const all = lib.listAgents([d, path.join(d, 'no-such-folder'), d2]);
    const first = Object.fromEntries(all.filter((a) => path.dirname(a.dir) === d).map((a) => [a.key, a]));
    assert.deepEqual(Object.keys(first).sort(), ['broken', 'sample', 'nomark', 'other']);
    assert.equal(first.sample.ok, true);
    assert.match(first.other.errors.join(' '), /folder name/);
    assert.match(first.broken.errors.join(' '), /not valid JSON/);
    assert.match(first.nomark.errors.join(' '), /art\.svg is named/);
    assert.ok(!all.some((a) => a.key === 'inner'), 'never deeper than one level');
    const again = all.find((a) => a.key === 'sample' && path.dirname(a.dir) === d2);
    assert.equal(again.ok, false);
    assert.match(again.errors.join(' '), /already in/);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
    fs.rmSync(d2, { recursive: true, force: true });
  }
});
