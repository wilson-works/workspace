#!/usr/bin/env node
'use strict';

/**
 * ask-owner.js — put one question in front of the owner, on the office.
 *
 *   node <workspace>/bin/ask-owner.js "Plain question?" --recommend "What I would do"
 *   node <workspace>/bin/ask-owner.js "Plain question?" --recommend "..." --wait
 *
 * The owner answers from the office or their phone with one of: go with your
 * recommendation / let the org decide / their own words. The answer comes back as
 * a note (the office's delivery hook hands it over on your next tool call).
 *
 * --wait blocks until the answer arrives and prints it. Run it in the
 * background (run_in_background) when you must stop and wait: you are woken the
 * moment they answer, and you can keep working meanwhile.
 *
 * Technical questions are refused, with the reason: they belong to the org.
 * Exit codes: 0 asked (or answered, with --wait); 2 refused; 1 other failure.
 */

const Q = require('../src/server/questions');

const args = process.argv.slice(2);
const flagVal = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const question = args.find((a, i) => !a.startsWith('--') && (i === 0 || !['--recommend', '--session'].includes(args[i - 1])));
const recommendation = flagVal('--recommend');
const wait = args.includes('--wait');
const sessionId = flagVal('--session') || process.env.CLAUDE_CODE_SESSION_ID;

const home = require('../src/server/home').homeDir();

const r = Q.ask(home, sessionId, question, recommendation);
if (!r.ok) {
  process.stdout.write(`NOT ASKED: ${r.error}\n`);
  process.exit(r.org_question ? 2 : 1);
}
const who = require('../src/server/config').ownerName() || 'the owner';
process.stdout.write(`ASKED ${r.id}: it is on the office for ${who}. The answer will come back as a note${wait ? '; waiting for it now' : ''}.\n`);

if (wait) {
  const tick = () => {
    const q = Q.read(home, r.id);
    if (q && q.answer) {
      process.stdout.write(`ANSWERED: ${Q.answerText(q, q.answer)}\n`);
      process.exit(0);
    }
  };
  tick();
  setInterval(tick, 5000);
}
