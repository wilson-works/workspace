'use strict';

/**
 * org-people.test.js — three James sessions are James, James 2 and James 3. A
 * session is named for its person by config/org-people.json, numbered per person
 * in the order the sessions started, the same on a local desk and on a desk the
 * hub took from another machine, with "Department · Focus" (from `people`) or its
 * workscope as its title; a session no rule names keeps its callsign, else its
 * title; with a `people` list it goes to the person its work words name, else to
 * everyone_else; private work never shows its title or its folder.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const V = require('../src/server/view');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'people-'));
const peopleFile = path.join(home, 'org-people.json');
fs.writeFileSync(peopleFile, JSON.stringify({
  roster: { 'cto-james': 'James', 'chief-engineer-john': 'John', 'head-backend-cindy': 'Cindy' },
  gate: 'John',
  runs: [{ run: 'RUN0412-N', match: 'RUN0412-N', lanes: [
    { match: 'office gate', person: 'John', scope: 'Office gate' },
    { match: 'lane G', person: 'Cindy', scope: 'API cures' },
    { match: 'lane H', person: 'Cindy', scope: 'Database cures' },
  ] }],
}));

let n = 0;
function desk(over) {
  n += 1;
  return Object.assign({ id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`, machine: 'DESK', state: 'idle', title: null, started_at: 1000 + n }, over);
}
const view = (desks) => V.buildView({ asOf: 5000, desks }, { machine: 'DESK', home, peopleFile }).sessions;
const byId = (sessions) => new Map(sessions.map((s) => [s.id, s.display]));

test('three James sessions are James-1, -2 and -3 in the order they started, whatever order they are read in', () => {
  const a = desk({ title: 'Q4 planning', started_at: 300, callsign: { name: 'Cedar', seat: 'cto-james' } });
  const b = desk({ title: 'run review', started_at: 100, callsign: { name: 'Aspen', seat: 'cto-james' } });
  const c = desk({ title: 'roadmap', started_at: 200, callsign: { name: 'Rowan', seat: 'James' } });
  const d = byId(view([a, b, c]));
  assert.equal(d.get(b.id).label, 'James · Run review');
  assert.equal(d.get(c.id).label, 'James 2 · Roadmap');
  assert.equal(d.get(a.id).label, 'James 3 · Q4 planning');
  assert.equal(d.get(a.id).name, 'James 3');
  assert.equal(d.get(a.id).title, 'Q4 planning');
  assert.equal(d.get(a.id).rename, 'James3-Q4-planning');
});

test("a run's lane map names the person and the workscope; a person's number counts only their own sessions", () => {
  const gate = desk({ title: 'RUN0412-N office gate night run', started_at: 10, callsign: { name: 'Aspen' } });
  const g = desk({ title: 'RUN0412-N lane G API run-31h cures', started_at: 20, callsign: { name: 'Birch' } });
  const h = desk({ title: 'RUN0412-N lane H database cures', started_at: 30, callsign: { name: 'Maple' } });
  const d = byId(view([h, g, gate]));
  assert.equal(d.get(gate.id).label, 'John · Office gate');
  assert.equal(d.get(g.id).label, 'Cindy · API cures');
  assert.equal(d.get(h.id).label, 'Cindy 2 · Database cures');
});

test('a gate with no lane map is John, its workscope from its title without the run code', () => {
  const s = desk({ title: 'XY0101 product gate', callsign: { name: 'Holly', seat: 'gate' } });
  assert.equal(byId(view([s])).get(s.id).label, 'John · Product gate');
  assert.equal(V.scopeOf('RUN0412-N lane I office upgrades'), 'Office upgrades');
});

test('a session no rule names keeps its callsign, else its title', () => {
  const named = desk({ title: 'Ping pong', callsign: { name: 'Cedar' } });
  const bare = desk({ title: 'Ping pong two' });
  const [a, b] = view([named, bare]);
  assert.equal(a.display.name, 'Cedar');
  assert.equal(a.display.label, a.callsign.label);
  assert.equal(a.display.person, null);
  assert.equal(b.display.label, 'Ping pong two');
  assert.equal(b.display.rename, null);
});

test('private work is named by person and "Private work", never by anything its tree says', () => {
  const cw = desk({ client_work: true, title: null, project: 'C03-books', code_cwd: 'C:/Users/alex/clients/C03-books', callsign: { name: 'Elm', seat: 'gate' } });
  const s = view([cw])[0];
  assert.equal(s.display.label, 'John · Private work');
  assert.equal(s.room, 'Private work');
  assert.ok(!JSON.stringify(s.display).includes('C03'));
  assert.ok(!s.room.includes('C03'));
});

test('a desk the hub took from another machine is named and numbered with the local ones (the mesh shows the same name)', () => {
  const local = desk({ title: 'RUN0412-N lane G API cures', started_at: 50, callsign: { name: 'Birch' } });
  const remote = desk({ machine: 'MINI', remote: true, title: 'RUN0412-N lane H database cures', started_at: 40, callsign: { name: 'Vega', machine: 'MINI' } });
  const d = byId(view([local, remote]));
  assert.equal(d.get(remote.id).label, 'Cindy · Database cures');
  assert.equal(d.get(local.id).label, 'Cindy 2 · API cures');
});

test('config/org-people.json: the roster is the shipped CTO org, the gate is on it, and every lane names someone on it', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'org-people.json'), 'utf8'));
  const agents = fs.readdirSync(path.join(__dirname, '..', 'org', 'agents')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
  assert.deepEqual(Object.keys(cfg.roster).sort(), agents.sort(), 'one roster entry per agent in org/agents');
  const names = new Set(Object.values(cfg.roster));
  assert.ok(names.has(cfg.gate), `the gate person ${cfg.gate} is on the roster`);
  for (const run of cfg.runs) {
    for (const lane of run.lanes) assert.ok(names.has(lane.person), `${run.run} ${lane.match}: ${lane.person} is on the roster`);
  }
});

test('with a people list: a hand-opened session goes to the person its work words name, else to everyone_else, titled Department · Focus, numbered by launch order', () => {
  const file = path.join(home, 'org-people-people.json');
  fs.writeFileSync(file, JSON.stringify({
    roster: { 'cto-james': 'James' },
    people: { Sam: { department: 'Front desk', focus: 'Your own sessions' }, Gavin: { department: 'Engineering', focus: 'Screens and pages' } },
    everyone_else: 'Sam',
    work_words: [{ person: 'Gavin', words: ['page', 'button'] }],
  }));
  const at = (desks) => V.buildView({ asOf: 5000, desks }, { machine: 'DESK', home, peopleFile: file });
  const g1 = desk({ title: 'Fix the pricing page buttons', started_at: 10, callsign: { name: 'Cedar' } });
  const g2 = desk({ title: 'New landing page', started_at: 20, callsign: { name: 'Aspen' } });
  const any = desk({ title: 'Ping pong', started_at: 30, callsign: { name: 'Rowan' } });
  const priv = desk({ client_work: true, title: 'Acme page fix', started_at: 40, callsign: { name: 'Elm' } });
  const v = at([g2, any, g1, priv]);
  const d = byId(v.sessions);
  assert.equal(d.get(g1.id).name, 'Gavin');
  assert.equal(d.get(g1.id).title, 'Engineering · Screens and pages');
  assert.equal(d.get(g2.id).name, 'Gavin 2');
  assert.equal(d.get(any.id).name, 'Sam');
  assert.equal(d.get(any.id).title, 'Front desk · Your own sessions');
  assert.equal(d.get(priv.id).name, 'Sam 2', 'private work is never read for words');
  assert.ok(!JSON.stringify(d.get(priv.id)).includes('Acme'));
  assert.deepEqual(v.people.map((p) => p.name), ['Sam', 'Gavin']);
});

test('config/org-people.json ships a small sample org: at most eight people, everyone_else and every work_words person on it', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'org-people.json'), 'utf8'));
  const names = Object.keys(cfg.people);
  assert.ok(names.length > 0 && names.length <= 8, `${names.length} people`);
  assert.ok(cfg.people[cfg.everyone_else], 'everyone_else is on the list');
  for (const w of cfg.work_words) assert.ok(cfg.people[w.person], `${w.person} is on the list`);
  for (const n of names) assert.ok(cfg.people[n].department && cfg.people[n].focus, `${n} has a department and a focus`);
});
