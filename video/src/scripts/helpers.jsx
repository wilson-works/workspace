// helpers.js — small builders the caption scripts share.

import TERMINAL from '../data/terminal.json';
import { terminalSeconds } from '../components/Terminal';
import { lineSeconds } from '../lib/timeline';

/** A terminal scene whose caption stays up long enough for the whole command and its output. */
export function term(name, text, extra) {
  const t = TERMINAL[name];
  const need = t ? terminalSeconds(t.steps) + 1.6 : 4;
  return Object.assign({ scene: 'terminal', props: { name }, lines: [{ text, s: Math.max(lineSeconds(text), need) }] }, extra || {});
}

/** A chapter card. */
export function chapter(n, name, text) {
  return { scene: 'chapter', chapter: name, props: { n, name }, lines: [{ text, s: 2.6 }] };
}
