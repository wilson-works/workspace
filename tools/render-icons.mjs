#!/usr/bin/env node
/**
 * render-icons.mjs — the Home Screen icons, rendered from the one orb drawing (public/favicon.svg).
 *
 *   node tools/render-icons.mjs --resvg <dir holding node_modules/@resvg/resvg-js>
 *
 * The orb sits at 80% on a full-bleed tile in the manifest's background colour (iOS paints a
 * transparent icon black), and is written to public/icon-180.png, icon-192.png and icon-512.png.
 * @resvg/resvg-js is not a dependency of the office: install it anywhere off the code tree
 * (`npm install --no-save @resvg/resvg-js@2` in a scratch dir) and point --resvg there.
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const SIZES = [180, 192, 512];

const at = process.argv.indexOf('--resvg');
if (at < 0 || !process.argv[at + 1]) {
  process.stderr.write('usage: node tools/render-icons.mjs --resvg <dir with @resvg/resvg-js installed>\n');
  process.exit(2);
}
const { Resvg } = createRequire(path.join(path.resolve(process.argv[at + 1]), 'x.js'))('@resvg/resvg-js');

const manifest = JSON.parse(fs.readFileSync(path.join(PUB, 'manifest.webmanifest'), 'utf8'));
const orb = fs.readFileSync(path.join(PUB, 'favicon.svg'), 'utf8');
const inner = orb.slice(orb.indexOf('>', orb.indexOf('<svg')) + 1, orb.lastIndexOf('</svg>'));
const tile = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">',
  `<rect width="64" height="64" fill="${manifest.background_color}"/>`,
  `<g transform="translate(6.4 6.4) scale(0.8)">${inner}</g>`,
  '</svg>',
].join('');

for (const size of SIZES) {
  const png = new Resvg(tile, { fitTo: { mode: 'width', value: size } }).render().asPng();
  fs.writeFileSync(path.join(PUB, `icon-${size}.png`), png);
  process.stdout.write(`icon-${size}.png ${png.length} bytes\n`);
}
