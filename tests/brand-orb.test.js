'use strict';

/**
 * brand-orb.test.js — the purple orb, not a square, in the bar, the browser
 * tab and the Home Screen icons: public/favicon.svg is the one drawing,
 * /favicon.ico answers with it (no 404), the page links it, the manifest's
 * icons exist at the sizes they claim, the served manifest carries the
 * office's own name from workspace.config.json, and the bar mark is round in
 * the brand colours, purple unless the config names others.
 *
 * WORKSPACE_CONFIG is a temp file naming the office "Studio" for "Acme", with
 * no logo and no colours, so this computer's own settings never leak in.
 */

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'orb-'));
process.env.WORKSPACE_CONFIG = path.join(home, 'workspace.config.json');
fs.writeFileSync(process.env.WORKSPACE_CONFIG, JSON.stringify({ brand: { office_name: 'Studio', company: 'Acme' } }));

const { start } = require('../src/server/server');
const config = require('../src/server/config');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const PURPLES = ['#A855F7', '#6D28D9'];

const dist = path.join(home, 'dist');
fs.mkdirSync(dist);
fs.copyFileSync(path.join(PUB, 'favicon.svg'), path.join(dist, 'favicon.svg'));
fs.copyFileSync(path.join(PUB, 'manifest.webmanifest'), path.join(dist, 'manifest.webmanifest'));
fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(dist, 'index.html'));
const PORT = 4398;
const h = start({ root: home, home, port: PORT, distDir: dist });
after(() => { h.stop(); fs.rmSync(home, { recursive: true, force: true }); });

function get(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p }, (res) => {
      const out = [];
      res.on('data', (d) => out.push(d));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: Buffer.concat(out) }));
    }).on('error', reject);
  });
}

/** Width and height from a PNG's IHDR. */
function pngSize(buf) {
  assert.equal(buf.slice(1, 4).toString('latin1'), 'PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test('the orb drawing is a circle in the default purples', () => {
  const svg = fs.readFileSync(path.join(PUB, 'favicon.svg'), 'utf8');
  assert.match(svg, /<circle\b/);
  assert.doesNotMatch(svg, /<rect\b/, 'the orb has no square in it');
  for (const c of PURPLES) assert.ok(svg.includes(c), `favicon.svg carries ${c}`);
});

test('/favicon.ico and /favicon.svg answer 200 with the orb, not 404', async () => {
  const svg = fs.readFileSync(path.join(PUB, 'favicon.svg'));
  for (const p of ['/favicon.ico', '/favicon.svg']) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.equal(r.type, 'image/svg+xml', p);
    assert.ok(r.body.equals(svg), `${p} is the orb drawing`);
  }
});

test('the page links the orb as its tab icon and keeps the Home Screen icon', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml"/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/icon-180\.png"/);
});

test('every icon the manifest and the page name exists at the size it claims', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PUB, 'manifest.webmanifest'), 'utf8'));
  const icons = manifest.icons.map((i) => ({ src: i.src, size: Number(i.sizes.split('x')[0]) })).concat({ src: '/icon-180.png', size: 180 });
  for (const i of icons) {
    const { w, h: ht } = pngSize(fs.readFileSync(path.join(PUB, i.src.replace(/^\//, ''))));
    assert.deepEqual([w, ht], [i.size, i.size], i.src);
  }
});

test('the served manifest keeps those icons and carries the office name from workspace.config.json', async () => {
  const r = await get('/manifest.webmanifest');
  assert.equal(r.status, 200);
  assert.equal(r.type, 'application/manifest+json');
  const m = JSON.parse(r.body.toString('utf8'));
  assert.equal(m.name, 'Studio · Acme');
  assert.equal(m.short_name, 'Studio');
  const shipped = JSON.parse(fs.readFileSync(path.join(PUB, 'manifest.webmanifest'), 'utf8'));
  assert.deepEqual(m.icons, shipped.icons);
});

test('the bar mark is the round orb in the brand colours, the purples by default', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'office.css'), 'utf8');
  const rule = /\.brand-mark\s*\{([^}]*)\}/.exec(css);
  assert.ok(rule, '.brand-mark rule exists');
  assert.match(rule[1], /border-radius:\s*50%/);
  assert.match(rule[1], /radial-gradient\(circle at 30% 30%, var\(--brand-1, #A855F7\), var\(--brand-2, #6D28D9\)\)/);
  // The page sets --brand-1/--brand-2 from the frame's brand colours, which default to the same purples.
  assert.deepEqual(config.brand().colors, PURPLES);
});
