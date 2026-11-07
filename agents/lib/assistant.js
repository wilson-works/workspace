'use strict';

/**
 * assistant.js — "make your own executive assistant": a short interview on the terminal that becomes
 * new-agent's options, with the assistant's door figure and mark drawn in Kody's and Louise's style
 * (agents/lib/figure.js). Node built-ins only.
 *
 *   interview({ input, output, taken }) -> { key, name, title, line, color, voice, jokes, files }
 *
 * The questions: the name; what they help with; how they talk; then their look (skin tone, hair,
 * glasses, outfit colour); then a yes to make them. Every question but the name has a default (Enter).
 * It reads answers line by line, so it works at a keyboard and with answers piped in (drills).
 * `taken(key)` says whether a key is already used; the key comes from the name, made unique.
 * A "no" at the end, or the input running out, throws { refused: true } and nothing is made.
 */

const readline = require('readline');
const { KEY_RE } = require('./agents');
const figure = require('./figure');

const TONES = {
  warm: {
    label: 'warm and encouraging, half coach, half teacher',
    voice: 'I am warm and encouraging: half coach, half teacher. I cheer the wins, I keep the next step small, and I explain anything new in one plain sentence.',
    jokes: ['Come in! What are we getting done today?', 'Small steps. I have the list, you have the wins.', 'Nothing is behind. It is just next.'],
  },
  precise: {
    label: 'calm and precise, short and exact',
    voice: 'I am calm and precise. I say what is done, what is not and what comes next, in as few words as it takes.',
    jokes: ['Door is open. Bring the list.', 'Three things are due this week. I have already sorted them.', 'Exactly on time. As planned.'],
  },
  cheerful: {
    label: 'cheerful and quick, with a little humour',
    voice: 'I am cheerful and quick: short answers, a little humour, and always the next thing to do.',
    jokes: ['Knock knock. It is me. I am the one with the clipboard.', 'Your calendar and I had a talk. We are friends now.', 'Coffee first, then the list. Mostly the list.'],
  },
};

const list = (table) => Object.keys(table).map((k, i) => `  ${i + 1}  ${table[k].label}`).join('\n');

/** An answer to a numbered question: its number, its key, or the default on Enter. null when it is neither. */
function choose(table, answer, def) {
  const a = String(answer || '').trim().toLowerCase();
  if (!a) return def;
  const keys = Object.keys(table);
  if (/^\d+$/.test(a) && keys[Number(a) - 1]) return keys[Number(a) - 1];
  return keys.find((k) => k === a || table[k].label.toLowerCase().startsWith(a)) || null;
}

/** A key from a name: lower-case letters, digits and dashes, starting with a letter, made unique. */
function keyFor(name, taken) {
  let base = String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^[^a-z]+|-+$/g, '').slice(0, 24);
  if (!KEY_RE.test(base)) base = 'assistant';
  let key = base;
  for (let n = 2; taken(key); n += 1) key = `${base}-${n}`.slice(0, 31);
  return key;
}

/** Reads one line at a time; resolves null when the input has ended. */
function lineReader(input) {
  const rl = readline.createInterface({ input, terminal: false });
  const lines = [];
  const waiting = [];
  let ended = false;
  rl.on('line', (l) => { if (waiting.length) waiting.shift()(l); else lines.push(l); });
  rl.on('close', () => { ended = true; while (waiting.length) waiting.shift()(null); });
  return {
    next: () => (lines.length ? Promise.resolve(lines.shift()) : ended ? Promise.resolve(null) : new Promise((res) => waiting.push(res))),
    close: () => rl.close(),
  };
}

async function interview(opts) {
  const o = opts || {};
  const output = o.output || process.stdout;
  const say = (s = '') => output.write(`${s}\n`);
  const reader = lineReader(o.input || process.stdin);
  const taken = o.taken || (() => false);
  const ended = () => Object.assign(new Error('The answers ran out before the last question, so nothing was made.'), { refused: true });

  const ask = async (question, check) => {
    for (let tries = 0; tries < 5; tries += 1) {
      say(question);
      output.write('> ');
      const a = await reader.next();
      if (a === null) throw ended();
      const v = check(a.trim());
      if (v !== null && v !== undefined) return v;
      say('Sorry, I did not get that. Try again.');
    }
    throw Object.assign(new Error('Five answers in a row did not fit, so nothing was made.'), { refused: true });
  };

  try {
    say("Let's make your own executive assistant. Seven quick questions; press Enter to take the suggestion in brackets.");
    say('');
    const name = await ask('1. What is their name? (for example: Rosa)', (a) => (a && a.length <= 40 ? a : null));
    const line = await ask(`2. What will ${name} help you with? One line. [keeps my calendar, drafts my emails and reminds me of deadlines]`,
      (a) => (a.length <= 200 ? (a || 'Keeps my calendar, drafts my emails and reminds me of deadlines.') : null));
    const tone = await ask(`3. How should ${name} talk to you?\n${list(TONES)}\n   [1]`, (a) => choose(TONES, a, 'warm'));
    const skin = await ask(`4. ${name}'s skin tone?\n${list(figure.SKIN)}\n   [3]`, (a) => choose(figure.SKIN, a, 'medium'));
    const hair = await ask(`5. ${name}'s hair?\n${list(figure.HAIR)}\n   [1]`, (a) => choose(figure.HAIR, a, 'short'));
    const glasses = await ask(`6. Glasses, like Louise? (y/n) [n]`, (a) => (/^(y|yes)$/i.test(a) ? true : /^(n|no|)$/i.test(a) ? false : null));
    const outfit = await ask(`7. The colour of ${name}'s suit (it also paints their office)?\n${list(figure.OUTFIT)}\n   [1]`, (a) => choose(figure.OUTFIT, a, 'navy'));

    const key = keyFor(name, taken);
    const t = TONES[tone];
    say('');
    say(`${name}, your executive assistant (key ${key}): ${t.label}; ${figure.SKIN[skin].label} skin, ${figure.HAIR[hair].label} hair${glasses ? ', glasses' : ''}, a ${figure.OUTFIT[outfit].label} suit.`);
    const go = await ask(`Make ${name}? (y/n) [y]`, (a) => (/^(y|yes|)$/i.test(a) ? true : /^(n|no)$/i.test(a) ? false : null));
    if (!go) throw Object.assign(new Error(`${name} was not made. Run it again any time.`), { refused: true });

    const look = { key, name, skin, hair, glasses, outfit };
    return {
      key, name, title: 'Executive Assistant',
      line: /[.!?]$/.test(line) ? line : `${line}.`,
      color: figure.OUTFIT[outfit].accent,
      voice: t.voice,
      jokes: t.jokes,
      files: { 'art.svg': figure.figureSvg(look), 'mark.svg': figure.markSvg(look) },
    };
  } finally {
    reader.close();
  }
}

module.exports = { interview, keyFor, choose, TONES };
