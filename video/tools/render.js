#!/usr/bin/env node
'use strict';

/**
 * render.js — render the videos to MP4.
 *
 *   node tools/render.js --out <folder> [--video <id>[,<id>]] [--draft] [--scale 0.5]
 *
 * Contract:
 *   - Bundles the project once and renders each composition (all seven by default) to
 *     <out>/<file>.mp4, the file name each caption script names (for example
 *     walkthrough-1-what-it-is.mp4). H.264, 30 fps.
 *   - A final render (no --draft) is refused while any terminal transcript or the starter-skills
 *     list is still a draft (src/data/terminal.json, src/data/skills.json): a placeholder must
 *     never reach a published video. --draft renders anyway, for a look, and --scale shrinks it.
 *   - Renders are never kept in git; video/out/ is ignored. Writes nothing else.
 *   - Prints each file's length and size. Exit 0 rendered, 1 failed, 2 refused.
 */

const fs = require('fs');
const path = require('path');
const { bundle } = require('@remotion/bundler');
const { renderMedia, selectComposition, ensureBrowser } = require('@remotion/renderer');
const esbuild = require('esbuild');

const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const say = (m) => process.stdout.write(`${m}\n`);
const ROOT = path.join(__dirname, '..');

function scripts() {
  const out = esbuild.buildSync({
    stdin: { contents: "export { VIDEOS } from './scripts/index.jsx';", resolveDir: path.join(ROOT, 'src'), loader: 'js' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    loader: { '.css': 'empty', '.jsx': 'jsx' }, external: ['remotion', 'react', 'react-dom', 'react/jsx-runtime'], logLevel: 'silent',
  });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports.VIDEOS;
}

/** What is still a placeholder. */
function drafts() {
  const left = [];
  const term = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'terminal.json'), 'utf8'));
  for (const [k, v] of Object.entries(term)) if (v && v.draft) left.push(`terminal "${k}"`);
  const skills = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'skills.json'), 'utf8'));
  if (skills.draft) left.push('the starter-skills list');
  return left;
}

(async () => {
  const out = arg('--out');
  if (!out) { say('Usage: node tools/render.js --out <folder> [--video <id>,...] [--draft] [--scale 0.5]'); process.exit(2); }
  const draft = args.includes('--draft');
  const left = drafts();
  if (left.length && !draft) {
    say(`REFUSED: still drafts: ${left.join(', ')}. Capture the real output first (capture/terminal.js), or add --draft for a look.`);
    process.exit(2);
  }
  const scale = Number(arg('--scale') || 1);
  const want = arg('--video') ? new Set(arg('--video').split(',')) : null;
  const videos = scripts().filter((v) => !want || want.has(v.id));
  if (!videos.length) { say('REFUSED: no video by that id. node tools/captions.js --scenes lists them.'); process.exit(2); }
  fs.mkdirSync(path.resolve(out), { recursive: true });
  await ensureBrowser();
  const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src', 'index.jsx'), publicDir: path.join(ROOT, 'public') });
  for (const v of videos) {
    const composition = await selectComposition({ serveUrl, id: v.id });
    const outputLocation = path.join(path.resolve(out), v.out);
    const started = Date.now();
    let last = -1;
    await renderMedia({
      serveUrl, composition, codec: 'h264', crf: 18, pixelFormat: 'yuv420p', imageFormat: 'jpeg', jpegQuality: 92,
      outputLocation, scale, overwrite: true,
      onProgress: ({ progress }) => { const p = Math.floor(progress * 10); if (p !== last) { last = p; process.stdout.write(`  ${v.id} ${p * 10}%\r`); } },
    });
    const mb = (fs.statSync(outputLocation).size / 1048576).toFixed(1);
    const secs = (composition.durationInFrames / composition.fps).toFixed(1);
    say(`${v.out}: ${secs} s, ${composition.width * scale}x${composition.height * scale}, ${mb} MB, rendered in ${Math.round((Date.now() - started) / 1000)} s${draft ? ' (draft)' : ''}`);
  }
})().catch((e) => { say(`FAILED: ${e.message}`); process.exit(1); });
