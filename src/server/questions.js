'use strict';

/**
 * questions.js — owner questions, answered from the office (or the phone).
 *
 * A session that needs the owner puts one question on the office with its own
 * recommendation. The owner answers with one tap - go with the
 * recommendation, let the org decide - or in their own words. Questions must be
 * plain English: if it is too technical for a business owner who does not
 * code, it is already an org question, not an owner question.
 *
 * So a question is refused at the door when it reads as technical, with a
 * sentence that sends the session to the org instead. What gets through is a
 * question and the asking session's recommendation - both required.
 *
 * Storage: one file per question under <office home>/questions/, written
 * atomically. An answered question keeps its file (the session reads its answer
 * from it) and leaves the page.
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');

const SESSION_RE = /^[0-9a-f-]{8,64}$/i;
const ID_RE = /^q[0-9a-z]{6,20}$/;
const MAX = 300;

/* ------------------------------------------------------ the plain-English gate */

// Things a business owner who does not code should never have to read. Each
// entry is a shape, not a word list to argue with: paths, file names, commit
// ids, code identifiers, and a short list of engineering words.
const TECHNICAL = [
  [/`/, 'code formatting'],
  // A drive letter, or two slashes between words - but not a date like 9/18/2026.
  [/\b[A-Za-z]:[\\/]|[\w.-]*[A-Za-z][\w.-]*[\\/][\w.-]*[A-Za-z][\w.-]*[\\/]/, 'a file path'],
  [/\b[\w-]+\.(?:js|jsx|mjs|cjs|ts|tsx|py|ps1|psm1|sh|bat|cmd|exe|dll|md|json|jsonl|sql|css|html|yml|yaml|toml|ini|db|sqlite|env|lock|log|txt|csv|vbs)\b/i, 'a file name'],
  // At least one digit: a real commit id effectively always carries one, and
  // without it ordinary words spelt from a-f ("defaced", "effaced") were flagged.
  [/\b(?=[0-9a-f]*[0-9])[0-9a-f]{7,40}\b/, 'a commit id'],
  [/\b[a-z][a-z0-9]*_[a-z0-9_]+\b/, 'a code name with underscores'],
  [/\b[a-z]+[A-Z][A-Za-z0-9]*\b/, 'a code name in camelCase'],
  [/\b(?:migration|schema|endpoint|regex|refactor|stack ?trace|rebase|cherry-?pick|null|boolean|json|sql|api|env var|localhost|middleware|webhook|payload|mutex|race condition|foreign key|index(?:es)? on)\b/i, 'engineering vocabulary'],
];

// Brand and product names that look like code (iPhone, eBay) but are how a
// customer talks. Kept in config/plain-names.json so anyone can add one
// without touching this file; matched whole-word, case-sensitive.
const PLAIN_NAMES_FILE = path.join(__dirname, '..', '..', 'config', 'plain-names.json');
let plainNamesRe = null;
function plainNames() {
  if (plainNamesRe !== null) return plainNamesRe;
  let names = [];
  try { names = JSON.parse(fs.readFileSync(PLAIN_NAMES_FILE, 'utf8')).names || []; } catch (_) { names = []; }
  const esc = names.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  plainNamesRe = esc.length ? new RegExp(`\\b(?:${esc.join('|')})\\b`, 'g') : false;
  return plainNamesRe;
}

/** null when the text is plain English; otherwise what made it technical. */
function technicalReason(text) {
  const names = plainNames();
  const t = names ? String(text).replace(names, 'name') : text;
  for (const [re, what] of TECHNICAL) if (re.test(t)) return what;
  return null;
}

// The org's engineering lead, by config/org-people.json `gate` (John in the CTO org).
function orgLead() {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'config', 'org-people.json'), 'utf8'));
    if (typeof p.gate === 'string' && p.gate.trim()) return p.gate.trim();
  } catch (_) { /* the default below */ }
  return 'the chief engineer';
}

const ORG_REDIRECT =
  'This reads as technical, which makes it an org question, not an owner question. ' +
  `Take it to the org (engineering questions go to ${orgLead()}) and carry on. If it truly needs ` +
  'the owner, ask it the way you would ask a business owner who does not code: what is the ' +
  'choice, and what happens either way - no file names, code or jargon.';

function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

/** Check a question and recommendation. Returns {ok, question, recommendation} or {ok:false, error}. */
function vet(question, recommendation) {
  const q = clean(question);
  const r = clean(recommendation);
  if (q.length < 10) return { ok: false, error: 'The question is missing or too short.' };
  if (q.length > MAX) return { ok: false, error: `Keep the question under ${MAX} characters - one plain question.` };
  if (r.length < 3) return { ok: false, error: 'Say what you recommend (--recommend). The owner can accept it with one tap.' };
  if (r.length > MAX) return { ok: false, error: `Keep the recommendation under ${MAX} characters.` };
  const why = technicalReason(q) || technicalReason(r);
  if (why) return { ok: false, error: `${ORG_REDIRECT} (It contains ${why}.)`, org_question: true };
  return { ok: true, question: q, recommendation: r };
}

/* ------------------------------------------------------------------ storage */

function dir(home) { return path.join(home, 'questions'); }
function fileOf(home, id) { return path.join(dir(home), `${id}.json`); }

function writeAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function read(home, id) {
  if (!ID_RE.test(String(id || ''))) return null;
  try { return JSON.parse(fs.readFileSync(fileOf(home, id), 'utf8')); } catch (_) { return null; }
}

/** A session asks. */
function ask(home, sessionId, question, recommendation, now) {
  if (!SESSION_RE.test(String(sessionId || ''))) return { ok: false, error: 'No session id - run this from inside a Claude session.' };
  const v = vet(question, recommendation);
  if (!v.ok) return v;
  const t = now || Date.now();
  const q = {
    id: `q${t.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    session_id: String(sessionId), asked_at: t,
    question: v.question, recommendation: v.recommendation,
    answer: null,
  };
  writeAtomic(fileOf(home, q.id), q);
  return { ok: true, id: q.id };
}

/** Every question on this machine still waiting for the owner. */
function openQuestions(home) {
  let names = [];
  try { names = fs.readdirSync(dir(home)); } catch (_) { return []; }
  const out = [];
  for (const n of names) {
    if (!/^q[0-9a-z]+\.json$/.test(n)) continue;
    const q = read(home, n.slice(0, -5));
    if (q && !q.answer) out.push(q);
  }
  return out.sort((a, b) => a.asked_at - b.asked_at);
}

const KINDS = new Set(['recommendation', 'org', 'own']);

/** The sentence handed to the session. */
function answerText(q, answer) {
  const head = `${config.ownerName() || 'The owner'} answered your question "${q.question}"`;
  if (answer.kind === 'recommendation') return `${head}: go with your recommendation - "${q.recommendation}".`;
  if (answer.kind === 'org') return `${head}: let the org decide. Take it to the right org lead (engineering: ${orgLead()}), let them rule, and carry on.`;
  return `${head}: "${answer.text}"`;
}

/** Validate an owner's answer. Returns {ok, answer} or {ok:false, error}. */
function vetAnswer(kind, text) {
  if (!KINDS.has(kind)) return { ok: false, error: 'unknown answer' };
  const t = clean(text);
  if (kind === 'own' && !t) return { ok: false, error: 'Write your answer first.' };
  if (t.length > 1200) return { ok: false, error: 'Keep the answer under 1200 characters.' };
  return { ok: true, answer: { kind, text: kind === 'own' ? t : null } };
}

/** Record an answer to a question on THIS machine. */
function recordAnswer(home, id, answer, now) {
  const q = read(home, id);
  if (!q) return { ok: false, error: 'no such question' };
  if (q.answer) return { ok: false, error: 'already answered' };
  q.answer = Object.assign({ at: now || Date.now() }, answer);
  writeAtomic(fileOf(home, id), q);
  return { ok: true, question: q, text: answerText(q, answer) };
}

/**
 * The hub answered a question that lives on another machine. It is kept here
 * only so the page stops offering it until that machine's next feed stops
 * listing it (the spoke marks its own copy answered when the note lands).
 */
function markRemoteAnswered(home, machine, id, now) {
  writeAtomic(path.join(dir(home), 'remote', `${machine}-${id}.json`), { machine, id, at: now || Date.now() });
}
function remoteAnswered(home, machine, id) {
  return fs.existsSync(path.join(dir(home), 'remote', `${machine}-${id}.json`));
}

module.exports = {
  vet, vetAnswer, technicalReason, ask, read, openQuestions, recordAnswer, answerText,
  markRemoteAnswered, remoteAnswered, ORG_REDIRECT, ID_RE,
};
