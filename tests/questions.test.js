'use strict';

/**
 * questions.test.js — owner questions (2026-09-18). A question must be plain
 * English with a recommendation; a technical one is refused and sent to the
 * org; an answer is recorded once and handed back as a sentence that names the
 * owner (workspace.config.json owner.name).
 *
 * The config is written here before any src module loads: the owner is Alex,
 * and the machines are DESK (the hub) and MINI.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CFG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'questions-cfg-'));
process.env.WORKSPACE_CONFIG = path.join(CFG_DIR, 'workspace.config.json');
fs.writeFileSync(process.env.WORKSPACE_CONFIG, JSON.stringify({
  owner: { name: 'Alex' },
  machines: [{ name: 'DESK', hub: true }, { name: 'MINI' }],
}));

const Q = require('../src/server/questions');

const SID = '97a7ad02-0e31-44cd-bf62-c479ddeb854c';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'questions-'));

test('2026-09-18 plain owner questions pass, with dates and money', () => {
  for (const [q, r] of [
    ['Should our quotes include a bar setup fee for events over 150 guests?', 'Yes, $150 flat, matching our other packages.'],
    ['Can we launch the partner portal to clients on 9/22/2026, or wait a week?', 'Wait a week so the invite emails are reviewed.'],
    ['Do you want the phone to buzz when a session is waiting on you?', 'Yes, once per question.'],
  ]) {
    const v = Q.vet(q, r);
    assert.ok(v.ok, `${q} -> ${v.error}`);
  }
});

test('2026-09-18 technical questions are refused and sent to the org, by the gate person in org-people.json', () => {
  for (const q of [
    'Should I add an index on event_id in the quotes table?',
    'Is it ok to change src/server/reader.js to skip the drill?',
    'Can I rebase the branch onto main before merging?',
    'Should the endpoint return null when the store is missing?',
    'Do we keep commit 0c466f7c4 or revert it?',
    'Should quoteTotal round before or after tax?',
    'Should we edit `config.json` to raise the cap?',
    'Should I rotate events.jsonl at 24 MB or 32 MB?',
  ]) {
    const v = Q.vet(q, 'Yes.');
    assert.strictEqual(v.ok, false, `should refuse: ${q}`);
    assert.strictEqual(v.org_question, true);
    assert.match(v.error, /org question/);
    assert.match(v.error, /engineering questions go to John/);
  }
});

test('2026-09-20 P1-1 words spelt from a-f are not commit ids, and brand names are not code', () => {
  for (const s of ['defaced', 'effaced', 'deadbeef', 'the Acme iPhone app', 'eBay', 'macOS', 'WordPress', 'AirBnB',
    'Sell the kit on eBay and take iPhone payments?']) {
    assert.strictEqual(Q.technicalReason(s), null, `should pass: ${s}`);
  }
  assert.strictEqual(Q.technicalReason('a1b2c3d'), 'a commit id');
  assert.strictEqual(Q.technicalReason('Do we keep commit 0c466f7c4 or revert it?'), 'a commit id');
  assert.strictEqual(Q.technicalReason('Should quoteTotal round before tax?'), 'a code name in camelCase');
  const names = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'plain-names.json'), 'utf8')).names;
  assert.ok(names.includes('iPhone') && names.includes('eBay') && names.includes('macOS'), 'the exemption list is a config file');
});

test('2026-09-18 a question needs a recommendation the owner can accept', () => {
  assert.strictEqual(Q.vet('Should we raise the hourly rate for holidays?', '').ok, false);
});

test('2026-09-18 ask, answer once, and the session gets a plain sentence back, from the owner by name', () => {
  const home = tmp();
  const a = Q.ask(home, SID, 'Should we raise the hourly rate for holidays?', 'Yes, by 20% on holidays.');
  assert.ok(a.ok);
  assert.strictEqual(Q.openQuestions(home).length, 1);

  const own = Q.vetAnswer('own', '');
  assert.strictEqual(own.ok, false, 'an own answer needs words');

  const r = Q.recordAnswer(home, a.id, Q.vetAnswer('recommendation').answer);
  assert.ok(r.ok);
  assert.strictEqual(r.text, 'Alex answered your question "Should we raise the hourly rate for holidays?": go with your recommendation - "Yes, by 20% on holidays.".');
  assert.strictEqual(Q.openQuestions(home).length, 0);
  assert.strictEqual(Q.recordAnswer(home, a.id, Q.vetAnswer('org').answer).ok, false, 'answered once only');
});

test('an org answer names the gate person; with no owner name set the answer is from "The owner"', () => {
  const q = { question: 'Should we open on Sundays?', recommendation: 'Yes.' };
  assert.match(Q.answerText(q, { kind: 'org', text: null }), /^Alex answered .*: let the org decide\. .*\(engineering: John\)/);
  const before = process.env.WORKSPACE_CONFIG;
  process.env.WORKSPACE_CONFIG = path.join(CFG_DIR, 'no-such-config.json');
  try {
    assert.match(Q.answerText(q, { kind: 'own', text: 'Only in summer.' }), /^The owner answered your question "Should we open on Sundays\?": "Only in summer\."$/);
  } finally {
    process.env.WORKSPACE_CONFIG = before;
  }
});

test('2026-09-18 the hub re-checks a spoke\'s questions and drops technical ones', () => {
  const mesh = require('../src/server/mesh');
  const home = tmp();
  mesh.ingest(home, { machine: 'MINI', desks: [], questions: [
    { id: 'qabc12345', session_id: SID, asked_at: 1, question: 'Should we open the new menu to all clients this week?', recommendation: 'Yes.' },
    { id: 'qdef67890', session_id: SID, asked_at: 2, question: 'Should I drop the foreign key on quotes?', recommendation: 'Yes.' },
  ] }, Date.now(), 'DESK');
  const feed = mesh.readFeed(home, 'MINI');
  assert.deepStrictEqual(feed.questions.map((q) => q.id), ['qabc12345']);
});
