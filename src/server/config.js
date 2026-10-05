'use strict';

/**
 * config.js — the person's WorkSpace settings: workspace.config.json at the repo root.
 *
 * Who the office belongs to, what it is called, which computers share it, where
 * the code and the Work page's projects live, and which work stays private. The file is never committed (it
 * names people and paths); workspace.config.example.json is the template, and
 * "set up my WorkSpace" in Claude Code fills it in.
 *
 * Every key is optional. A missing file, a missing key, an empty string or a
 * value still holding its setup marker ("{{CLAUDE: ...}}") all mean "not set",
 * and the default below applies. A half-finished setup never stops the office.
 *
 * WORKSPACE_CONFIG points at another file (tests, a second office).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_COLORS = ['#A855F7', '#6D28D9'];
const POOLS = ['trees', 'stars', 'rivers'];
const NAME_RE = /^[A-Z0-9][A-Z0-9-]{0,23}$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;

function file() {
  return process.env.WORKSPACE_CONFIG || path.join(ROOT, 'workspace.config.json');
}

/** A setting nobody has filled in yet. */
function unset(v) {
  if (v == null) return true;
  if (typeof v !== 'string') return false;
  const t = v.trim();
  return !t || t.startsWith('{{');
}

const str = (v) => (unset(v) || typeof v !== 'string' ? null : v.trim());
const list = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

/** A computer or machine name as the wall writes it: capitals, digits and hyphens, at most 24. */
function wallName(name) {
  const n = String(name || '').trim().toUpperCase().replace(/\.LOCAL$/, '').replace(/[^A-Z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 24);
  return n || 'UNKNOWN';
}

function thisComputer() {
  return wallName(process.env.COMPUTERNAME || os.hostname());
}

function normalize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const owner = r.owner && typeof r.owner === 'object' ? r.owner : {};
  const brand = r.brand && typeof r.brand === 'object' ? r.brand : {};
  const privacy = r.privacy && typeof r.privacy === 'object' ? r.privacy : {};

  const machines = [];
  for (const m of Array.isArray(r.machines) ? r.machines : []) {
    if (!m || typeof m !== 'object' || unset(m.name)) continue;
    const name = wallName(m.name);
    if (!NAME_RE.test(name) || machines.some((x) => x.name === name)) continue;
    machines.push({
      name,
      computer: unset(m.computer) ? null : wallName(m.computer),
      hub: m.hub === true,
      callsigns: str(m.callsigns),
    });
  }
  if (!machines.length) machines.push({ name: thisComputer(), computer: thisComputer(), hub: true, callsigns: null });
  if (!machines.some((m) => m.hub)) machines[0].hub = true;
  let hubSeen = false;
  machines.forEach((m, i) => {
    if (m.hub && hubSeen) m.hub = false;
    if (m.hub) hubSeen = true;
    if (!m.callsigns) m.callsigns = POOLS[i % POOLS.length];
  });

  const colors = Array.isArray(brand.colors) && brand.colors.length >= 2 && brand.colors.slice(0, 2).every((c) => HEX_RE.test(String(c)))
    ? brand.colors.slice(0, 2).map(String)
    : DEFAULT_COLORS;
  let logo = str(brand.logo);
  if (logo) {
    logo = path.resolve(ROOT, logo);
    if (!/\.(svg|png)$/i.test(logo) || !fs.existsSync(logo)) logo = null;
  }
  const hubUrl = str(r.hub_url);

  return {
    use: str(r.use) === 'company' ? 'company' : 'personal',
    owner: { name: str(owner.name) },
    brand: { office_name: str(brand.office_name) || 'WorkSpace', company: str(brand.company), colors, logo },
    machines,
    hub_url: hubUrl && /^https?:\/\//i.test(hubUrl) ? hubUrl.replace(/\/+$/, '') : null,
    code_roots: list(r.code_roots),
    work_folders: list(r.work_folders).map((f) => path.resolve(ROOT, f)),
    privacy: { private_work: list(privacy.private_work), never_read: list(privacy.never_read) },
    tailscale_cli: str(r.tailscale_cli),
  };
}

let cache = null;

/** The settings, re-read when the file changes. */
function load() {
  const f = file();
  let mtime = null;
  try { mtime = fs.statSync(f).mtimeMs; } catch (_) { /* no file: defaults */ }
  if (cache && cache.file === f && cache.mtime === mtime) return cache.cfg;
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (_) { raw = {}; }
  cache = { file: f, mtime, cfg: normalize(raw) };
  return cache.cfg;
}

function machines() { return load().machines; }
function machineNames() { return machines().map((m) => m.name); }
function hubMachine() { return machines().find((m) => m.hub).name; }

/**
 * This computer's name on the wall. WORKSPACE_MACHINE overrides it (tests).
 * Otherwise the machine whose `computer` is this one; a single machine with no
 * `computer` set is this one; anything else is the computer's own name, which
 * the hub refuses as an unknown machine until it is added to `machines`.
 */
function thisMachine() {
  const env = process.env.WORKSPACE_MACHINE;
  if (env && env.trim()) return wallName(env);
  const here = thisComputer();
  const ms = machines();
  const mine = ms.find((m) => m.computer === here);
  if (mine) return mine.name;
  if (ms.length === 1 && !ms[0].computer) return ms[0].name;
  return here;
}

/** The callsign pool name for a machine (trees, stars, rivers). */
function poolOf(machine) {
  const m = machines().find((x) => x.name === machine);
  return m ? m.callsigns : null;
}

/** Slashes one way, lower case: how two paths are compared. */
const norm = (p) => String(p || '').replace(/\//g, '\\').toLowerCase();

/**
 * Private work: a session whose folder matches a `privacy.private_work` entry.
 * An entry with a slash is a folder (matched as a path prefix anywhere in the
 * path); a plain word matches as a whole folder-name word. Its titles, task
 * descriptions and summaries never reach the wall.
 */
function isPrivate(...cwds) {
  const rules = load().privacy.private_work;
  if (!rules.length) return false;
  return cwds.some((c) => {
    if (!c) return false;
    const p = norm(c);
    return rules.some((rule) => {
      const r = norm(rule).replace(/\\+$/, '');
      if (/[\\]/.test(r)) return p === r || p.includes(`${r}\\`) || p.endsWith(r);
      const esc = r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[\\\\\\s_.-])${esc}($|[\\\\\\s_.-])`, 'i').test(p);
    });
  });
}

/** A Claude Code projects-folder name (the session's folder, slugged) the office must never open. */
function neverRead(slug) {
  const s = String(slug || '').toLowerCase();
  return load().privacy.never_read.some((p) => {
    const want = String(p).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return want && s.replace(/[^a-z0-9]+/g, '-').includes(want);
  });
}

/** Folders that hold code repos: a session inside one sits in that repo's room. */
function codeRoots() { return load().code_roots; }

/** What the page shows about whose office this is. */
function brand() {
  const c = load();
  return {
    name: c.brand.office_name,
    company: c.brand.company,
    owner: c.owner.name,
    colors: c.brand.colors,
    logo: !!c.brand.logo,
  };
}

function ownerName() { return load().owner.name; }

module.exports = {
  ROOT, POOLS, file, load, normalize, unset, wallName, thisComputer, thisMachine, machines, machineNames,
  hubMachine, poolOf, isPrivate, neverRead, codeRoots, brand, ownerName,
};
