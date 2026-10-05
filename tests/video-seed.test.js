'use strict';

/**
 * video-seed.test.js — the invented working day the videos are filmed in (video/capture/seed.js).
 *
 * The seed fills computers that capture/install.js has already installed, so this first lays out
 * what the installer leaves in a temp folder: each computer's office settings, with the three
 * computers in them as "set up my WorkSpace" adds them. It then seeds, and reads the DESK floor with
 * the office's own reader and view, the way the page would see it. Checks: every session shows with
 * its title and the right state; the owner questions pass the plain-English gate; nothing the page
 * shows carries this computer's own name, user name or the sandbox folder; a computer that is not
 * installed is refused and nothing is written for it; the seed never touches the settings; session
 * ids are stable from one seed to the next; each installed agent (Louise, Bryn) has its stage set with its
 * own engine/stage.js, an agent that is not installed is skipped, and one that refuses its stage fails the seed.
 *
 * mesh.js reads its machines once, when it loads, so the reader is required only after the DESK's
 * settings are written and WORKSPACE_CONFIG points at them.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { WORLD, sandboxes } = require('../video/capture/sandbox');

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'video-seed-'));
const ALL = sandboxes(BASE);
const desk = ALL.find((s) => s.name === 'DESK');

// What the installer leaves on each computer: its office settings, in the installed workspace.
const settingsOf = (sb) => JSON.stringify({
  owner: { name: WORLD.person },
  machines: WORLD.computers.map((c) => ({ name: c.name, computer: c.name, hub: !!c.hub, callsigns: c.callsigns })),
  office: { port: sb.computer.office_port, home: sb.office },
}, null, 2);
for (const sb of ALL) {
  fs.mkdirSync(path.dirname(sb.config), { recursive: true });
  fs.writeFileSync(sb.config, settingsOf(sb));
}
process.env.WORKSPACE_CONFIG = desk.config;
process.env.WORKSPACE_MACHINE = 'DESK';

const { seed, uuidOf } = require('../video/capture/seed');

const first = seed(BASE, null);

test('the seed fills all three installed computers', () => {
  assert.strictEqual(first.ok, true, first.error);
  assert.deepStrictEqual(Object.keys(first.computers).sort(), ['DESK', 'LAPTOP', 'MINI']);
  assert.deepStrictEqual(first.computers.MINI.sessions.map((s) => s.callsign), ['Vega', 'Lyra']);
});

test('the seed never touches the office settings', () => {
  for (const sb of ALL) assert.strictEqual(fs.readFileSync(sb.config, 'utf8'), settingsOf(sb), sb.name);
});

test('the DESK floor reads every session with its title and state', () => {
  const { read } = require('../src/server/reader');
  const state = read(desk.office, { officeHome: desk.office, projects: path.join(desk.claude, 'projects') });
  const byTitle = Object.fromEntries(state.desks.map((d) => [d.title, d.state]));
  assert.strictEqual(byTitle['Plan the frost dates feature'], 'working');
  assert.strictEqual(byTitle['Gate review: frost dates'], 'working');
  assert.strictEqual(byTitle['Louise: research brief on raised-bed soil'], 'working');
  assert.strictEqual(byTitle['Bryn: should the bakery website take orders?'], 'waiting');
  assert.strictEqual(byTitle['Sort the inbox into zones'], 'stale');
  const cedar = state.desks.find((d) => d.title === 'Plan the frost dates feature');
  assert.strictEqual(cedar.seats.length, 1, 'its helper is at the desk');
  assert.strictEqual(cedar.callsign.name, 'Cedar');
});

test('the owner questions pass the plain-English gate', () => {
  const Q = require('../src/server/questions');
  assert.strictEqual(Q.openQuestions(desk.office).length, 2);
});

test('nothing the page shows names this computer, its user or the sandbox folder', () => {
  const { read } = require('../src/server/reader');
  const { buildView } = require('../src/server/view');
  const state = read(desk.office, { officeHome: desk.office, projects: path.join(desk.claude, 'projects') });
  const shown = JSON.stringify(buildView(state, { machine: 'DESK', home: desk.office }).sessions).toLowerCase();
  const real = [os.hostname(), BASE, BASE.replace(/\\/g, '/'), 'ws-fresh'];
  try { real.push(os.userInfo().username); } catch (_) { /* no user info */ }
  for (const t of real.filter((x) => x && x.length >= 3)) {
    if (['desk', 'mini', 'laptop', 'alex'].includes(t.toLowerCase())) continue;
    assert.ok(!shown.includes(t.toLowerCase()), `the page would show "${t}"`);
  }
});

test('a computer that is not installed is refused, and nothing is written for it', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'video-seed-bare-'));
  const r = seed(base, 'DESK');
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /not installed/);
  const bare = sandboxes(base).find((s) => s.name === 'DESK');
  assert.strictEqual(fs.existsSync(bare.office), false);
  assert.strictEqual(fs.existsSync(bare.claude), false);
});

test('session ids are stable from one seed to the next', () => {
  assert.strictEqual(uuidOf('DESK:Cedar'), uuidOf('DESK:Cedar'));
  assert.match(uuidOf('DESK:Cedar'), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  const again = seed(BASE, null);
  assert.deepStrictEqual(again.computers.DESK.sessions.map((s) => s.id), first.computers.DESK.sessions.map((s) => s.id));
});

/** A stand-in agent folder: agent.json, and an engine/stage.js that keeps its arguments, or refuses. */
function standInAgent(dir, key, refuse) {
  fs.mkdirSync(path.join(dir, 'engine'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'agent.json'), JSON.stringify({ key }));
  fs.writeFileSync(path.join(dir, 'engine', 'stage.js'), refuse
    ? "process.stdout.write('That stage is not one I know.\\n'); process.exit(2);\n"
    : "require('fs').writeFileSync(require('path').join(__dirname, 'args.json'), JSON.stringify(process.argv.slice(2)));\n");
}

test("each installed agent's stage is set with its own stage command; one not installed is skipped", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'video-seed-agents-'));
  const all = sandboxes(base);
  for (const sb of all) {
    fs.mkdirSync(path.dirname(sb.config), { recursive: true });
    fs.writeFileSync(sb.config, settingsOf(sb));
  }
  const d = all.find((s) => s.name === 'DESK');
  const [first, second] = WORLD.agents;
  standInAgent(path.join(d.agents, first.key), first.key, false);
  const r = seed(base, 'DESK');
  assert.strictEqual(r.ok, true, r.error);
  const got = JSON.parse(fs.readFileSync(path.join(d.agents, first.key, 'engine', 'args.json'), 'utf8'));
  assert.deepStrictEqual(got, ['set'].concat(first.stage));
  assert.strictEqual(fs.existsSync(path.join(d.agents, second.key)), false, 'an agent that is not installed is left alone');
});

test('an installed agent that refuses its stage fails the seed, in plain words', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'video-seed-refuse-'));
  const all = sandboxes(base);
  for (const sb of all) {
    fs.mkdirSync(path.dirname(sb.config), { recursive: true });
    fs.writeFileSync(sb.config, settingsOf(sb));
  }
  const d = all.find((s) => s.name === 'DESK');
  const a = WORLD.agents[0];
  standInAgent(path.join(d.agents, a.key), a.key, true);
  const r = seed(base, 'DESK');
  assert.strictEqual(r.ok, false);
  assert.ok(r.error.includes(`${a.key}'s stage (${a.stage[0]}) was refused: That stage is not one I know.`), r.error);
});

test('the agents filmed are ours, from the catalog, each on a sandbox port from 7660 to 7669, Louise first', () => {
  const catalog = require('../agents/catalog.json');
  assert.deepStrictEqual(WORLD.agents.map((x) => x.key), ['louise', 'bryn']);
  for (const x of WORLD.agents) {
    assert.ok(catalog.agents.some((c) => c.key === x.key), `${x.key} is in agents/catalog.json`);
    assert.ok(x.port >= 7660 && x.port <= 7669, `${x.key} port ${x.port}`);
  }
  assert.strictEqual(new Set(WORLD.agents.map((x) => x.port)).size, WORLD.agents.length);
  assert.ok(!catalog.agents.some((c) => c.key === WORLD.new_agent.key), 'the build-your-own example is never one of ours');
});
