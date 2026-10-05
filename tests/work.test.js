'use strict';

/**
 * work.test.js — the Work page: projects read from folders (src/server/work.js).
 *
 * A temp folder of projects is added with workspace.config.json `work_folders`,
 * written here before any src module loads. The repo's own projects/ folder is
 * always read too, so every list assertion picks its project by key, never by
 * totals. One of the temp projects sits in a `privacy.private_work` folder.
 * Marks are kept in a temp office home, never in a project.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'work-'));
const FOLDER = path.join(BASE, 'projects');
const SECRET = path.join(FOLDER, 'tw-secret');
process.env.WORKSPACE_CONFIG = path.join(BASE, 'workspace.config.json');
fs.writeFileSync(process.env.WORKSPACE_CONFIG, JSON.stringify({ work_folders: [FOLDER], privacy: { private_work: [SECRET] } }));

function write(rel, text) {
  const f = path.join(FOLDER, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
  return f;
}

write('tw-sample/PROJECT.md', [
  '---',
  'name: Sample project   # shown on the card',
  'summary: "A project for the tests"',
  'kind: course',
  'order: 7',
  '---',
  'What the sample is for.',
  '',
].join('\n'));
write('tw-sample/steps/01-first.md', '---\nid: S-01\ntitle: First step\nminutes: 10\nstatus: done\n---\nBody one.\n');
write('tw-sample/steps/02-second.md', '---\nid: S-02\ntitle: Second step\nminutes: 15\nstatus: doing\nwho: Cindy (backend)\n---\nBody two.\n');
const THIRD = write('tw-sample/steps/03-third.md', '---\nid: S-03\ntitle: Third step\nminutes: 5\n---\nBody three.\n');
write('tw-sample/steps/04-fourth.md', 'No front matter at all.\n');
write('tw-sample/steps/notes.txt', 'not a step');
write('tw-empty/PROJECT.md', '---\nname: Empty\n---\n');
write('tw-nomd/steps/01-x.md', '---\nid: X-01\n---\n');
write('tw-secret/PROJECT.md', '---\nname: SECRETNAME books\nsummary: SECRETSUMMARY\nkind: project\n---\nSECRETBODY\n');
write('tw-secret/steps/01-a.md', '---\nid: P-01\ntitle: SECRETTITLE\nwho: SECRETWHO\n---\nSECRETSTEP\n');

const W = require('../src/server/work');

const home = () => fs.mkdtempSync(path.join(os.tmpdir(), 'work-home-'));
const NOW = Date.parse('2026-10-05T12:00:00Z');
const progressFile = (h) => path.join(h, 'work', 'progress.json');
const find = (v, key) => v.projects.find((p) => p.key === key);

test('parse: front matter to {meta, body}; minutes and order as numbers, all else text; a trailing " # note" dropped', () => {
  const { meta, body } = W.parse([
    '---',
    'name: Demo   # a note for the author',
    'id: 007',
    'order: 3',
    'minutes: 15 # about',
    'ratio: 0.5',
    'neg: -3',
    'title: "Capstone: your first specialist"',
    "who: 'Gavin (frontend)'",
    'tag: C#sharp',
    'Key-Name: x',
    'not a key line',
    '---',
    'The body.',
    '',
  ].join('\n'));
  assert.deepStrictEqual(meta, {
    name: 'Demo', id: '007', order: 3, minutes: 15, ratio: '0.5', neg: '-3', title: 'Capstone: your first specialist', who: 'Gavin (frontend)',
    tag: 'C#sharp', 'key-name': 'x',
  });
  assert.strictEqual(body, 'The body.\n');
});

test('parse: Windows line endings and a byte-order mark; no front matter is all body', () => {
  const crlf = W.parse('﻿---\r\nid: GS-01\r\ntitle: Welcome\r\n---\r\nHello\r\n');
  assert.deepStrictEqual(crlf.meta, { id: 'GS-01', title: 'Welcome' });
  assert.strictEqual(crlf.body, 'Hello\r\n');
  assert.deepStrictEqual(W.parse('Just text.\n'), { meta: {}, body: 'Just text.\n' });
  assert.deepStrictEqual(W.parse(''), { meta: {}, body: '' });
});

test('list: each project with its counts, its pct and its next step; the repo\'s own projects are always there', () => {
  const v = W.list(home(), NOW);
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.asOf, NOW);
  assert.ok(find(v, 'getting-started'), 'the shipped Get started course is listed from the repo\'s projects/');

  const p = find(v, 'tw-sample');
  assert.strictEqual(p.name, 'Sample project');
  assert.strictEqual(p.summary, 'A project for the tests');
  assert.strictEqual(p.kind, 'course');
  assert.strictEqual(p.order, 7);
  assert.strictEqual(p.private, false);
  // Four steps: one done, one doing, two to do (one has no front matter; notes.txt is not a step).
  assert.deepStrictEqual(p.counts, { todo: 2, doing: 1, done: 1, total: 4 });
  assert.strictEqual(p.pct, 25);
  assert.deepStrictEqual(p.next, { id: 'S-02', label: 'Second step', minutes: 15, who: 'Cindy (backend)' });
  assert.deepStrictEqual(p.kanban.done.cards.map((c) => c.id), ['S-01']);
  assert.deepStrictEqual(p.kanban.todo.cards.map((c) => c.id), ['S-03', '04-fourth']);
  assert.strictEqual(p.kanban.doing.count, 1);

  const empty = find(v, 'tw-empty');
  assert.deepStrictEqual(empty.counts, { todo: 0, doing: 0, done: 0, total: 0 });
  assert.strictEqual(empty.pct, null);
  assert.strictEqual(empty.next, null);
  assert.strictEqual(empty.kind, 'project');
  assert.strictEqual(empty.order, 100);

  assert.strictEqual(find(v, 'tw-nomd'), undefined, 'a folder with no PROJECT.md is not a project');
  assert.ok(v.projects.findIndex((x) => x.key === 'getting-started') < v.projects.findIndex((x) => x.key === 'tw-sample'), 'lower order first');
});

test('project: the description and every step with where it stands', () => {
  const v = W.project(home(), 'tw-sample', NOW);
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.project.body, 'What the sample is for.\n');
  assert.deepStrictEqual(v.steps.map((s) => [s.id, s.status]), [['S-01', 'done'], ['S-02', 'doing'], ['S-03', 'todo'], ['04-fourth', 'todo']]);
  assert.strictEqual(v.steps[3].label, '04-fourth', 'a step with no front matter is named by its file');
  assert.strictEqual(W.project(home(), 'no-such-project', NOW).ok, false);
});

test('step: its page, with prev, next and where it sits in the project', () => {
  const h = home();
  const s = W.step(h, 'tw-sample', 'S-02', NOW);
  assert.strictEqual(s.ok, true);
  assert.strictEqual(s.project.key, 'tw-sample');
  assert.strictEqual(s.title, 'Second step');
  assert.strictEqual(s.minutes, 15);
  assert.strictEqual(s.who, 'Cindy (backend)');
  assert.strictEqual(s.status, 'doing');
  assert.strictEqual(s.body, 'Body two.\n');
  assert.strictEqual(s.notice, null);
  assert.deepStrictEqual(s.prev, { id: 'S-01', label: 'First step', minutes: 10, who: null });
  assert.deepStrictEqual(s.next, { id: 'S-03', label: 'Third step', minutes: 5, who: null });
  assert.deepStrictEqual(s.position, { at: 2, of: 4 });

  const first = W.step(h, 'TW-SAMPLE', 's-01', NOW);
  assert.strictEqual(first.id, 'S-01', 'project and step are found whatever their case');
  assert.strictEqual(first.prev, null);
  const last = W.step(h, 'tw-sample', '04-fourth', NOW);
  assert.strictEqual(last.next, null);
  assert.deepStrictEqual(last.position, { at: 4, of: 4 });

  assert.match(W.step(h, 'no-such-project', 'S-01', NOW).error, /no project called no-such-project/);
  assert.match(W.step(h, 'tw-sample', 'S-99', NOW).error, /has no step S-99/);
});

test('mark: a step\'s status goes in <home>/work/progress.json, wins over the file, and never touches the project', () => {
  const h = home();
  const before = fs.readFileSync(THIRD, 'utf8');
  assert.deepStrictEqual(W.mark(h, 'tw-sample', 's-03', 'Done', 1234), { ok: true, project: 'tw-sample', id: 'S-03', status: 'done' });
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(progressFile(h), 'utf8')), { 'tw-sample': { 'S-03': { status: 'done', at: 1234 } } });
  assert.strictEqual(fs.readFileSync(THIRD, 'utf8'), before, 'the step file is unchanged');

  const s = W.step(h, 'tw-sample', 'S-03', NOW);
  assert.strictEqual(s.status, 'done');
  assert.strictEqual(s.marked_at, 1234);
  const p = find(W.list(h, NOW), 'tw-sample');
  assert.deepStrictEqual(p.counts, { todo: 1, doing: 1, done: 2, total: 4 });
  assert.strictEqual(p.pct, 50);

  // A mark can also move a step back, against what its file says.
  assert.strictEqual(W.mark(h, 'tw-sample', 'S-01', 'todo', 1300).ok, true);
  assert.strictEqual(W.step(h, 'tw-sample', 'S-01', NOW).status, 'todo');
});

test('mark refuses a bad status, an unknown project and an unknown step, and writes nothing', () => {
  const h = home();
  assert.match(W.mark(h, 'tw-sample', 'S-01', 'finished').error, /todo, doing or done/);
  assert.match(W.mark(h, 'no-such-project', 'S-01', 'done').error, /no project called/);
  assert.match(W.mark(h, 'tw-sample', 'S-99', 'done').error, /has no step S-99/);
  assert.strictEqual(fs.existsSync(progressFile(h)), false);
});

test('private work: a project in a privacy.private_work folder shows no folder, file, id, title or text', () => {
  const h = home();
  // The folder (tw-secret), the step's file (01-a) and its own id (P-01) can each name a client.
  const leaks = (v) => /SECRET|tw-secret|01-a|P-01/.test(JSON.stringify(v));

  const v = W.list(h, NOW);
  assert.strictEqual(find(v, 'tw-secret'), undefined, 'not listed under its folder name');
  const listed = v.projects.find((p) => p.private);
  assert.ok(listed, 'listed');
  assert.match(listed.key, /^private-[0-9a-f]{8}$/, 'an opaque key');
  assert.strictEqual(listed.name, 'Private project');
  assert.strictEqual(listed.summary, 'Private work');
  assert.deepStrictEqual(listed.next, { id: 'P1', label: 'Step 1', minutes: null, who: null });
  assert.ok(!leaks(listed));

  const proj = W.project(h, listed.key, NOW);
  assert.strictEqual(proj.project.body, null);
  assert.deepStrictEqual(proj.steps.map((s) => [s.id, s.label]), [['P1', 'Step 1']]);
  assert.ok(!leaks(proj));

  const s = W.step(h, listed.key, 'P1', NOW);
  assert.strictEqual(s.ok, true);
  assert.strictEqual(s.title, 'Step 1');
  assert.strictEqual(s.body, null);
  assert.strictEqual(s.who, null);
  assert.match(s.notice, /private work/);
  assert.ok(!leaks(s));

  // It can still be marked from the page, by its opaque key and positional id.
  assert.strictEqual(W.mark(h, listed.key, 'P1', 'doing', 1).ok, true);
  assert.strictEqual(W.step(h, listed.key, 'P1', NOW).status, 'doing');
  assert.ok(!leaks(JSON.parse(fs.readFileSync(progressFile(h), 'utf8'))), 'nor in the progress file');
});
