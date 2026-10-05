'use strict';

/**
 * root.js — where this computer's Hub is, and where its code lives. Resolved every time, never hardcoded.
 *
 * A Hub root is a folder that holds `.hub/hub.json` (the installer writes it) beside its CLAUDE.md.
 * Two values may differ from one computer to the next, and only two: the Hub root itself, and the
 * code zone inside it (`20-Coding/Projects` by default). Every script asks this file for both.
 *
 * Finding the root, first match wins:
 *   1. HUB_ROOT in the environment. It must point at a Hub, or this throws: a wrong pointer is a
 *      mistake to fix, never something to skip past.
 *   2. Walking up from a starting folder (the caller's, else the current directory, else this file's
 *      own folder), so any session or script inside a Hub finds it.
 *   3. The usual places. Windows: <drive>:\Hub on every drive D to Z, then C:\Hub, then
 *      %USERPROFILE%\Hub. macOS: ~/Hub, then /Volumes/<disk>/Hub. Linux: ~/Hub.
 *
 * Nothing found: resolveHubRoot() throws and names every place it looked. A script that quietly
 * falls through "works" while resolving nothing. Drives are probed as plain strings with
 * fs.existsSync, so a drive that does not exist never throws.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const MARKER = path.join('.hub', 'hub.json');
const DEFAULT_CODE_ZONE = '20-Coding/Projects';
// The other spelling a Hub may use for its code zone (a small machine that only keeps the branches
// it is working on). Probed after the recorded value, before giving up.
const CODE_ZONE_ALTERNATES = ['20-Coding/Projects', '20-Coding/Active'];

/** The zones every Hub has. Same names and numbers on every computer. */
const ZONES = [
  { dir: '00-Inbox', purpose: 'Landing zone for downloads and anything unsorted. Emptied every week. Nothing lives here.' },
  { dir: '10-Business', purpose: 'One folder per company or client: its documents, never its code.' },
  { dir: '20-Coding', purpose: 'Projects/ holds one full copy (git clone) of each code project. _Caches/ holds package caches.' },
  { dir: '30-Media', purpose: 'The media library: <Company>/Events, Shoots, Brand, Posts. New media comes in through _Ingest/.' },
  { dir: '40-Personal', purpose: 'Personal documents and media.' },
  { dir: '50-AI', purpose: 'The office (workspace/), the skills pack, your agents (agents/), fleet-ops, prompts.' },
  { dir: '90-Archive', purpose: 'Cold storage. _DumpQueue/ holds what is waiting for your yes before it is deleted.' },
];

function isHub(dir) {
  if (!dir) return false;
  try { return fs.statSync(path.join(dir, MARKER)).isFile(); } catch (_) { return false; }
}

/** The parsed .hub/hub.json of a Hub root, or null. */
function readHub(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, MARKER), 'utf8').replace(/^\uFEFF/, '')); } catch (_) { return null; }
}

function walkUp(from) {
  if (!from) return null;
  let dir = path.resolve(from);
  for (;;) {
    if (isHub(dir)) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** The usual places, in the order they are tried. */
function candidates(env) {
  const e = env || process.env;
  const home = e.USERPROFILE || e.HOME || os.homedir();
  const out = [];
  if (process.platform === 'win32') {
    for (let c = 'D'.charCodeAt(0); c <= 'Z'.charCodeAt(0); c += 1) out.push(`${String.fromCharCode(c)}:\\Hub`);
    out.push('C:\\Hub');
    if (home) out.push(`${home}\\Hub`);
    return out;
  }
  if (home) out.push(`${home}/Hub`);
  if (process.platform === 'darwin') {
    try {
      for (const v of fs.readdirSync('/Volumes')) out.push(`/Volumes/${v}/Hub`);
    } catch (_) { /* no /Volumes */ }
  }
  return out;
}

/**
 * { root, how } for this computer's Hub, or null when there is none.
 * @param opts { from, env, probe (false skips the usual places) }
 */
function findHubRoot(opts) {
  const o = opts || {};
  const env = o.env || process.env;
  const pinned = env.HUB_ROOT && String(env.HUB_ROOT).trim();
  if (pinned) {
    if (!isHub(pinned)) {
      throw new Error(`HUB_ROOT is set to ${pinned}, but there is no Hub there (no ${MARKER}). Fix HUB_ROOT or unset it.`);
    }
    return { root: path.resolve(pinned), how: 'HUB_ROOT' };
  }
  for (const start of [o.from, process.cwd(), __dirname]) {
    const r = walkUp(start);
    if (r) return { root: r, how: `found above ${start}` };
  }
  if (o.probe === false) return null;
  for (const c of candidates(env)) {
    if (isHub(c)) return { root: path.resolve(c), how: `found at ${c}` };
  }
  return null;
}

/** This computer's Hub root. Throws, naming every place looked, when there is none. */
function resolveHubRoot(opts) {
  const r = findHubRoot(opts);
  if (r) return r.root;
  const looked = [(opts && opts.from) || process.cwd(), ...candidates((opts && opts.env) || process.env)];
  throw new Error(`No Hub found (a folder holding ${MARKER}). Looked above the current folder and at: ${looked.join(', ')}. ` +
    'Run the installer, or set HUB_ROOT to your Hub folder.');
}

/**
 * The code zone of a Hub, as an absolute path: the one its hub.json records, else whichever of the
 * known spellings exists. Throws when none does, rather than guessing.
 */
function codeZone(root) {
  const hub = readHub(root) || {};
  const tried = [];
  for (const rel of [hub.code_zone, ...CODE_ZONE_ALTERNATES].filter(Boolean)) {
    const abs = path.join(root, ...String(rel).split(/[\\/]+/));
    if (tried.includes(abs)) continue;
    tried.push(abs);
    try { if (fs.statSync(abs).isDirectory()) return abs; } catch (_) { /* try the next */ }
  }
  throw new Error(`No code zone in the Hub at ${root}. Looked for: ${tried.join(', ')}.`);
}

/** Where a code project lives in this Hub; throws when it is in neither code zone spelling. */
function projectDir(root, name) {
  const tried = [];
  const hub = readHub(root) || {};
  for (const rel of [hub.code_zone, ...CODE_ZONE_ALTERNATES].filter(Boolean)) {
    const abs = path.join(root, ...String(rel).split(/[\\/]+/), name);
    if (tried.includes(abs)) continue;
    tried.push(abs);
    if (fs.existsSync(abs)) return abs;
  }
  throw new Error(`The project ${name} is not in this Hub's code zone. Looked at: ${tried.join(', ')}.`);
}

module.exports = {
  MARKER, DEFAULT_CODE_ZONE, CODE_ZONE_ALTERNATES, ZONES,
  isHub, readHub, findHubRoot, resolveHubRoot, candidates, codeZone, projectDir,
};
