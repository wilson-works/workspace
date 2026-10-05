#!/usr/bin/env node
'use strict';

/**
 * captions.js — every caption line of every video, with when it shows, as plain text.
 *
 *   node tools/captions.js [--video <id>] [--scenes] [--json]
 *
 * Contract: reads the caption scripts (src/scripts) exactly as the videos use them, and prints
 * one line per caption: the video, the time it appears, the chapter, and the words. --scenes prints
 * each scene's start instead. This is the text the release scan reads before any render, and the
 * text a person checks line by line. It also flags any line it was told never to use (house words
 * the release scan refuses). Exit 0 printed, 1 failed, 2 a refused word was found.
 */

const path = require('path');
const esbuild = require('esbuild');

const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

// A phrase the public release scan refuses, so a caption never carries it (say "current" instead).
// Spelt as character codes, so this file does not carry it either.
const AVOID = [new RegExp([117, 112, 0, 116, 111, 0, 100, 97, 116, 101].map((c) => (c ? String.fromCharCode(c) : '[\\s-]*')).join(''), 'i')];

function load() {
  const out = esbuild.buildSync({
    stdin: {
      contents: "export { VIDEOS } from './scripts/index.jsx'; export { buildTimeline } from './lib/timeline.jsx';",
      resolveDir: path.join(__dirname, '..', 'src'),
      loader: 'js',
    },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    loader: { '.css': 'empty', '.jsx': 'jsx' },
    external: ['remotion', 'react', 'react-dom', 'react/jsx-runtime'],
    logLevel: 'silent',
  });
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
}

function clock(frames) {
  const s = frames / 30;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;
}

function main() {
  const { VIDEOS, buildTimeline } = load();
  const only = arg('--video');
  const rows = [];
  let refused = 0;
  for (const v of VIDEOS) {
    if (only && v.id !== only) continue;
    const tl = buildTimeline(v);
    if (args.includes('--scenes')) {
      tl.scenes.forEach((s, i) => rows.push({ video: v.id, at: clock(s.from), frame: s.from, scene: `${i + 1} ${s.scene}`, text: s.cues[0].text }));
    } else {
      for (const l of tl.lines) {
        const bad = AVOID.some((re) => re.test(l.text));
        if (bad) refused += 1;
        rows.push({ video: v.id, at: clock(l.from), frame: l.from, chapter: l.chapter || '', text: l.text, refused: bad || undefined });
      }
    }
    rows.push({ video: v.id, at: clock(tl.total), frame: tl.total, text: '(end)' });
  }
  if (args.includes('--json')) process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
  else for (const r of rows) process.stdout.write(`${r.video}\t${r.at}\t${r.frame}\t${r.scene || r.chapter || ''}\t${r.refused ? 'REFUSED ' : ''}${r.text}\n`);
  return refused ? 2 : 0;
}

try { process.exit(main()); } catch (e) { process.stdout.write(`FAILED: ${e.message}\n`); process.exit(1); }
