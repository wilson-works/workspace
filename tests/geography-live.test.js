'use strict';

/**
 * geography-live.test.js — the wall name comes from workspace.config.json and
 * this computer's own name, never from a compiled path or a literal machine
 * name.
 *
 * The config is written here before any src module loads: DESK runs on the
 * computer STUDIO-PC, LAPTOP on alex-mbp.local.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CFG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'geo-cfg-'));
process.env.WORKSPACE_CONFIG = path.join(CFG_DIR, 'workspace.config.json');
fs.writeFileSync(process.env.WORKSPACE_CONFIG, JSON.stringify({
  machines: [
    { name: 'DESK', computer: 'STUDIO-PC', hub: true },
    { name: 'LAPTOP', computer: 'alex-mbp.local' },
  ],
}));

const geo = require('../src/server/geography');

/** Run fn with these environment variables set (undefined = unset), then put them back. */
function withEnv(vars, fn) {
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

test('wallName maps a configured computer to its machine and leaves any other computer as its own name', () => {
  assert.strictEqual(geo.wallName('STUDIO-PC'), 'DESK');
  assert.strictEqual(geo.wallName('studio-pc'), 'DESK');
  assert.strictEqual(geo.wallName('alex-mbp.local'), 'LAPTOP');
  assert.strictEqual(geo.wallName('ALEX-MBP'), 'LAPTOP');
  assert.strictEqual(geo.wallName('mini'), 'MINI');
  assert.strictEqual(geo.wallName(''), 'UNKNOWN');
});

test('geography guesses nothing else: no compiled paths, no name mirroring', () => {
  assert.strictEqual(geo.livePaths, undefined);
  assert.strictEqual(geo.mirrorName, undefined);
});

test('thisMachine honours WORKSPACE_MACHINE', () => {
  withEnv({ WORKSPACE_MACHINE: 'laptop' }, () => assert.strictEqual(geo.thisMachine(), 'LAPTOP'));
});

test('without WORKSPACE_MACHINE, thisMachine is the machine configured for this computer, else the computer\'s own name', () => {
  withEnv({ WORKSPACE_MACHINE: undefined, COMPUTERNAME: 'studio-pc' }, () => assert.strictEqual(geo.thisMachine(), 'DESK'));
  // Not in the config: its own name, which the hub refuses as an unknown machine until it is added.
  withEnv({ WORKSPACE_MACHINE: undefined, COMPUTERNAME: 'spare-box' }, () => assert.strictEqual(geo.thisMachine(), 'SPARE-BOX'));
});

test('no server source compiles a drive-letter path into a default', () => {
  // Every file under src/server, subfolders included.
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const dir = path.join(__dirname, '..', 'src', 'server');
  for (const file of walk(dir)) {
    const f = path.relative(dir, file);
    const code = fs.readFileSync(file, 'utf8')
      .split(/\r?\n/).filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
    assert.ok(!/['"`][A-Za-z]:[\\/]/.test(code), `${f} compiles a drive-letter path`);
  }
});
