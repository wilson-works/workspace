#!/usr/bin/env node
'use strict';

/**
 * contact-sheets.js — sheets of 3 x 3 frames, one second apart, from each rendered video, for a
 * frame-by-frame look without playing it.
 *
 *   node tools/contact-sheets.js --renders <folder> --out <folder> [--video <file.mp4>[,...]]
 *   node tools/contact-sheets.js --images <folder> --out <folder> [--name <prefix>]   (any stills)
 *
 * Contract:
 *   - For each <video>.mp4 in --renders it pulls one frame per second with Remotion's own ffmpeg
 *     (`npx remotion ffmpeg`, output rate 1), then lays nine at a time on a sheet, each labelled
 *     with its time, and writes <out>/<video>/sheet-NNN.jpg. Remotion's ffmpeg has no tile filter,
 *     so the sheets are laid out by Remotion's own headless Chrome.
 *   - The pulled frames go to a temporary folder beside --out and are removed afterwards.
 *   - Writes nothing else. Exit 0 written, 1 failed, 2 refused (bad arguments).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const puppeteer = require('puppeteer-core');
const { ensureBrowser } = require('@remotion/renderer');

const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const say = (m) => process.stdout.write(`${m}\n`);
const ROOT = path.join(__dirname, '..');
const PER = 9;
const CELL_W = 640;

function clock(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

/** One frame per second of a video, as JPEGs in dir, oldest first. */
function pullFrames(video, dir) {
  fs.mkdirSync(dir, { recursive: true });
  // `npx remotion ffmpeg`, run through Node directly so no shell parses the arguments.
  const cli = path.join(path.dirname(require.resolve('@remotion/cli/package.json')), 'remotion-cli.js');
  const r = spawnSync(process.execPath, [cli, 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-r', '1', '-vf', `scale=${CELL_W}:-2`, '-q:v', '3', path.join(dir, 'f-%05d.jpg')],
    { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg could not read ${path.basename(video)}: ${(r.stderr || '').trim().split('\n').pop()}`);
  return fs.readdirSync(dir).filter((f) => /\.(jpg|png)$/i.test(f)).sort().map((f) => path.join(dir, f));
}

function sheetHtml(cells, title) {
  const img = (c) => `<figure><img src="data:image/${/\.png$/i.test(c.file) ? 'png' : 'jpeg'};base64,${fs.readFileSync(c.file).toString('base64')}"><figcaption>${c.label}</figcaption></figure>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#0D0524;font-family:Segoe UI,system-ui,sans-serif;color:#E0E7FF}
h1{font-size:18px;font-weight:600;margin:0;padding:12px 16px}
main{display:grid;grid-template-columns:repeat(3,${CELL_W}px);gap:8px;padding:0 16px 16px}
figure{margin:0;background:#000}img{display:block;width:${CELL_W}px;height:auto}
figcaption{font-size:16px;padding:4px 8px;background:#2E1065}
</style></head><body><h1>${title}</h1><main>${cells.map(img).join('')}</main></body></html>`;
}

async function writeSheets(browser, cells, outDir, name) {
  fs.mkdirSync(outDir, { recursive: true });
  const page = await browser.newPage();
  let n = 0;
  try {
    await page.setViewport({ width: 3 * CELL_W + 16 * 2 + 16, height: 400, deviceScaleFactor: 1 });
    for (let i = 0; i < cells.length; i += PER) {
      n += 1;
      const part = cells.slice(i, i + PER);
      await page.setContent(sheetHtml(part, `${name} · sheet ${n} · ${part[0].label} to ${part[part.length - 1].label}`), { waitUntil: 'load' });
      const file = path.join(outDir, `sheet-${String(n).padStart(3, '0')}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 82, fullPage: true });
    }
  } finally {
    await page.close();
  }
  return n;
}

(async () => {
  const out = arg('--out');
  const renders = arg('--renders');
  const images = arg('--images');
  if (!out || (!renders && !images)) {
    say('Usage: node tools/contact-sheets.js --renders <folder> --out <folder> [--video a.mp4,b.mp4] | --images <folder> --out <folder>');
    process.exit(2);
  }
  const status = await ensureBrowser();
  const browser = await puppeteer.launch({ executablePath: status.path, headless: 'shell', args: ['--no-first-run'] });
  try {
    if (images) {
      const files = fs.readdirSync(images).filter((f) => /\.(png|jpg)$/i.test(f)).sort();
      const prefix = arg('--name') || path.basename(images);
      const cells = files.map((f) => ({ file: path.join(images, f), label: f.replace(/\.(png|jpg)$/i, '') }));
      const n = await writeSheets(browser, cells, path.resolve(out), prefix);
      say(`${n} sheet(s) from ${cells.length} image(s) in ${path.resolve(out)}`);
    } else {
      const only = arg('--video') ? new Set(arg('--video').split(',')) : null;
      const videos = fs.readdirSync(renders).filter((f) => /\.mp4$/i.test(f) && (!only || only.has(f))).sort();
      for (const v of videos) {
        const name = v.replace(/\.mp4$/i, '');
        const tmp = path.join(path.resolve(out), `.frames-${name}`);
        fs.rmSync(tmp, { recursive: true, force: true });
        try {
          const frames = pullFrames(path.join(renders, v), tmp);
          const cells = frames.map((file, i) => ({ file, label: clock(i) }));
          const n = await writeSheets(browser, cells, path.join(path.resolve(out), name), name);
          say(`${name}: ${frames.length} frame(s), ${n} sheet(s)`);
        } finally {
          fs.rmSync(tmp, { recursive: true, force: true });
        }
      }
    }
  } finally {
    await browser.close();
  }
})().catch((e) => { say(`FAILED: ${e.message}`); process.exit(1); });
