'use strict';

/**
 * care.js — care rounds: the office checks your own web pages on a schedule.
 *
 * You list your sites in config/care.json (config/care.example.json is the template; the file
 * is never committed, see .gitignore). With no care.json, or no sites in it, care rounds are
 * off. Each site is { name, url, expect? }: the page must answer (below 400) and, when `expect`
 * is set, show those words. Rounds run at `times` (local time, default 6:30 AM and 1:00 PM), and
 * whenever someone presses Check now.
 *
 * A page that fails becomes one order in the office's own Work project, "Site care", kept under
 * <office home>/care/projects/site-care (the office never writes into your projects). When the
 * page works again its order is closed (its file removed); with nothing open the project goes too.
 *
 *   load(file)            the care config, or { on: false }
 *   due(cfg, last, now)   true when a scheduled round has come round since the last one
 *   round(home, cfg, now, fetchFn)  check every site; write state and the Site care orders
 *   status(home, cfg)     one line for the floor: { on, state, last_at, sites, failing: [{name}] }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, '..', '..', 'config', 'care.json');
const DEFAULT_TIMES = ['06:30', '13:00'];
const TIMEOUT_MS = 15000;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** config/care.json -> { on, times, sites }. A placeholder site (example.com) counts as not filled in. */
function load(file) {
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(file || FILE, 'utf8')); } catch (_) { raw = null; }
  const r = raw && typeof raw === 'object' ? raw : {};
  const sites = [];
  for (const s of Array.isArray(r.sites) ? r.sites : []) {
    if (!s || typeof s.url !== 'string') continue;
    let u;
    try { u = new URL(s.url); } catch (_) { continue; }
    if (!/^https?:$/.test(u.protocol) || /(^|\.)example\.(com|org|net)$/i.test(u.hostname)) continue;
    sites.push({
      name: typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 60) : u.hostname,
      url: u.toString(),
      expect: typeof s.expect === 'string' && s.expect.trim() ? s.expect.trim().slice(0, 200) : null,
    });
  }
  const times = (Array.isArray(r.times) ? r.times : DEFAULT_TIMES).filter((t) => TIME_RE.test(String(t)));
  return { on: r.on !== false && sites.length > 0, times: times.length ? times : DEFAULT_TIMES, sites };
}

/** Today's scheduled times as epoch ms, local time. */
function timesToday(times, now) {
  return times.map((t) => {
    const [, h, m] = TIME_RE.exec(t);
    const d = new Date(now);
    d.setHours(Number(h), Number(m), 0, 0);
    return d.getTime();
  });
}

/** A round is due when one of today's times has passed since the last round. */
function due(cfg, lastAt, now) {
  if (!cfg.on) return false;
  return timesToday(cfg.times, now).some((t) => now >= t && (lastAt || 0) < t);
}

/** "6:30 AM" for "06:30". */
function twelve(t) {
  const m = TIME_RE.exec(String(t));
  if (!m) return String(t);
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** One site checked: { ok, why }. fetchFn defaults to the global fetch. */
async function check(site, fetchFn) {
  const f = fetchFn || fetch;
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
  try {
    const res = await f(site.url, { redirect: 'follow', signal: ctl ? ctl.signal : undefined, headers: { 'User-Agent': 'WorkSpace care round' } });
    if (!res || res.status >= 400) return { ok: false, why: `The page answered with an error (${res ? res.status : 'no answer'}).` };
    if (site.expect) {
      const text = await res.text();
      if (!String(text).toLowerCase().includes(site.expect.toLowerCase())) return { ok: false, why: `The page opened, but the words "${site.expect}" were not on it.` };
    }
    return { ok: true, why: null };
  } catch (e) {
    return { ok: false, why: e && e.name === 'AbortError' ? 'The page did not answer within 15 seconds.' : 'The page could not be reached.' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const careDir = (home) => path.join(home, 'care');
const projectDir = (home) => path.join(careDir(home), 'projects', 'site-care');
const stateFile = (home) => path.join(careDir(home), 'state.json');
const idOf = (url) => `CARE-${crypto.createHash('sha1').update(url).digest('hex').slice(0, 6)}`;

function readState(home) {
  try { return JSON.parse(fs.readFileSync(stateFile(home), 'utf8')) || {}; } catch (_) { return {}; }
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

const when12 = (ms) => {
  const d = new Date(ms);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** Keep the Site care project in step with the results: one order per failing page, none for a page that works. */
function syncOrders(home, results, now) {
  const dir = projectDir(home);
  const steps = path.join(dir, 'steps');
  const failing = results.filter((r) => !r.ok);
  const keep = new Set(failing.map((r) => `${idOf(r.url)}.md`));
  let have = [];
  try { have = fs.readdirSync(steps); } catch (_) { have = []; }
  const closed = have.filter((f) => /^CARE-[0-9a-f]{6}\.md$/.test(f) && !keep.has(f));
  for (const f of closed) fs.rmSync(path.join(steps, f), { force: true });
  // A closed order's mark goes with it, so the same page failing again starts as a New order.
  if (closed.length) {
    const pf = path.join(home, 'work', 'progress.json');
    try {
      const all = JSON.parse(fs.readFileSync(pf, 'utf8'));
      if (all && all['site-care']) {
        for (const f of closed) delete all['site-care'][f.slice(0, -3)];
        writeAtomic(pf, JSON.stringify(all, null, 2));
      }
    } catch (_) { /* no marks */ }
  }
  if (!failing.length) {
    try { if (!fs.readdirSync(steps).length) fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { fs.rmSync(dir, { recursive: true, force: true }); }
    return;
  }
  writeAtomic(path.join(dir, 'PROJECT.md'), [
    '---', 'name: Site care', 'summary: Pages the care rounds found not working. Each closes by itself once the page works again.',
    'kind: project', 'order: 0', '---',
    'The office checks the sites in your care list on a schedule. Each page that failed its check is one order here.', '',
  ].join('\n'));
  for (const r of failing) {
    const file = path.join(steps, `${idOf(r.url)}.md`);
    if (fs.existsSync(file)) continue;   // one order per problem, kept until the page works again
    writeAtomic(file, [
      '---', `id: ${idOf(r.url)}`, `title: "Fix ${r.name.replace(/"/g, "'")}: the page is not working"`, '---',
      '## What the care round found', '', `${r.why} Checked at ${when12(now)}.`, '',
      '## The page', '', r.url, '',
      '## Done when', '', '- [ ] The page opens and shows what it should. The next care round closes this order by itself.', '',
    ].join('\n'));
  }
}

/** Check every site once; keep the results and the Site care orders. -> the new state. */
async function round(home, cfg, now, fetchFn) {
  const results = [];
  for (const s of cfg.sites) {
    const r = await check(s, fetchFn);
    results.push({ name: s.name, url: s.url, ok: r.ok, why: r.why });
  }
  const state = { last_at: now, results };
  writeAtomic(stateFile(home), JSON.stringify(state, null, 2));
  syncOrders(home, results, now);
  return state;
}

/** What the floor shows: { on, state: 'good'|'problem'|'unchecked'|'off', last_at, sites, failing, times }. */
function status(home, cfg) {
  if (!cfg.on) return { on: false, state: 'off', last_at: null, sites: 0, failing: [], times: cfg.times.map(twelve) };
  const st = readState(home);
  const known = new Set(cfg.sites.map((s) => s.url));
  const results = (st.results || []).filter((r) => known.has(r.url));
  const failing = results.filter((r) => !r.ok).map((r) => ({ name: r.name }));
  return {
    on: true,
    state: !st.last_at ? 'unchecked' : failing.length ? 'problem' : 'good',
    last_at: st.last_at || null,
    sites: cfg.sites.length,
    failing,
    times: cfg.times.map(twelve),
  };
}

module.exports = { load, due, check, round, status, readState, twelve, idOf, FILE, DEFAULT_TIMES };
