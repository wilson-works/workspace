'use strict';

/**
 * dispatch.test.js — sessions the office starts itself (src/server/dispatch.js, bin/office-turn.js, bin/office-spawn.js)
 * and, with several computers, from the hub's office on another one (src/server/mesh-dispatch.js).
 *
 * What is pinned: every choice is checked against config/dispatch.json; the helper caps (a helper never runs above its
 * lead's effort, a Fable helper runs on low only, an effort the helper did not name is taken down to fit); a project
 * under privacy.private_work is private work; the tick starts a turn only for a session with a note waiting; Stop,
 * Close, Reopen and the reply buzz; the conversation read back carries prompts and final replies only, and nothing for
 * private work; a helper sits in its lead's room; a finished turn never reads Working; a helper's report is labelled
 * as one; the hub re-checks everything a spoke sends, keeps no brief of private work, and buzzes only for a reply that
 * answers the owner's own words; a start queued for a spoke is done there once.
 *
 * Claude Code itself is never started: any file stands in for it, and turns are launched by a stub.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p || 'dispatch-'));
const CFG_DIR = tmp('dispatch-cfg-');
process.env.WORKSPACE_CONFIG = path.join(CFG_DIR, 'workspace.config.json');
fs.writeFileSync(process.env.WORKSPACE_CONFIG, JSON.stringify({
  machines: [{ name: 'DESK', hub: true }, { name: 'MINI' }],
  privacy: { private_work: ['clients'], never_read: [] },
}));
process.env.WORKSPACE_MACHINE = 'DESK';
process.env.WORKSPACE_CLAUDE_EXE = process.execPath;

const D = require('../src/server/dispatch');
const MD = require('../src/server/mesh-dispatch');
const inbox = require('../src/server/inbox');

const LEAD = '11111111-2222-4333-8444-555555555555';

/** A Hub with a code root (one plain repo, one private repo, one run's lane clone) and an agents folder. */
function world() {
  const home = tmp();
  const hub = tmp('hub-');
  const code = path.join(hub, 'code');
  fs.writeFileSync(path.join(hub, 'CLAUDE.md'), '# hub\n');
  for (const n of ['demo-app', 'clients-acme', 'demo-app-run-3-lane-a']) fs.mkdirSync(path.join(code, n), { recursive: true });
  const agents = tmp('agents-');
  fs.writeFileSync(path.join(agents, 'head-frontend.md'), '---\nname: head-frontend\ndescription: Gavin - Frontend Lead. Owns the web app.\n---\nprompt\n');
  return { home, hub, ctx: { machine: 'DESK', hubRoot: hub, codeRoots: [code], agentsDir: agents } };
}

test('a new session: choices from config/dispatch.json only, defaults Opus on medium', () => {
  const w = world();
  const r = D.createJob(w.home, { brief: 'Fix the floor packing on phones', model: 'sonnet', hands: 'careful', cap_min: 30, place: 'demo-app' }, w.ctx);
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.job.model_id, 'claude-sonnet-5-5');
  assert.strictEqual(r.job.mode, 'auto');
  assert.strictEqual(r.job.name, 'Fix floor packing');
  assert.strictEqual(r.job.work_root, w.hub);
  const sys = fs.readFileSync(D.file(w.home, r.job.id, '.system.md'), 'utf8');
  assert.match(sys, /office-spawn\.js/);
  assert.match(sys, /ask-owner\.js/);
  const o = D.createJob(w.home, { brief: 'x y z' }, w.ctx).job;
  assert.deepStrictEqual([o.model, o.effort, o.hands, o.cap_min], ['opus', 'medium', 'careful', 60]);
  for (const [req, re] of [[{ brief: '' }, /what it should do/i], [{ brief: 'x', model: 'gpt' }, /no model/i],
    [{ brief: 'x', effort: 'huge' }, /Effort is one of/], [{ brief: 'x', cap_min: 999 }, /time cap/i],
    [{ brief: 'x', place: '..\\..\\Windows' }, /no project/i], [{ brief: 'x', place: 'demo-app-run-3-lane-a' }, /no project/i]]) {
    const b = D.createJob(w.home, req, w.ctx);
    assert.ok(!b.ok);
    assert.match(b.error, re);
  }
});

test('helper caps: never above the lead, Fable on low only, an unnamed effort taken down to fit', () => {
  const w = world();
  const lead = D.createJob(w.home, { brief: 'lead', effort: 'medium' }, w.ctx).job;
  const helper = (r) => D.createJob(w.home, Object.assign({ brief: 'help', origin: 'session', parent: { session_id: lead.session_id, name: 'Lead' } }, r), w.ctx);
  assert.match(helper({ model: 'fable', effort: 'high' }).error, /Fable helpers run on low only/);
  assert.match(helper({ model: 'fable', effort: 'medium' }).error, /Fable helpers run on low only/);
  assert.strictEqual(helper({ model: 'fable' }).job.effort, 'low');
  assert.match(helper({ effort: 'high' }).error, /can't be above its lead's/);
  assert.strictEqual(helper({ effort: 'low' }).job.effort, 'low');
  const low = D.createJob(w.home, { brief: 'low lead', effort: 'low' }, w.ctx).job;
  const under = D.createJob(w.home, { brief: 'help', origin: 'session', parent: { session_id: low.session_id } }, w.ctx).job;
  assert.strictEqual(under.effort, 'low', 'the helper default (medium) is taken down to a low lead');
  // A session the owner starts is the owner's choice.
  assert.ok(D.createJob(w.home, { brief: 'mine', model: 'fable', effort: 'max' }, w.ctx).ok);
  // A chat opened by hand has no job: only the Fable rule applies.
  const chat = D.createJob(w.home, { brief: 'help', origin: 'session', effort: 'high', parent: { session_id: LEAD } }, w.ctx);
  assert.ok(chat.ok);
  assert.strictEqual(chat.job.notify, false, 'a helper never buzzes the phone');
});

test('a project under privacy.private_work is private: no brief on the page, no conversation', () => {
  const w = world();
  const r = D.createJob(w.home, { brief: 'the acme books', place: 'clients-acme' }, w.ctx);
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.job.client_work, true);
  assert.strictEqual(r.job.name, 'Private work');
  const v = D.jobView(w.home, r.job);
  assert.strictEqual(v.brief, null);
  assert.strictEqual(v.place_label, null);
  assert.deepStrictEqual(D.talk(w.home, r.job.id, tmp()), { ok: true, client_work: true, items: [] });
});

test('the tick starts a turn only for a session with a note waiting; Stop, Close, Reopen, the buzz', async () => {
  const w = world();
  const started = [];
  const ctx = Object.assign({}, w.ctx, { launch: async (exe, args) => { started.push(args[1]); return 1; } });
  const j = D.createJob(w.home, { brief: 'work' }, ctx).job;
  D.updateJob(w.home, j.id, { status: 'idle' });
  assert.deepStrictEqual(D.tick(w.home, ctx), []);
  inbox.enqueue(w.home, j.session_id, 'carry on', 'owner');
  assert.deepStrictEqual(D.tick(w.home, ctx), [j.id]);
  await new Promise((r) => setImmediate(r));
  assert.deepStrictEqual(started, [j.id]);
  assert.match((await D.act(w.home, j.id, 'close')).message, /closed/);
  assert.deepStrictEqual(D.tick(w.home, ctx), [], 'a closed session waits');
  assert.strictEqual(D.readJob(w.home, j.id).status, 'closed');
  await D.act(w.home, j.id, 'reopen');
  assert.strictEqual((await D.act(w.home, j.id, 'notify')).ok, true);
  assert.strictEqual(D.readJob(w.home, j.id).notify, true);
});

test('its conversation: prompts and final replies only, a helper report labelled', () => {
  const w = world();
  const j = D.createJob(w.home, { brief: 'say hi' }, w.ctx).job;
  const projects = tmp('projects-');
  fs.mkdirSync(path.join(projects, 'slug'));
  const line = (o) => JSON.stringify(Object.assign({ timestamp: '2026-10-12T10:00:00Z' }, o));
  fs.writeFileSync(path.join(projects, 'slug', `${j.session_id}.jsonl`), [
    line({ type: 'user', message: { content: 'say hi' } }),
    line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'secret' } }] } }),
    line({ type: 'user', message: { content: [{ type: 'tool_result', content: 'tool output' }] } }),
    line({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } }),
    line({ type: 'user', message: { content: D.noteText({ from: 'helper', from_name: 'Scout', text: 'found it', queued_at: Date.now() }) } }),
  ].join('\n'));
  const t = D.talk(w.home, j.id, projects);
  assert.deepStrictEqual(t.items.map((i) => [i.kind, i.who || null, i.text]), [
    ['prompt', 'brief', 'say hi'], ['reply', null, 'hi'], ['prompt', 'report:Scout', 'found it'],
  ]);
  assert.ok(!JSON.stringify(t).includes('secret') && !JSON.stringify(t).includes('tool output'));
});

test('the floor: a helper sits in its lead room, a finished turn reads idle', () => {
  const lead = { id: LEAD, machine: 'DESK', room: 'demo app', state: 'working' };
  const helper = { id: '99999999-2222-4333-8444-555555555555', machine: 'DESK', room: 'Hub', state: 'working' };
  const jobs = [
    { id: 'dhelper01', machine: 'DESK', session_id: helper.id, name: 'Scout', status: 'idle', model_id: 'claude-opus-5-5', parent: { machine: 'DESK', session_id: LEAD, name: 'Lead' } },
  ];
  const out = D.decorate([lead, helper], jobs);
  const h = out.find((s) => s.id === helper.id);
  assert.strictEqual(h.room, 'demo app');
  assert.strictEqual(h.lead_key, `DESK:${LEAD}`);
  assert.strictEqual(h.state, 'idle', 'its job says the turn ended');
  assert.strictEqual(h.display.name, 'Scout');
});

test('a helper report reaches its lead labelled, kept off the owner copy for private work', () => {
  const home = tmp();
  const r = inbox.enqueue(home, LEAD, 'x'.repeat(3000), 'helper', { max: 6000, from_name: 'Scout', ownerCopy: false });
  assert.ok(r.ok);
  assert.deepStrictEqual(inbox.thread(home, LEAD), []);
  inbox.enqueue(home, LEAD, 'done', 'helper', { from_name: 'Scout' });
  assert.strictEqual(inbox.thread(home, LEAD)[0].from_name, 'Scout');
});

test('the hub re-checks a spoke feed: unknown fields dropped, private work carries no brief', () => {
  const opts = MD.cleanOptions({ places: [{ key: 'clients-acme', label: 'clients acme', client: true }, { key: '../x', label: 'bad' }], claude: true, running: 1, max_running: 6 });
  assert.deepStrictEqual(opts.places.map((p) => p.key), ['clients-acme']);
  const jobs = MD.cleanJobs([
    { id: 'dabc12345', session_id: LEAD, name: 'Books', place_label: 'clients acme', brief: 'the books', evil: 1, status: 'idle' },
    { id: 'not-a-job', session_id: LEAD },
  ], 'MINI', opts);
  assert.strictEqual(jobs.length, 1);
  assert.strictEqual(jobs[0].client_work, true);
  assert.strictEqual(jobs[0].brief, null);
  assert.strictEqual(jobs[0].name, 'Private work');
  assert.ok(!('evil' in jobs[0]));
});

test('a reply buzzes only when it answers the owner, never a helper report', () => {
  const home = tmp();
  const now = Date.now();
  const job = (id) => ({ id, notify: true, parent: null, client_work: false });
  const talk = (who) => ({ v: `1:idle:${now}`, items: [{ kind: 'prompt', who, at: now - 5000, text: 'x' }, { kind: 'reply', at: now - 1000, text: 'y' }] });
  const a = MD.storeTalk(home, 'MINI', { downer0001: talk('the owner'), dhelper001: talk('report:Scout') }, [job('downer0001'), job('dhelper001')], now);
  assert.deepStrictEqual(a.replied.map((j) => j.id), ['downer0001']);
  assert.deepStrictEqual(Object.keys(a.acks).sort(), ['dhelper001', 'downer0001']);
});

test('a start queued for a spoke: shared choices checked on the hub, done there once', async () => {
  const w = world();
  const bad = MD.startRequest({ brief: 'x', model: 'gpt' }, null, null, w.ctx);
  assert.strictEqual(bad.ok, false);
  const q = MD.startRequest({ brief: 'Build the thing', place: 'clients-acme' }, null, { places: [{ key: 'clients-acme', label: 'clients acme', client: true }] }, w.ctx);
  assert.ok(q.ok);
  assert.strictEqual(q.view.name, 'Private work');
  const rec = MD.queue(w.home, 'MINI', 'start', q.req, q.view, Date.now());
  assert.strictEqual(MD.pending(w.home, 'MINI').length, 1);
  assert.ok(!fs.readFileSync(path.join(w.home, 'mesh', 'MINI', 'dispatch-outbox.jsonl'), 'utf8').includes('"view":{"brief'));
  const spoke = world();
  const ctx = Object.assign({}, spoke.ctx, { machine: 'MINI', launch: async () => 1 });
  const first = await MD.handle(spoke.home, [{ id: rec.id, kind: 'start', req: Object.assign({}, q.req, { place: null }) }], ctx);
  const again = await MD.handle(spoke.home, [{ id: rec.id, kind: 'start', req: q.req }], ctx);
  assert.strictEqual(first[0].ok, true, first[0].error);
  assert.deepStrictEqual(again, first, 'the same record is acknowledged, never started twice');
  assert.strictEqual(D.listJobs(spoke.home).length, 1);
  MD.ack(w.home, 'MINI', first, [], Date.now());
  assert.strictEqual(MD.pending(w.home, 'MINI').length, 0);
});

test('the New session sheet offers every computer in the settings, an offline one with its reason', () => {
  const home = tmp();
  const ms = MD.machines(home, Date.now(), {}, 'DESK');
  assert.deepStrictEqual(ms.map((m) => [m.key, m.ok]), [['MINI', false]]);
  assert.match(ms[0].why, /never reported/);
  assert.deepStrictEqual(MD.machines(home, Date.now(), {}, 'MINI'), [], 'a spoke offers no other computer');
});
