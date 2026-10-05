'use strict';

/**
 * video-sources.test.js — the video source carries nothing real, and every screenshot it names exists.
 *
 * Reads the committed text under video/ (the caption scripts, diagrams, data, capture and tools),
 * without Remotion, and checks:
 *   - no folder path other than the invented person's own (C:\Users\alex, /Users/alex);
 *   - no tailnet other than example-tailnet.ts.net;
 *   - the capture never uses the office's default port, 4316 (a person's real office);
 *   - no phrase the release scan refuses;
 *   - every screenshot a script names is in public/shots/manifest.json, and on disk.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const VIDEO = path.join(__dirname, '..', 'video');
const SKIP = new Set(['node_modules', 'out', 'public']);

function files(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) files(p, out);
    else if (/\.(jsx?|json|md)$/.test(name) && name !== 'package-lock.json') out.push(p);
  }
  return out;
}

const SOURCES = files(VIDEO).map((p) => ({ p: path.relative(VIDEO, p), text: fs.readFileSync(p, 'utf8') }));

test('the sources were found', () => {
  assert.ok(SOURCES.length > 20, `only ${SOURCES.length} files`);
});

test('no folder path but the invented person\'s own', () => {
  for (const { p, text } of SOURCES) {
    for (const m of text.matchAll(/(?<![A-Za-z])([A-Za-z]):(\\\\|\\|\/)([^\s'"`]*)/g)) {
      assert.match(m[3], /^Users(\\\\|\\|\/)alex\b/, `${p}: ${m[0]}`);
    }
    for (const m of text.matchAll(/\/Users\/([A-Za-z0-9._-]+)/g)) {
      assert.strictEqual(m[1], 'alex', `${p}: ${m[0]}`);
    }
  }
});

test('no tailnet but the example one', () => {
  for (const { p, text } of SOURCES) {
    for (const m of text.matchAll(/([a-z0-9-]+)\.ts\.net/gi)) {
      assert.strictEqual(m[1].toLowerCase(), 'example-tailnet', `${p}: ${m[0]}`);
    }
  }
});

test('the capture never touches the default office port', () => {
  for (const { p, text } of SOURCES.filter((s) => s.p.startsWith('capture'))) {
    assert.ok(!/\b4316\b/.test(text), `${p} mentions port 4316`);
  }
});

// Spelt as character codes, so this file does not carry the phrase itself.
const REFUSED = new RegExp([117, 112, 0, 116, 111, 0, 100, 97, 116, 101].map((c) => (c ? String.fromCharCode(c) : '[\\s-]*')).join(''), 'i');

test('no phrase the release scan refuses', () => {
  for (const { p, text } of SOURCES) assert.ok(!REFUSED.test(text), p);
});

test('every screenshot a script names is captured', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(VIDEO, 'public', 'shots', 'manifest.json'), 'utf8'));
  for (const [name, m] of Object.entries(manifest)) {
    assert.ok(fs.existsSync(path.join(VIDEO, 'public', m.file)), `${name}: ${m.file} is missing`);
  }
  const scripts = SOURCES.filter((s) => s.p.startsWith(path.join('src', 'scripts')));
  assert.ok(scripts.length >= 5);
  for (const { p, text } of scripts) {
    for (const m of text.matchAll(/\b(?:shot|beside):\s*(?:[^'\n]*\?\s*)?'([\w-]+)'/g)) {
      assert.ok(manifest[m[1]], `${p} names a screenshot "${m[1]}" that was never captured`);
    }
  }
});
