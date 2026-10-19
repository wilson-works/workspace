'use strict';

/**
 * plan.js — Plan today: the office drafts a day plan from your own open work.
 *
 * Read from what the office already has, nothing else: questions waiting on you, the Work page's
 * projects told truthfully (work.js), and the care rounds' open problems (they are orders in the
 * Site care project). In order: answer questions; fix what the care round found; start again what
 * went back to the queue; the next New order in each project; what is ready for you to approve or
 * ship; the next lesson of a course. At most MAX lines. Private projects stay out (their text never
 * leaves your editor).
 *
 * The draft is kept for the day in <office home>/plan/today.json, so the card shows it on every
 * page until you draft again.
 */

const fs = require('fs');
const path = require('path');
const work = require('./work');

const MAX = 6;

/** "2026-10-19" in local time. */
function dayKey(now) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const brief = (p, s) => `Work on "${s.label}" (${s.id}) from my ${p.name} project on the Work page. Read the order first, do what it says, and tell me plainly what you did and what is left.`;

/**
 * Pure: the plan's lines from the Work list and the questions. -> [{ kind, text, project, id, brief }]
 * list: work.list(...).projects, already told truthfully; questions: the floor's open questions.
 */
function draftFrom(projects, questions) {
  const out = [];
  const q = (questions || []).length;
  if (q) out.push({ kind: 'answer', text: `Answer ${q === 1 ? 'the question' : `the ${q} questions`} waiting on you`, project: null, id: null, brief: null });
  const open = (projects || []).filter((p) => !p.private);
  const cardsIn = (p, lane) => ((p.kanban && p.kanban[lane] && p.kanban[lane].cards) || []);
  const push = (kind, text, p, s) => out.push({ kind, text, project: p.key, project_name: p.name, id: s.id, brief: brief(p, s) });
  // Site care first: a page that is not working matters most.
  for (const p of open.filter((x) => x.key === 'site-care')) for (const s of cardsIn(p, 'todo')) push('care', s.label, p, s);
  const orders = open.filter((x) => x.kind !== 'course' && x.key !== 'site-care');
  for (const p of orders) for (const s of cardsIn(p, 'todo').filter((c) => c.truth === 'requeued').slice(0, 1)) push('again', `Start again: ${s.label}`, p, s);
  for (const p of orders) for (const s of cardsIn(p, 'doing').filter((c) => c.truth === 'staged').slice(0, 1)) push('start', `Start: ${s.label}`, p, s);
  for (const p of orders) {
    const s = cardsIn(p, 'todo').find((c) => c.truth !== 'requeued');
    if (s) push('next', `Next in ${p.name}: ${s.label}`, p, s);
  }
  for (const p of orders) for (const s of cardsIn(p, 'doing').filter((c) => c.stage === 'ready' || c.stage === 'approved').slice(0, 1)) {
    out.push({ kind: 'decide', text: `${s.stage === 'ready' ? 'Look over and approve' : 'Ship'}: ${s.label}`, project: p.key, project_name: p.name, id: s.id, brief: null });
  }
  for (const p of open.filter((x) => x.kind === 'course' && x.next)) {
    out.push({ kind: 'learn', text: `Next lesson: ${p.next.label}`, project: p.key, project_name: p.name, id: p.next.id, brief: null });
  }
  // One line per order, first reason wins.
  const seen = new Set();
  return out.filter((x) => { const k = x.id ? `${x.project}/${x.id}` : x.kind; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, MAX);
}

const file = (home) => path.join(home, 'plan', 'today.json');

/** Today's saved draft, or null (none yet, or it is from another day). */
function read(home, now) {
  try {
    const d = JSON.parse(fs.readFileSync(file(home), 'utf8'));
    return d && d.day === dayKey(now) ? d : null;
  } catch (_) { return null; }
}

/** Draft the day now and keep it. sessions/questions: the floor's. */
function draft(home, now, sessions, questions) {
  const projects = work.list(home, now, sessions || []).projects;
  const d = { day: dayKey(now), at: now, items: draftFrom(projects, questions) };
  fs.mkdirSync(path.dirname(file(home)), { recursive: true });
  const tmp = `${file(home)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2), 'utf8');
  fs.renameSync(tmp, file(home));
  return d;
}

module.exports = { draftFrom, draft, read, dayKey, MAX };
