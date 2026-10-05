'use strict';

/**
 * config.test.js — workspace.config.json (src/server/config.js).
 *
 * Every key is optional: a missing file, a missing key, an empty string or a
 * value still holding its setup marker ({{CLAUDE: ...}}) means "not set" and
 * the default applies. Each test writes its own config file and points
 * WORKSPACE_CONFIG at it, so this computer's own settings never leak in.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'config-'));
process.env.WORKSPACE_CONFIG = path.join(DIR, 'none.json');

const config = require('../src/server/config');

const DEFAULT_COLORS = ['#A855F7', '#6D28D9'];
const here = () => config.thisComputer();

/**
 * Run fn with a config file holding obj (null: no file at all) and these
 * environment variables (undefined: unset), then put everything back. Each
 * call gets a new file, so the mtime cache never serves an older one.
 */
let n = 0;
function withConfig(obj, fn, env) {
  n += 1;
  const f = path.join(DIR, `workspace.config.${n}.json`);
  if (obj !== null) fs.writeFileSync(f, JSON.stringify(obj));
  const vars = Object.assign({ WORKSPACE_CONFIG: f }, env || {});
  const old = {};
  for (const k of Object.keys(vars)) {
    old[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k];
  }
  try { return fn(); } finally {
    for (const k of Object.keys(old)) {
      if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k];
    }
  }
}

test('a value still holding its {{CLAUDE: ...}} marker counts as not set, like an empty one', () => {
  for (const v of [undefined, null, '', '   ', '{{CLAUDE: what should the sessions call you?}}', '  {{CLAUDE: x}}']) {
    assert.strictEqual(config.unset(v), true, JSON.stringify(v));
  }
  for (const v of ['Alex', 0]) assert.strictEqual(config.unset(v), false, JSON.stringify(v));

  const c = config.normalize({
    use: '{{CLAUDE: personal or company}}',
    owner: { name: '{{CLAUDE: your name}}' },
    brand: { office_name: '{{CLAUDE: office}}', company: '{{CLAUDE: company}}', logo: '{{CLAUDE: logo}}' },
    machines: [{ name: '{{CLAUDE: a short name}}', computer: '{{CLAUDE: this computer}}', hub: true }],
    hub_url: '{{CLAUDE: the hub address}}',
    code_roots: ['{{CLAUDE: your code folders}}', 'C:\\Users\\alex\\code'],
    privacy: { private_work: ['{{CLAUDE: private folders}}'], never_read: [''] },
  });
  assert.strictEqual(c.use, 'personal');
  assert.strictEqual(c.owner.name, null);
  assert.strictEqual(c.brand.office_name, 'WorkSpace');
  assert.strictEqual(c.brand.company, null);
  assert.strictEqual(c.brand.logo, null);
  assert.strictEqual(c.hub_url, null);
  assert.deepStrictEqual(c.code_roots, ['C:\\Users\\alex\\code']);
  assert.deepStrictEqual(c.privacy, { private_work: [], never_read: [] });
  assert.deepStrictEqual(c.machines, [{ name: here(), computer: here(), hub: true, callsigns: 'trees' }]);
});

test('the shipped example, untouched, is all defaults', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'workspace.config.example.json'), 'utf8'));
  const c = config.normalize(raw);
  assert.strictEqual(c.use, 'personal');
  assert.strictEqual(c.owner.name, null);
  assert.strictEqual(c.brand.office_name, 'WorkSpace');
  assert.strictEqual(c.brand.company, null);
  assert.deepStrictEqual(c.brand.colors, DEFAULT_COLORS);
  assert.strictEqual(c.hub_url, null);
  assert.deepStrictEqual(c.code_roots, []);
  assert.deepStrictEqual(c.work_folders, []);
  assert.deepStrictEqual(c.privacy, { private_work: [], never_read: [] });
  assert.deepStrictEqual(c.machines.map((m) => m.name), [here()]);
});

test('no config file: one machine named after this computer, which is the hub and this machine', () => {
  withConfig(null, () => {
    assert.deepStrictEqual(config.machines(), [{ name: here(), computer: here(), hub: true, callsigns: 'trees' }]);
    assert.strictEqual(config.hubMachine(), here());
    assert.strictEqual(config.thisMachine(), here());
    assert.strictEqual(config.poolOf(here()), 'trees');
    assert.strictEqual(config.ownerName(), null);
    assert.strictEqual(config.brand().name, 'WorkSpace');
  }, { WORKSPACE_MACHINE: undefined });
});

test('machine names are upper-cased wall names; repeats, unset and nameless entries are dropped', () => {
  assert.strictEqual(config.wallName('Studio PC.local'), 'STUDIO-PC');
  assert.strictEqual(config.wallName('  -lap_top- '), 'LAP-TOP');
  assert.strictEqual(config.wallName('a'.repeat(30)), 'A'.repeat(24));
  assert.strictEqual(config.wallName('***'), 'UNKNOWN');
  assert.strictEqual(config.wallName(''), 'UNKNOWN');

  const ms = config.normalize({ machines: [
    { name: 'desk', computer: 'studio-pc.local' },
    { name: 'Mini PC', computer: 'mini', hub: true },
    { name: 'laptop', hub: true },
    { name: 'LAPTOP' },
    { name: '{{CLAUDE: a short name}}' },
    { computer: 'nameless' },
    { name: 'spare', callsigns: 'rivers' },
    { name: 'fifth' },
  ] }).machines;
  assert.deepStrictEqual(ms.map((m) => m.name), ['DESK', 'MINI-PC', 'LAPTOP', 'SPARE', 'FIFTH']);
  assert.deepStrictEqual(ms.map((m) => m.computer), ['STUDIO-PC', 'MINI', null, null, null]);
  // Exactly one hub: the first one marked; the second mark is dropped.
  assert.deepStrictEqual(ms.map((m) => m.hub), [false, true, false, false, false]);
  // A machine that names its pool keeps it; the rest take the first pool nobody uses. Never two on
  // one pool: with the three that ship all taken, a machine gets none (its sessions go by title).
  assert.deepStrictEqual(ms.map((m) => m.callsigns), ['trees', 'stars', null, 'rivers', null]);
});

test('with no machine marked hub, the first machine is the hub', () => {
  const ms = config.normalize({ machines: [{ name: 'desk' }, { name: 'laptop' }] }).machines;
  assert.deepStrictEqual(ms.map((m) => [m.name, m.hub]), [['DESK', true], ['LAPTOP', false]]);
});

test('thisMachine: WORKSPACE_MACHINE wins; a lone machine with no computer set is this one', () => {
  withConfig({ machines: [{ name: 'desk', hub: true }, { name: 'laptop' }] }, () => {
    assert.strictEqual(config.thisMachine(), 'LAPTOP');
    assert.deepStrictEqual(config.machineNames(), ['DESK', 'LAPTOP']);
    assert.strictEqual(config.hubMachine(), 'DESK');
    assert.strictEqual(config.poolOf('LAPTOP'), 'stars');
    assert.strictEqual(config.poolOf('TABLET'), null);
  }, { WORKSPACE_MACHINE: 'laptop' });
  withConfig({ machines: [{ name: 'desk' }] }, () => {
    assert.strictEqual(config.thisMachine(), 'DESK');
  }, { WORKSPACE_MACHINE: undefined });
});

test('isPrivate: an entry with a slash is a folder; a plain word matches a whole folder-name word', () => {
  withConfig({ privacy: { private_work: ['C:\\Users\\alex\\clients', 'D:/records/health/', 'tax'] } }, () => {
    // Folders: the folder itself and anything inside it, either slash, any case.
    assert.strictEqual(config.isPrivate('C:\\Users\\alex\\clients'), true);
    assert.strictEqual(config.isPrivate('C:\\Users\\alex\\clients\\acme\\books'), true);
    assert.strictEqual(config.isPrivate('c:/users/alex/clients/acme'), true);
    assert.strictEqual(config.isPrivate('D:\\records\\health\\2026'), true);
    // ...but not a sibling whose name only starts the same way.
    assert.strictEqual(config.isPrivate('C:\\Users\\alex\\clients-archive\\x'), false);
    assert.strictEqual(config.isPrivate('C:\\Users\\alex\\code\\workspace'), false);
    // Words: a whole word of a folder name, split on slashes, spaces, dots, hyphens and underscores.
    assert.strictEqual(config.isPrivate('C:\\Users\\alex\\tax\\2026'), true);
    assert.strictEqual(config.isPrivate('C:\\Users\\alex\\acme-tax'), true);
    assert.strictEqual(config.isPrivate('C:\\Users\\alex\\my_tax\\x'), true);
    assert.strictEqual(config.isPrivate('C:\\Users\\alex\\Tax Returns'), true);
    assert.strictEqual(config.isPrivate('C:\\Users\\alex\\taxonomy'), false);
    assert.strictEqual(config.isPrivate('C:\\Users\\alex\\syntax'), false);
    // Any one of several folders is enough; none at all is not private.
    assert.strictEqual(config.isPrivate(null, 'C:\\Users\\alex\\code', 'C:\\Users\\alex\\tax'), true);
    assert.strictEqual(config.isPrivate(), false);
    assert.strictEqual(config.isPrivate(null, ''), false);
  });
  withConfig({}, () => {
    assert.strictEqual(config.isPrivate('C:\\Users\\alex\\clients\\acme'), false, 'the default config has no private work');
  });
});

test('neverRead: a never_read folder hides its own slug and its subfolders, never a longer name', () => {
  withConfig({ privacy: { never_read: ['C:\\Users\\sam'] } }, () => {
    assert.strictEqual(config.neverRead('C--Users-sam'), true);
    assert.strictEqual(config.neverRead('C--Users-sam-Documents-notes'), true);
    assert.strictEqual(config.neverRead('c--users-sam'), true);
    assert.strictEqual(config.neverRead('C--Users-samuel-code'), false);
    assert.strictEqual(config.neverRead('C--Users-alex-code-workspace'), false);
    assert.strictEqual(config.neverRead(''), false);
  });
  withConfig({}, () => {
    assert.strictEqual(config.neverRead('C--Users-sam'), false, 'the default config never_read is empty');
  });
});

test('brand colours must be two #rrggbb values; anything else falls back to the default purples', () => {
  const colors = (c) => config.normalize({ brand: { colors: c } }).brand.colors;
  assert.deepStrictEqual(config.normalize({}).brand.colors, DEFAULT_COLORS);
  assert.deepStrictEqual(colors(['#fff', '#000']), DEFAULT_COLORS);
  assert.deepStrictEqual(colors(['red', 'blue']), DEFAULT_COLORS);
  assert.deepStrictEqual(colors(['#123456']), DEFAULT_COLORS);
  assert.deepStrictEqual(colors(['#123456', 'nope']), DEFAULT_COLORS);
  assert.deepStrictEqual(colors(['#12345G', '#000000']), DEFAULT_COLORS);
  assert.deepStrictEqual(colors('#123456'), DEFAULT_COLORS);
  assert.deepStrictEqual(colors(['#1F6F4A', '#0b3d2e', '#ffffff']), ['#1F6F4A', '#0b3d2e']);
});
