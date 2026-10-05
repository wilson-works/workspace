'use strict';

/**
 * fleet-machines.test.js — config.machines() merges the fleet's registry (src/server/config.js).
 *
 * Covers: computers registered in the fleet repo and not listed in workspace.config.json are
 * appended, each with a callsign pool of its own; one the settings list (by name, or by computer
 * under another name) is not appended again; a computer that left is left out; the fleet's
 * office_hub becomes the hub unless the settings list that computer themselves; with no fleet the
 * list is the settings' alone.
 * Hermetic: each test writes its own settings file (WORKSPACE_CONFIG) pointing fleet.repo at a
 * hand-made fleet folder, and HUB_ROOT at a temp Hub, so this computer's own Hub never leaks in.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-machines-'));
process.env.WORKSPACE_CONFIG = path.join(DIR, 'none.json');
const HUB = path.join(DIR, 'Hub');
fs.mkdirSync(path.join(HUB, '.hub'), { recursive: true });
fs.writeFileSync(path.join(HUB, '.hub', 'hub.json'), JSON.stringify({ format: 1, machine: 'DESK', role: 'command' }));

const config = require('../src/server/config');

function makeFleet() {
  const dir = fs.mkdtempSync(path.join(DIR, 'fleet-'));
  fs.writeFileSync(path.join(dir, 'fleet.json'), JSON.stringify({ format: 1, created: '2026-10-05' }));
  fs.mkdirSync(path.join(dir, 'machines'));
  const put = (m) => fs.writeFileSync(path.join(dir, 'machines', `${m.name}.json`), JSON.stringify(m));
  put({ name: 'DESK', role: 'command', computer: 'DESK-PC', office_hub: true, status: 'active' });
  put({ name: 'MINI', role: 'builder', computer: 'MINI-PC', office_hub: false, status: 'active' });
  put({ name: 'LAPTOP', role: 'mobile', computer: 'LAPTOP-PC', office_hub: false, status: 'left' });
  return dir;
}

let n = 0;
function withConfig(obj, fn, env) {
  n += 1;
  const f = path.join(DIR, `workspace.config.${n}.json`);
  fs.writeFileSync(f, JSON.stringify(obj));
  const vars = Object.assign({ WORKSPACE_CONFIG: f, HUB_ROOT: HUB }, env || {});
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

test('fleet computers the settings do not list are appended, each with a pool of its own; one that left is not', () => {
  const fleet = makeFleet();
  const ms = withConfig({ machines: [{ name: 'DESK', computer: 'DESK-PC', hub: true }], fleet: { repo: fleet } }, () => config.machines());
  assert.deepStrictEqual(ms, [
    { name: 'DESK', computer: 'DESK-PC', hub: true, callsigns: 'trees' },
    { name: 'MINI', computer: 'MINI-PC', hub: false, callsigns: 'stars' },
  ]);
  assert.deepStrictEqual(withConfig({ machines: [{ name: 'DESK', computer: 'DESK-PC', hub: true }], fleet: { repo: fleet } }, () => config.machineNames()), ['DESK', 'MINI']);
});

test('the fleet\'s office hub becomes the hub when the settings list only this computer', () => {
  const fleet = makeFleet();
  const ms = withConfig({ machines: [{ name: 'MINI', computer: 'MINI-PC', hub: true }], fleet: { repo: fleet } }, () => config.machines());
  assert.deepStrictEqual(ms.map((m) => [m.name, m.hub]), [['MINI', false], ['DESK', true]]);
  assert.strictEqual(withConfig({ machines: [{ name: 'MINI', computer: 'MINI-PC', hub: true }], fleet: { repo: fleet } }, () => config.hubMachine()), 'DESK');
});

test('when the settings list the office-hub computer themselves, the settings decide', () => {
  const fleet = makeFleet();
  const ms = withConfig({
    machines: [{ name: 'MINI', computer: 'MINI-PC', hub: true }, { name: 'DESK', computer: 'DESK-PC', hub: false }], fleet: { repo: fleet },
  }, () => config.machines());
  assert.deepStrictEqual(ms.map((m) => [m.name, m.hub]), [['MINI', true], ['DESK', false]]);
});

test('a computer the settings list under another name is not appended twice', () => {
  const fleet = makeFleet();
  const ms = withConfig({ machines: [{ name: 'STUDIO', computer: 'DESK-PC', hub: true }], fleet: { repo: fleet } }, () => config.machines());
  assert.deepStrictEqual(ms.map((m) => m.name), ['STUDIO', 'MINI']);
  assert.strictEqual(ms.find((m) => m.name === 'STUDIO').hub, true);
});

test('with no machines in the settings, this computer stays and the rest of the fleet joins it', () => {
  const fleet = makeFleet();
  const ms = withConfig({ fleet: { repo: fleet } }, () => config.machines(), { COMPUTERNAME: 'MINI-PC' });
  assert.deepStrictEqual(ms.map((m) => [m.name, m.computer, m.hub]), [['MINI-PC', 'MINI-PC', false], ['DESK', 'DESK-PC', true]]);
  assert.strictEqual(withConfig({ fleet: { repo: fleet } }, () => config.thisMachine(), { COMPUTERNAME: 'MINI-PC', WORKSPACE_MACHINE: undefined }), 'MINI-PC');
});

test('no fleet: the settings alone, exactly as before', () => {
  const ms = withConfig({ machines: [{ name: 'DESK', computer: 'DESK-PC', hub: true }] }, () => config.machines());
  assert.deepStrictEqual(ms, [{ name: 'DESK', computer: 'DESK-PC', hub: true, callsigns: 'trees' }]);
  const notFleet = fs.mkdtempSync(path.join(DIR, 'plain-'));
  const ms2 = withConfig({ machines: [{ name: 'DESK', computer: 'DESK-PC', hub: true }], fleet: { repo: notFleet } }, () => config.machines());
  assert.deepStrictEqual(ms2.map((m) => m.name), ['DESK']);
});
