#!/usr/bin/env node
'use strict';

/**
 * stills.js — render single frames of the videos, for a quick look without a full render.
 *
 *   node tools/stills.js [--video <id>[,<id>]] [--frames 0,120,900 | --scenes] [--scale 0.5] [--out <dir>]
 *
 * Contract: bundles the project once and writes <out>/<video>-<frame>.png (default out: out/stills,
 * which git ignores). --scenes takes one frame from the middle of every caption line instead of a
 * list. Writes nothing else. Exit 0 written, 1 failed.
 */

const fs = require('fs');
const path = require('path');
const { bundle } = require('@remotion/bundler');
const { renderStill, selectComposition, ensureBrowser } = require('@remotion/renderer');
const esbuild = require('esbuild');

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.join(__dirname, '..');

function lineMiddles() {
  const out = esbuild.buildSync({
    stdin: { contents: "export { VIDEOS } from './scripts/index.jsx'; export { buildTimeline } from './lib/timeline.jsx';", resolveDir: path.join(ROOT, 'src'), loader: 'js' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    loader: { '.css': 'empty', '.jsx': 'jsx' }, external: ['remotion', 'react', 'react-dom', 'react/jsx-runtime'], logLevel: 'silent',
  });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require);
  const map = {};
  for (const v of mod.exports.VIDEOS) map[v.id] = mod.exports.buildTimeline(v).lines.map((l) => l.from + Math.floor(l.duration * 0.6));
  return map;
}

(async () => {
  const outDir = path.resolve(arg('--out', path.join(ROOT, 'out', 'stills')));
  fs.mkdirSync(outDir, { recursive: true });
  const scale = Number(arg('--scale', '0.5'));
  const want = arg('--video', null);
  const frames = arg('--frames', null);
  const middles = args.includes('--scenes') ? lineMiddles() : null;
  await ensureBrowser();
  const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src', 'index.jsx'), publicDir: path.join(ROOT, 'public') });
  const ids = want ? want.split(',') : Object.keys(middles || {});
  let n = 0;
  for (const id of ids) {
    const composition = await selectComposition({ serveUrl, id });
    const list = frames ? frames.split(',').map(Number) : (middles ? middles[id] : [0]);
    for (const frame of list) {
      if (frame >= composition.durationInFrames) continue;
      const output = path.join(outDir, `${id}-${String(frame).padStart(5, '0')}.png`);
      await renderStill({ serveUrl, composition, frame, output, scale, imageFormat: 'png' });
      n += 1;
    }
    process.stdout.write(`${id}: ${list.length} still(s)\n`);
  }
  process.stdout.write(`${n} still(s) in ${outDir}\n`);
})().catch((e) => { process.stdout.write(`FAILED: ${e.message}\n`); process.exit(1); });
