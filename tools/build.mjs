#!/usr/bin/env node
/**
 * build.mjs — build the office page into dist/ (npm run build).
 *
 *   node tools/build.mjs [--esbuild <dir holding node_modules/esbuild, react, react-dom>]
 *
 * Bundles src/ui/main.jsx into dist/app.js and dist/app.css, copies public/ (the
 * service worker, manifest and icons) and writes dist/index.html. dist/ is
 * committed, so another computer installs the office by pulling, with no build
 * step. esbuild comes with `npm install` (it is part of Vite); --esbuild points
 * at another install of it instead.
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const at = process.argv.indexOf('--esbuild');
const from = at >= 0 && process.argv[at + 1] ? path.resolve(process.argv[at + 1]) : ROOT;
const req = createRequire(path.join(from, 'node_modules', 'x.js'));
const esbuild = req('esbuild');
const pkg = (name) => path.dirname(req.resolve(`${name}/package.json`));

fs.mkdirSync(DIST, { recursive: true });
await esbuild.build({
  entryPoints: [path.join(ROOT, 'src', 'ui', 'main.jsx')],
  bundle: true,
  outfile: path.join(DIST, 'app.js'),
  loader: { '.jsx': 'jsx' },
  jsx: 'automatic',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  alias: { react: pkg('react'), 'react-dom': pkg('react-dom') },
  logLevel: 'warning',
});

for (const f of fs.readdirSync(path.join(ROOT, 'public'))) {
  fs.copyFileSync(path.join(ROOT, 'public', f), path.join(DIST, f));
}

fs.writeFileSync(path.join(DIST, 'index.html'), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>WorkSpace</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/icon-180.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="WorkSpace" />
    <link rel="stylesheet" href="/app.css" />
  </head>
  <body>
    <div id="root"></div>
    <script src="/app.js"></script>
  </body>
</html>
`);

for (const f of fs.readdirSync(DIST).sort()) process.stdout.write(`dist/${f} ${fs.statSync(path.join(DIST, f)).size} bytes\n`);
