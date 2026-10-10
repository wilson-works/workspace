'use strict';

/**
 * agent-management.test.js — managing sessions and agents from the office.
 *
 * Running now reads the floor. Wake, Sleep, Restart and Sleep all on the agents' doors (wake.js), where
 * Sleep stops only the dashboard in dashboard/.pid while it is still that program, and also the runs
 * the agent started from its own folder (found by full path, never by name). Clear idle seats and
 * Remove from floor (seats.js) hide a quiet seat until it does something new. A session waiting on its
 * helpers is waiting, not idle. One long line filling a transcript's tail no longer hides its model. A
 * git worktree sits in the room of the repo it came from. The office reads its owner's sessions, and
 * the new buttons answer only a JSON POST with the page token from the office's own page.
 *
 * No real process is started or stopped here: every process call is injected.
 */

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const path = require('path');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-mgmt-'));
after(() => fs.rmSync(base, { recursive: true, force: true }));
const privateDir = path.join(base, 'clients');
process.env.WORKSPACE_CONFIG = path.join(base, 'workspace.config.json');
fs.writeFileSync(process.env.WORKSPACE_CONFIG, JSON.stringify({ privacy: { private_work: [privateDir] } }));

const W = require('../src/server/wake');
const A = require('../src/server/agents');
const Seats = require('../src/server/seats');
const V = require('../src/server/view');
const S = require('../src/server/sources');
const Work = require('../src/server/work');
const H = require('../src/server/home');
const lib = require('../agents/lib/agents');

// Three agents installed here: Park and Lone (live, the template's dashboard) and Soon (planned).
const agentsDir = path.join(base, 'agents');
function make(key, name, port, patch) {
  const dir = path.join(agentsDir, key);
  lib.scaffold(dir, { key, name, title: 'The Test Desk', port });
  if (patch) {
    const f = path.join(dir, 'agent.json');
    fs.writeFileSync(f, JSON.stringify(Object.assign(JSON.parse(fs.readFileSync(f, 'utf8')), patch)));
  }
  return dir;
}
const parkDir = make('park', 'Park', 4471);
const loneDir = make('lone', 'Lone', 4472);
make('soon', 'Soon', 4473, { status: 'planned' });
const noConfig = path.join(base, 'agents-config.json');
fs.writeFileSync(noConfig, JSON.stringify({ agents: [] }));

const agentsHere = () => A.createAgents({ file: noConfig, dirs: [agentsDir], self: 'DESK', probe: async () => false });
const pid = (dir, n) => {
  const f = path.join(dir, 'dashboard', '.pid');
  if (n == null) fs.rmSync(f, { force: true });
  else fs.writeFileSync(f, `${n}\n`);
};
function waker(over) {
  return W.createWaker(Object.assign({
    agents: agentsHere(), self: 'DESK', waitMs: 50, sleepWaitMs: 50, pollMs: 5,
    probe: async () => false, alive: () => false, commandLine: async () => null, kill: async () => {},
    listNode: async () => [], start: async () => { throw new Error('must not start'); },
  }, over));
}

function spare() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

test('runsOf: node processes naming a file inside the agent folder by full path, and nothing else', () => {
  const procs = [
    { pid: 11, cmd: `"C:\\Program Files\\nodejs\\node.exe" ${path.join(parkDir, 'engine', 'run.js')} job.json` },
    { pid: 12, cmd: `node ${parkDir}-other${path.sep}run.js` }, // a sibling folder whose name only starts the same
    { pid: 13, cmd: 'node dashboard/server.js' }, // relative: not attributable, left alone
    { pid: 14, cmd: `node ${path.join(parkDir, 'x.js').replace(/\\/g, '/')}` }, // forward slashes still match
    { pid: 15, cmd: `node ${path.join(parkDir, 'y.js')}` }, // in `except`: never on the list
    { pid: 16, cmd: `node "${path.join(parkDir, 'with space', 'z.js')}"` }, // a quoted path with a space in it
    { pid: 17, cmd: `node --require=${path.join(parkDir, 'hook.js')} other.js` },
    { pid: 18, cmd: `node other.js --notes ${path.join(base, 'not-the-agent', 'x')}` },
  ];
  assert.deepEqual(W.runsOf(parkDir, procs, new Set([15])).map((p) => p.pid), [11, 14, 16, 17]);
});

test('isProgram: the same program, with every argument its start names', () => {
  assert.equal(W.isProgram(`"${process.execPath}" dashboard/server.js`, ['node', 'dashboard/server.js']), true);
  assert.equal(W.isProgram('/opt/node/bin/node dashboard\\server.js --port 1', ['node', 'dashboard/server.js']), true);
  assert.equal(W.isProgram(`"${process.execPath}" other.js`, ['node', 'dashboard/server.js']), false);
  assert.equal(W.isProgram('python dashboard/server.js', ['node', 'dashboard/server.js']), false);
  assert.equal(W.isProgram('C:\\Python312\\python.exe dashboard.py', ['python', 'dashboard.py']), true);
  assert.equal(W.isProgram(null, ['node', 'x.js']), false);
});

test('sleep on an agent already asleep still stops the runs it left going, and says so', async () => {
  pid(loneDir, null);
  const kills = [];
  const w = waker({
    kill: async (n) => { kills.push(n); },
    listNode: async () => [
      { pid: 901, cmd: `node ${path.join(loneDir, 'engine', 'research-run.js')}` },
      { pid: 902, cmd: 'node elsewhere.js' },
    ],
  });
  const r = await w.sleep('lone');
  assert.equal(r.status, 200);
  assert.equal(r.runs, 1);
  assert.equal(r.message, 'Lone is already asleep. The office also stopped the run Lone had going.');
  assert.deepEqual(kills, [901]);
});

test('sleep stops the pid in dashboard/.pid while it is still that program, and the pid file goes', async () => {
  pid(parkDir, 5001);
  const kills = [];
  let up = true;
  const w = waker({
    probe: async () => up,
    alive: (n) => n === 5001 && !kills.includes(5001),
    commandLine: async (n) => (n === 5001 ? `"${process.execPath}" dashboard/server.js` : null),
    kill: async (n) => { kills.push(n); if (n === 5001) up = false; },
  });
  const r = await w.sleep('park');
  assert.equal(r.status, 200);
  assert.equal(r.message, 'Park is asleep.');
  assert.deepEqual(kills, [5001]);
  assert.equal(fs.existsSync(path.join(parkDir, 'dashboard', '.pid')), false);
});

test('a copy the office cannot identify is never stopped, and the reply says why', async () => {
  pid(loneDir, 5002);
  const kills = [];
  const w = waker({
    probe: async () => true, alive: () => true, commandLine: async () => 'node some-other-program.js',
    kill: async (n) => { kills.push(n); },
  });
  const r = await w.sleep('lone');
  assert.equal(r.status, 409);
  assert.match(r.message, /didn't start this copy of Lone/);
  assert.deepEqual(kills, []);
});

test('sleep all: puts each agent here to sleep with its runs, names the one it cannot identify, skips the planned one', async () => {
  pid(parkDir, 5001);
  pid(loneDir, 5002);
  const kills = [];
  const up = new Set([4471, 4472]);
  const w = waker({
    probe: async (p) => up.has(p.port),
    alive: (n) => (n === 5001 || n === 5002) && !kills.includes(n),
    // Park's pid is its dashboard; Lone's pid file names something else, so Lone is left running.
    commandLine: async (n) => (n === 5001 ? 'node dashboard/server.js' : 'node other.js'),
    kill: async (n) => { kills.push(n); if (n === 5001) up.delete(4471); },
    listNode: async () => [{ pid: 777, cmd: `node ${path.join(parkDir, 'engine', 'run.js')}` }],
  });
  const r = await w.sleepAll();
  assert.equal(r.status, 207);
  assert.deepEqual(kills, [5001, 777], 'the dashboard and its run; never the copy it cannot identify');
  assert.match(r.message, /^Put to sleep: Park\. Stopped 1 run they had going\. The office didn't start this copy of Lone/);
  pid(loneDir, null);
});

test('restart is sleep then wake, and stops at a sleep that is refused', async () => {
  pid(loneDir, null);
  const started = [];
  let up = false;
  const w = waker({ probe: async () => up, start: async (dir) => { started.push(dir); up = true; return 6001; }, alive: (n) => n === 6001 });
  const r = await w.restart('lone');
  assert.equal(r.status, 200);
  assert.equal(r.message, 'Lone restarted.');
  assert.deepEqual(started, [loneDir], "it starts the agent's own folder");

  pid(loneDir, 5003);
  const refused = await waker({ probe: async () => true, alive: () => true, commandLine: async () => 'node other.js' }).restart('lone');
  assert.equal(refused.status, 409, 'a copy the office cannot identify is neither stopped nor started again');
  pid(loneDir, null);
});

test('wake: a dashboard that dies at once is reported; planned, unknown and far-away agents are refused in words', async () => {
  pid(parkDir, null);
  const died = await waker({ start: async () => 7001, alive: () => false }).wake('park');
  assert.equal(died.status, 500);
  assert.match(died.message, /started and stopped again/);

  const w = waker({});
  const planned = await w.wake('soon');
  assert.equal(planned.status, 409);
  assert.equal(planned.message, "Soon hasn't moved in yet.");
  assert.equal((await w.sleep('nobody')).status, 404);
  assert.equal((await w.wake('../park')).status, 404);

  const cfg = path.join(base, 'far.json');
  fs.writeFileSync(cfg, JSON.stringify({ agents: [{ key: 'far', name: 'Far', machine: 'LAPTOP', status: 'live', door: { local: null, phone: null }, probe: { port: 4480, path: '/health' } }] }));
  const far = await W.createWaker({ agents: A.createAgents({ file: cfg, dirs: [], self: 'DESK', probe: async () => false }), self: 'DESK' }).wake('far');
  assert.equal(far.status, 409);
  assert.match(far.message, /runs on LAPTOP/);

  const st = Object.fromEntries(agentsHere().all().map((a) => [a.key, w.status(a)]));
  assert.deepEqual(st.park, { can: true, why: null, starting: false, sleep: true });
  assert.equal(st.soon.can, false, "a planned agent's door stays shut");
  assert.equal(st.soon.why, "Soon hasn't moved in yet.");
});

test('a cleared seat hides only while idle, comes back on new activity, and one asking you stays', () => {
  const home = fs.mkdtempSync(path.join(base, 'seats-'));
  const quiet = { machine: 'DESK', id: 'a1', state: 'idle', last_at: 1000 };
  const busy = { machine: 'DESK', id: 'b2', state: 'working', last_at: 1000 };
  const asker = { machine: 'DESK', id: 'c3', state: 'idle', last_at: 1000 };
  const r = Seats.clear(home, [quiet, busy, asker], { keys: ['DESK:a1', 'DESK:b2', 'DESK:c3'] }, 2000);
  assert.deepEqual([r.cleared, r.busy], [2, 1]);
  assert.deepEqual(Seats.visible(home, [quiet, busy, asker], new Set(['DESK:c3'])).map((s) => s.id), ['b2', 'c3']);
  assert.deepEqual(Seats.visible(home, [Object.assign({}, quiet, { last_at: 3000 })], new Set()).map((s) => s.id), ['a1'], 'new activity brings it back');
  assert.deepEqual(Seats.visible(home, [Object.assign({}, quiet, { state: 'working' })], new Set()).map((s) => s.id), ['a1'], 'so does work');
  assert.equal(Seats.clear(home, [quiet], {}, 4000).ok, false, 'a request that names nothing clears nothing');
  assert.equal(Seats.clear(home, [quiet], { idle: true }, 4000).cleared, 1);
  assert.equal(Seats.clear(home, [quiet], { keys: ['not a key', 'DESK:a1'] }, 5000).cleared, 1, 'a malformed key is ignored');
});

test('a session waiting on its helpers is waiting, not idle; repo and branch show, never for private work', () => {
  const now = 10 * 3600 * 1000;
  const home = fs.mkdtempSync(path.join(base, 'view-'));
  const desk = (seats, last, extra) => Object.assign({
    id: 'd', machine: 'DESK', state: 'stale', seats, last_event_at: last, recent: [], project: 'garden-planner',
    code_cwd: path.join(base, 'wt', 'garden-planner-frost'), branch: 'frost-dates', model: { status: 'OK', value: 'claude-opus-5' },
  }, extra);
  const view = (d) => V.buildView({ asOf: now, desks: [d] }, { machine: 'DESK', home }).sessions[0];

  const s = view(desk([{ agent_id: 'h1', state: 'running', reconstructed: false }], now - 5 * 60000));
  assert.equal(s.state, 'waiting');
  assert.equal(s.waiting.kind, 'helpers');
  assert.equal(s.repo, 'garden planner');
  assert.equal(s.branch, 'frost-dates');
  assert.equal(view(desk([{ agent_id: 'h1', state: 'running', reconstructed: true, age_ms: 3600000 }], now - 5 * 60000)).state, 'idle', 'a helper read only from an old transcript does not count');
  assert.equal(view(desk([{ agent_id: 'h1', state: 'running', reconstructed: false }], now - 2 * 3600000)).state, 'idle', 'past 65 minutes an open helper no longer counts');
  const priv = view(desk([], now, { client_work: true }));
  assert.equal(priv.branch, null);
  assert.equal(priv.repo, null);
  assert.equal(view(desk([], now, { branch: 'main' })).branch, null, 'main says nothing');
  assert.equal(view(desk([], now, { code_cwd: null })).repo, null, 'no code tree, no repo');
});

test('Running now: every session at work, waiting, with helpers out or active in the last 15 minutes, by repo', () => {
  const now = 1e12;
  const s = (id, o) => Object.assign({ id, machine: 'DESK', name: `Session ${id}`, room: 'workspace', state: 'idle', last_at: now - 3600000, helpers: [] }, o);
  const groups = Work.liveWork([
    s('a', { state: 'working', repo: 'garden planner', branch: 'frost-dates', last_at: now - 1000 }),
    s('b', { state: 'waiting', repo: 'garden planner', waiting: { kind: 'helpers' }, helpers: [{ task: 'Check the calendar', type: 'Explore' }] }),
    s('c', { last_at: now - 5 * 60000, room: 'bakery site' }),
    s('d'), // quiet for an hour: not running now
    s('e', { state: 'working', client_work: true, name: 'Private work', branch: 'acme-q3', helpers: [{ task: 'Acme receipts', type: 'Explore' }] }),
  ], now);
  assert.deepEqual(groups.map((g) => g.project), ['garden planner', 'Private work', 'bakery site']);
  assert.deepEqual(groups[0].sessions.map((x) => x.key), ['DESK:a', 'DESK:b'], 'working first');
  assert.equal(groups[0].sessions[1].helpers[0].task, 'Check the calendar');
  const p = groups[1].sessions[0];
  assert.deepEqual([p.title, p.branch, p.repo, p.helpers[0].task], [null, null, null, null], 'private work stays private');
});

test('"Model unknown": one long line filling the tail no longer hides the model or the title', () => {
  const dir = fs.mkdtempSync(path.join(base, 'tmeta-'));
  const p = path.join(dir, 't.jsonl');
  const lines = [
    { type: 'ai-title', aiTitle: 'Read the logo back' },
    { type: 'assistant', timestamp: '2026-10-09T06:00:00.000Z', cwd: dir, message: { model: 'claude-opus-5', content: [{ type: 'tool_use', name: 'Read', input: {} }] } },
    { type: 'user', timestamp: '2026-10-09T06:00:05.000Z', cwd: dir, message: { content: [{ type: 'tool_result', content: 'x'.repeat(300 * 1024) }] } },
  ];
  fs.writeFileSync(p, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const m = S.transcriptMeta(p);
  assert.equal(m.ok, true);
  assert.equal(m.model, 'claude-opus-5');
  assert.equal(m.title, 'Read the logo back');
});

test('a git worktree sits in the room of the repo it came from; a private main repo is never named', () => {
  const main = path.join(base, 'code', 'garden-planner');
  fs.mkdirSync(path.join(main, '.git', 'worktrees', 'frost'), { recursive: true });
  const wt = path.join(base, 'wt', 'garden-planner-frost');
  fs.mkdirSync(path.join(wt, 'src', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${main.replace(/\\/g, '/')}/.git/worktrees/frost\n`);
  assert.equal(S.repoOf(path.join(wt, 'src', 'lib')), 'garden-planner');
  assert.equal(S.projectOf(path.join(wt, 'src')), 'garden-planner');

  const bare = path.join(base, 'wt', 'bakery-menu');
  fs.mkdirSync(bare, { recursive: true });
  fs.writeFileSync(path.join(bare, '.git'), `gitdir: ${path.join(base, 'repos', 'bakery-site.git', 'worktrees', 'menu')}\n`);
  assert.equal(S.repoOf(bare), 'bakery-site', "a bare repo's worktree");

  assert.equal(S.repoOf(main), null, 'a normal checkout keeps its own name');
  assert.equal(S.projectOf(path.join(base, 'notes')), 'notes', 'a folder in no checkout keeps its own name');
  assert.equal(S.repoOf('src/lib'), null, 'a relative path is never looked up');

  const books = path.join(base, 'wt', 'books-q3');
  fs.mkdirSync(books, { recursive: true });
  fs.writeFileSync(path.join(books, '.git'), `gitdir: ${path.join(privateDir, 'acme-books', '.git', 'worktrees', 'q3')}\n`);
  assert.equal(S.repoOf(books), null);
  assert.equal(S.projectOf(books), 'books-q3', "a private repo's name never names the room");

  const sub = path.join(base, 'wt', 'sub');
  fs.mkdirSync(sub, { recursive: true });
  fs.writeFileSync(path.join(sub, '.git'), 'gitdir: ../.git/modules/sub\n');
  assert.equal(S.repoOf(sub), null, "a submodule's .git file is not a worktree");
});

test("the office reads its owner's sessions: the account its home belongs to", () => {
  assert.equal(H.ownerProfile('C:\\Users\\alex\\AppData\\Local\\WorkSpace'), 'C:\\Users\\alex');
  assert.equal(H.ownerProfile('C:/Users/sam/AppData/Local/WorkSpace'), 'C:/Users/sam');
  assert.equal(H.ownerProfile('/Users/alex/Library/Application Support/WorkSpace'), '/Users/alex');
  assert.equal(H.ownerProfile('/home/alex/.local/share/WorkSpace'), '/home/alex');
  assert.equal(H.ownerProfile(path.join(path.parse(base).root, 'WorkSpaceHome')), os.homedir(), 'a home outside any account: this account');
  const saved = process.env.CLAUDE_CONFIG_DIR;
  try {
    process.env.CLAUDE_CONFIG_DIR = path.join(base, 'claude');
    assert.equal(H.ownerClaudeHome('C:\\Users\\alex\\AppData\\Local\\WorkSpace'), path.join(base, 'claude'), 'CLAUDE_CONFIG_DIR still wins');
    delete process.env.CLAUDE_CONFIG_DIR;
    assert.equal(H.ownerClaudeHome('C:\\Users\\alex\\AppData\\Local\\WorkSpace'), path.join('C:\\Users\\alex', '.claude'));
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = saved;
  }
});

test('the new buttons answer only a JSON POST with the page token from the office page; the body never chooses what runs', async () => {
  const { start } = require('../src/server/server');
  const home = fs.mkdtempSync(path.join(base, 'server-'));
  const port = await spare();
  const calls = [];
  const said = (status, message, state) => ({ ok: status < 400, status, message, state });
  const stub = {
    wake: async (k) => { calls.push(`wake ${k}`); return said(200, 'awake', 'running'); },
    sleep: async (k) => { calls.push(`sleep ${k}`); return said(200, 'asleep', 'off'); },
    restart: async (k) => { calls.push(`restart ${k}`); return said(200, 'restarted', 'running'); },
    sleepAll: async () => { calls.push('sleep-all'); return said(200, 'all asleep'); },
    status: () => ({ can: true, why: null, starting: false, sleep: true }),
  };
  const h = start({ root: home, home, port, push: false, machine: 'DESK', agents: agentsHere(), waker: stub });
  const req = (method, p, headers, body) => new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: Object.assign({ Host: `127.0.0.1:${port}` }, headers) }, (res) => {
      let b = '';
      res.on('data', (d) => { b += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.on('error', reject);
    r.end(body || '');
  });
  try {
    await new Promise((r) => (h.server.listening ? r() : h.server.once('listening', r)));
    const ok = { 'X-Office-Token': h.token, 'Content-Type': 'application/json' };
    assert.equal((await req('GET', '/api/agents/park/wake', {})).status, 405);
    assert.equal((await req('POST', '/api/agents/park/wake', { 'Content-Type': 'application/json' }, '{}')).status, 403, 'no token');
    assert.equal((await req('POST', '/api/agents/park/wake', { 'X-Office-Token': h.token, 'Content-Type': 'text/plain' }, '{}')).status, 415, 'not JSON');
    assert.equal((await req('POST', '/api/agents/park/sleep', Object.assign({ Origin: 'https://elsewhere.example' }, ok), '{}')).status, 403, 'another site');
    assert.equal((await req('POST', '/api/seats/clear', Object.assign({ 'Sec-Fetch-Site': 'cross-site' }, ok), '{}')).status, 403, 'another site');
    assert.equal((await req('POST', '/api/seats/clear', Object.assign({ Origin: 'https://elsewhere.example' }, ok), '{}')).status, 403, 'another site');
    assert.deepEqual(calls, [], 'nothing refused reached the waker');

    for (const p of ['/api/agents/park/wake', '/api/agents/park/sleep', '/api/agents/park/restart', '/api/agents/sleep-all']) {
      const r = await req('POST', p, Object.assign({ Origin: `http://127.0.0.1:${port}`, 'Sec-Fetch-Site': 'same-origin' }, ok), '{"start":"evil.exe","key":"lone"}');
      assert.equal(r.status, 200, p);
    }
    assert.deepEqual(calls, ['wake park', 'sleep park', 'restart park', 'sleep-all']);

    const api = JSON.parse((await req('GET', '/api/agents', {})).body);
    assert.deepEqual(api.agents.find((a) => a.key === 'park').wake, { can: true, why: null, starting: false, sleep: true });
    for (const a of api.agents) assert.ok(!('dir' in a) && !('start' in a), `${a.key}: its folder and start command stay on the server`);

    assert.equal((await req('POST', '/api/seats/clear', ok, '{}')).status, 400, 'a clear that names nothing');
    const audit = fs.readFileSync(path.join(home, 'controls-audit.jsonl'), 'utf8');
    assert.match(audit, /"AGENT_WAKE".*REFUSED: bad token/);
    assert.match(audit, /"SEATS_CLEAR".*REFUSED: cross-site origin/);

    const work = JSON.parse((await req('GET', '/api/work', {})).body);
    assert.ok(Array.isArray(work.live_work), 'the Work page carries Running now');
  } finally {
    h.stop();
  }
});
