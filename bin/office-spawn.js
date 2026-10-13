#!/usr/bin/env node
'use strict';

/**
 * office-spawn.js - hand a piece of your work to a helper session the office starts and watches (dispatch.js).
 *
 *   node <workspace>/bin/office-spawn.js "what to do, with everything they need" [--name "Short name"]
 *        [--model opus|fable|sonnet|haiku] [--effort low|medium|high|xhigh|max] [--hands careful|full|plan]
 *        [--cap 15|30|60|120|240] [--in <repo in a code root>] [--as <org agent, e.g. head-frontend>]
 *
 * Run it from inside a Claude Code session (its CLAUDE_CODE_SESSION_ID makes you the lead). The helper starts headless
 * in the Hub within seconds, shows on the office floor beside you and on the Team chart under you, and when
 * its turn ends its final reply comes back to you as an office note: a chat is woken by it, a session the office
 * started gets its next turn. Send it more with the office's note box, or by handing it another piece.
 * --owner makes it the owner's own session instead (no lead; its replies are read on the office).
 *
 * Unnamed choices take config/dispatch.json helper_defaults (Opus, medium effort, careful hands, 60 min), the
 * effort taken down to your own if yours is lower. A helper never runs above your effort, and Fable helpers run on low only.
 * Exit 0 started; 2 refused (the reason is printed); 1 anything else.
 */

const D = require('../src/server/dispatch');
const geo = require('../src/server/geography');

const args = process.argv.slice(2);
const FLAGS = ['--name', '--model', '--effort', '--hands', '--cap', '--in', '--as', '--session'];
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const brief = args.find((a, i) => !a.startsWith('--') && (i === 0 || !FLAGS.includes(args[i - 1])));
const toOwner = args.includes('--owner');
const lead = flag('--session') || process.env.CLAUDE_CODE_SESSION_ID || null;

function say(line, code) { process.stdout.write(`${line}\n`); process.exit(code); }

async function main() {
  if (!brief) say('NOT STARTED: say what the helper should do, in quotes, first.', 2);
  if (!toOwner && !(lead && D.SESSION_RE.test(lead))) {
    say('NOT STARTED: no lead session (CLAUDE_CODE_SESSION_ID is not set). Run this from inside a Claude Code session, or pass --owner.', 2);
  }
  const home = D.homeDir();
  const machine = geo.thisMachine();
  let parent = null;
  if (!toOwner) {
    const mine = D.listJobs(home).find((j) => j.session_id === lead);
    let callsign = null;
    try { callsign = (JSON.parse(require('fs').readFileSync(require('path').join(home, 'callsigns.json'), 'utf8'))[lead] || {}).name || null; } catch (_) { /* unnamed */ }
    parent = {
      machine, session_id: lead,
      name: mine ? mine.name : callsign || 'your lead',
      client_work: require('../src/server/sources').isClientWork(process.cwd(), process.env.CLAUDE_PROJECT_DIR),
    };
  }
  const r = D.createJob(home, {
    brief, name: flag('--name'), model: flag('--model'), effort: flag('--effort'), hands: flag('--hands'),
    cap_min: flag('--cap') ? Number(flag('--cap')) : null, place: flag('--in'), as: flag('--as'),
    parent, origin: toOwner ? 'owner' : 'session',
  }, { machine });
  if (!r.ok) say(`NOT STARTED: ${r.error}`, 2);
  const s = await D.startTurn(home, r.job.id);
  if (!s.ok) say(`NOT STARTED: ${s.error}`, 1);
  const j = r.job;
  say(`STARTED ${j.name} (${j.model_label}, ${j.effort} effort, ${j.hands_label.toLowerCase()} hands, ${j.cap_min} min cap) as ${j.id}. `
    + (toOwner ? 'Its replies show on the office.' : 'Its report comes back to you as an office note when its turn ends; finish your own turn meanwhile.'), 0);
}

main().catch((e) => say(`NOT STARTED: ${String(e && e.message).slice(0, 300)}`, 1));
