'use strict';

/**
 * catalog.js — the WilsonWorks agents anyone can install (agents/catalog.json). Node built-ins only.
 *
 * Each entry: { key, name, title, line, source, price, offer }. `source` is the agent's package (a git
 * address, a folder or a .zip file); `offer` is the question the installer asks about the agent it
 * offers, the first entry that has one.
 *
 *   file()            agents/catalog.json, or the file named in WW_AGENT_CATALOG (tests and drills)
 *   read()            the entries. A file that cannot be read, or an entry without a key, a name or a
 *                     source, throws a plain sentence. A relative folder in `source` is read from the
 *                     catalog file's own folder.
 *   find(key)         the entry for a key (any case), or null
 *   resolve(src)      { source, entry }: a folder, a .zip file or a git address stays as it is (entry
 *                     null); a catalog key becomes its source; anything else throws { refused: true },
 *                     with the catalog listed so the person sees what they can install
 *   privateLines(entry)  what is private about an agent (its "private": { what, repo | url, how, ask }),
 *                     checked read-only and said plainly: can this computer read that git repository
 *                     (never a password prompt), or does that address answer on this computer? It is
 *                     never installed from here. [] when the entry has no "private".
 *   lines(installed)  the catalog as plain lines. With `installed` (a Set of keys), each agent is
 *                     marked installed or not installed.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { KEY_RE, GIT_URL_RE, probeLocal } = require('./agents');

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch (_) { return false; } };
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch (_) { return false; } };

function file() {
  const env = process.env.WW_AGENT_CATALOG && process.env.WW_AGENT_CATALOG.trim();
  return env ? path.resolve(env) : path.join(__dirname, '..', 'catalog.json');
}

function read() {
  const f = file();
  let c;
  try { c = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) {
    throw new Error(`The agent catalog ${f} cannot be read (${e.message}).`);
  }
  if (!c || !Array.isArray(c.agents)) throw new Error(`The agent catalog ${f} needs a list called "agents".`);
  return c.agents.map((a, i) => {
    if (!a || typeof a !== 'object' || !KEY_RE.test(String(a.key)) || !isStr(a.name) || !isStr(a.source)) {
      throw new Error(`Entry ${i + 1} in the agent catalog ${f} needs a key (lower-case letters, digits and "-"), a name and a source.`);
    }
    const local = !GIT_URL_RE.test(a.source) && !path.isAbsolute(a.source);
    return Object.assign({}, a, { source: local ? path.resolve(path.dirname(f), a.source) : a.source });
  });
}

function find(key) {
  const k = String(key || '').trim().toLowerCase();
  return read().find((a) => a.key === k) || null;
}

function lines(installed) {
  const list = read();
  if (!list.length) return ['The catalog has no agents in it yet.'];
  const out = ['The WilsonWorks agents you can install:'];
  for (const a of list) {
    const who = `${a.name}${a.title ? `, ${a.title}` : ''}`;
    const state = installed ? (installed.has(a.key) ? 'installed' : 'not installed') : '';
    out.push(`  ${a.key.padEnd(16)} ${who.padEnd(36)} ${String(a.price || '').padEnd(8)} ${state}`.trimEnd());
    if (a.line) out.push(`  ${''.padEnd(16)} ${a.line}`);
  }
  out.push('Install one: node agents/bin/install-agent.js <key>');
  // Owner 2026-10-09: every agent we offer can be installed as it is, or built as your own version.
  out.push('Want your own version of one, built around the way you work? https://wilsonworks.studio/ai-consulting/agents');
  return out;
}

function resolve(src) {
  const s = String(src || '').trim();
  if (isDir(s) || (/\.zip$/i.test(s) && isFile(s)) || GIT_URL_RE.test(s)) return { source: s, entry: null };
  const entry = find(s);
  if (entry) return { source: entry.source, entry };
  throw Object.assign(new Error(`"${s}" is not a folder, a .zip file, a git address or one of our agents.\n${lines().join('\n')}`), { refused: true });
}

async function privateLines(entry) {
  const p = entry && entry.private;
  if (!p || !p.what) return [];
  if (p.repo) {
    const r = spawnSync('git', ['ls-remote', '--heads', p.repo], {
      timeout: 10000, stdio: 'ignore', windowsHide: true,
      env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }),
    });
    return [r.status === 0
      ? `= You have access to ${p.what}. ${p.how || ''}`.trimEnd()
      : `! ${p.what} is private, and this computer has no access to it (${p.repo}), so it was left out. ${entry.name}'s basic setup works without it. ${p.ask || ''}`.trimEnd()];
  }
  if (p.url) {
    let u;
    try { u = new URL(p.url); } catch (_) { return []; }
    const up = await probeLocal({ port: Number(u.port), path: u.pathname }, 2000);
    return [up
      ? `= ${p.what} is running on this computer.`
      : `! ${p.what} is not on this computer yet, or not running. It is private and installed on its own. ${p.how || ''}`.trimEnd()];
  }
  return [];
}

module.exports = { file, read, find, resolve, lines, privateLines };
