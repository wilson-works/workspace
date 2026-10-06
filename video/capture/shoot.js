#!/usr/bin/env node
'use strict';

/**
 * shoot.js — take the screenshots the videos use, from the staged sandbox office.
 *
 *   node capture/stage.js up --sandboxes <dir>      (first)
 *   node capture/shoot.js [--sandboxes <dir>] [--only <shot>[,<shot>]] [--list]
 *   node capture/stage.js down --sandboxes <dir>    (after)
 *
 * Contract:
 *   - Drives Remotion's own headless Chrome through puppeteer-core. Never a browser anyone else is
 *     using: it launches its own, with a throwaway profile, and closes it.
 *   - Re-seeds the invented day (seed.js) whenever the last seed is a minute old, and waits for the
 *     other computers' next feed, so every desk on every computer is as fresh as a live one.
 *   - Writes public/shots/<name>.png and public/shots/manifest.json: per shot its size, its device
 *     scale, and the boxes (CSS pixels) of the parts the videos zoom into (each desk by callsign,
 *     each agent's office by key, the bars and panels).
 *   - Refuses to keep a shot whose page text carries this computer's real name, its real user name
 *     or the sandbox folder: everything on screen must be the invented world.
 * Exit 0 all shots taken, 1 a shot failed, 2 refused (a shot showed something real).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { ensureBrowser } = require('@remotion/renderer');
const { WORLD, baseFrom, idsFrom, sandboxes } = require('./sandbox');
const { seed, uuidOf } = require('./seed');

const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const base = baseFrom(args);
const ids = idsFrom(args);
const OUT = path.join(__dirname, '..', 'public', 'shots');
const say = (m) => process.stdout.write(`${m}\n`);

const desk = sandboxes(base, ids).find((s) => s.computer.hub);
const OFFICE = `http://127.0.0.1:${desk.computer.office_port}`;
const key = (machine, callsign) => `${machine}:${uuidOf(`${machine}:${callsign}`)}`;
const agentUrl = (k) => `http://127.0.0.1:${WORLD.agents.find((a) => a.key === k).port}/`;

// A little wider than a laptop screen, so a whole page fills the frame under the caption band.
const WIDE = { width: 1600, height: 840, deviceScaleFactor: 1.5 };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
// The Fleet page is long: a taller window shows the board and the handoffs under the computers.
const TALL = { width: 1600, height: 1500, deviceScaleFactor: 1.5 };

/** Every shot: where, at what size, what to wait for, and what to do first. */
const SHOTS = [
  { name: 'floor-all', url: `${OFFICE}/#/floor/all`, view: WIDE, wait: '.desk' },
  { name: 'floor-desk', url: `${OFFICE}/#/floor/DESK`, view: WIDE, wait: '.desk' },
  { name: 'floor-mini', url: `${OFFICE}/#/floor/MINI`, view: WIDE, wait: '.desk' },
  { name: 'floor-laptop', url: `${OFFICE}/#/floor/LAPTOP`, view: WIDE, wait: '.desk' },
  { name: 'panel-cedar', url: `${OFFICE}/#/floor/DESK/${encodeURIComponent(key('DESK', 'Cedar'))}`, view: WIDE, wait: '.panel .thread' },
  {
    name: 'panel-vega-note', url: `${OFFICE}/#/floor/MINI/${encodeURIComponent(key('MINI', 'Vega'))}`, view: WIDE, wait: '.panel .composer textarea',
    act: async (page) => { await page.type('.panel .composer textarea', 'Push the branch when the tests pass. The gate on DESK takes it from there.'); },
  },
  { name: 'questions', url: `${OFFICE}/#/questions`, view: WIDE, wait: '.panel' },
  { name: 'work', url: `${OFFICE}/#/work`, view: WIDE, wait: '.panel' },
  { name: 'work-course', url: `${OFFICE}/#/work/getting-started`, view: WIDE, wait: '.panel' },
  { name: 'agents', url: `${OFFICE}/#/agents`, view: WIDE, wait: '.ahall .aoffice' },
  { name: 'fleet', url: `${OFFICE}/#/fleet`, view: WIDE, wait: '.fcomps .fcomp' },
  { name: 'fleet-board', url: `${OFFICE}/#/fleet`, view: TALL, wait: '.fcomps .fcomp' },
  {
    // A knock on the first agent's door (Louise), found by the name on its plaque, not by its place.
    name: 'agents-knock', url: `${OFFICE}/#/agents`, view: WIDE, wait: '.ahall .aoffice',
    act: async (page) => {
      const door = await page.evaluateHandle((k) => {
        const office = [...document.querySelectorAll('.ahall .aoffice')]
          .find((el) => ((el.querySelector('.aplaque-name') || {}).textContent || '').trim().toLowerCase().startsWith(k));
        return office ? office.querySelector('.adoor') : null;
      }, WORLD.agents[0].key);
      if (!door.asElement()) throw new Error(`no door for ${WORLD.agents[0].key} in the Agents' wing`);
      await door.asElement().click({ button: 'right' });
      await new Promise((r) => setTimeout(r, 1300));
    },
  },
  // Each agent's own dashboard, at its sandbox port: louise-dashboard, bryn-dashboard. An agent whose
  // page picks a scene at random (Bryn at rest) is pinned to one with its query (demo-world.json).
  ...WORLD.agents.map((a) => ({ name: `${a.key}-dashboard`, url: `${agentUrl(a.key)}${a.query || ''}`, view: WIDE, wait: 'main' })),
  { name: 'phone-floor', url: `${OFFICE}/#/floor/all`, view: PHONE, wait: '.desk' },
  { name: 'phone-questions', url: `${OFFICE}/#/questions`, view: PHONE, wait: '.panel' },
  { name: 'phone-agents', url: `${OFFICE}/#/agents`, view: PHONE, wait: '.ahall .aoffice' },
  { name: 'phone-fleet', url: `${OFFICE}/#/fleet`, view: PHONE, wait: '.fcomps .fcomp' },
];

/** What must never be on screen: this computer's own names, and the sandbox folder. */
function realTokens() {
  const out = new Set();
  const add = (v) => { const s = String(v || '').trim(); if (s.length >= 3) out.add(s.toLowerCase()); };
  add(os.hostname());
  add(process.env.COMPUTERNAME);
  try { add(os.userInfo().username); } catch (_) { /* no user info */ }
  add(base);
  add(base.replace(/\\/g, '/'));
  add(os.homedir());
  // The invented world's own names are allowed even if one happens to match.
  for (const c of WORLD.computers) out.delete(c.name.toLowerCase());
  out.delete(WORLD.person.toLowerCase());
  return [...out];
}

/** The parts of the page the videos zoom into, in CSS pixels. */
function boxesOf() {
  const box = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
  const out = {};
  const one = (sel, name) => { const el = document.querySelector(sel); if (el) out[name] = box(el); };
  one('header.bar', 'bar');
  one('.tabs-top', 'tabs');
  one('.tabs-bottom', 'tabs-bottom');
  one('.machines-bar', 'machines');
  one('.machines-segment', 'machines-segment');
  one('.panel', 'panel');
  one('.panel .composer', 'composer');
  one('.panel .thread-wrap', 'thread');
  one('.panel .helpers', 'helpers');
  one('.panel .now', 'now');
  one('.floor', 'floor');
  one('.pulse', 'pulse');
  one('.ahall', 'hall');
  one('.panel .lessons', 'lessons');
  one('.panel .panel-head', 'panel-head');
  one('.qcard', 'qcard');
  one('.panel .q-text', 'q-text');
  one('.panel .q-actions', 'q-actions');
  one('main', 'main');
  one('main #scene', 'scene');
  one('.fcomps', 'fleet-computers');
  one('.kanban-fleet', 'fleet-board');
  one('.fhands', 'fleet-handoffs');
  document.querySelectorAll('.fsection').forEach((el) => {
    const h = el.querySelector('.wproj-part-head');
    if (h) out[`section:${h.textContent.trim().toLowerCase()}`] = box(el);
  });
  document.querySelectorAll('.fcomps .fcomp').forEach((el) => {
    const n = el.querySelector('.fcomp-name');
    if (n) out[`computer:${n.textContent.trim()}`] = box(el);
  });
  for (const el of document.querySelectorAll('.desk[data-key], .quiet[data-key]')) {
    const name = (el.querySelector('.desk-name, .quiet-name') || {}).textContent || '';
    out[`desk:${name.split(' ')[0]}`] = box(el);
  }
  document.querySelectorAll('.room').forEach((el) => {
    const h = el.querySelector('.room-head h2');
    const m = el.querySelector('.room-machine');
    out[`room:${h ? h.textContent : '?'}${m ? `@${m.textContent}` : ''}`] = box(el);
  });
  document.querySelectorAll('.ahall .aoffice').forEach((el) => {
    const n = (el.querySelector('.aplaque-name') || {}).firstChild;
    const name = n ? String(n.textContent).trim().toLowerCase() : '?';
    out[`office:${name}`] = box(el);
    const door = el.querySelector('.adoor');
    if (door) out[`door:${name}`] = box(door);
  });
  // A part that is not on screen (hidden behind a panel, or not drawn on this page) has no box.
  for (const k of Object.keys(out)) if (out[k][2] === 0 || out[k][3] === 0) delete out[k];
  return out;
}

/**
 * Keep the invented day fresh: re-seed when the last seed is a minute old, then wait until the
 * DESK office holds a feed from every other computer sent after that seed (their forwarders send
 * every 15 s), so no shot shows a floor from before it.
 */
let lastSeed = 0;
async function freshen() {
  if (Date.now() - lastSeed < 60000) return { ok: true };
  const r = seed(base, null, ids);
  if (!r.ok) return r;
  lastSeed = r.at;
  const spokes = sandboxes(base, ids).filter((s) => !s.computer.hub).map((s) => s.name);
  for (let waited = 0; waited < 30000; waited += 500) {
    const fresh = spokes.every((name) => {
      try { return JSON.parse(fs.readFileSync(path.join(desk.office, 'mesh', name, 'feed.json'), 'utf8')).received_at > r.at + 1500; } catch (_) { return false; }
    });
    if (fresh) return { ok: true };
    await new Promise((res) => setTimeout(res, 500));
  }
  return { ok: false, error: `no fresh feed from ${spokes.join(' and ')} within 30 s; is the stage up (capture/stage.js up)?` };
}

async function main() {
  if (args.includes('--list')) { SHOTS.forEach((s) => say(s.name)); return 0; }
  const only = arg('--only') ? new Set(arg('--only').split(',')) : null;
  const status = await ensureBrowser();
  if (!status.path) { say('FAILED: no headless browser. Run: npx remotion browser ensure'); return 1; }
  fs.mkdirSync(OUT, { recursive: true });
  const manifestFile = path.join(OUT, 'manifest.json');
  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch (_) { manifest = {}; }
  const banned = realTokens();
  // A throwaway browser profile beside the sandboxes, not in the system temp folder.
  fs.mkdirSync(base, { recursive: true });
  const profile = fs.mkdtempSync(path.join(base, 'shoot-chrome-'));
  const browser = await puppeteer.launch({
    executablePath: status.path, headless: 'shell', userDataDir: profile,
    args: ['--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--font-render-hinting=none'],
  });
  let failed = 0;
  let refused = 0;
  try {
    for (const shot of SHOTS) {
      if (only && !only.has(shot.name)) continue;
      const r = await freshen();
      if (!r.ok) { say(`NOT SEEDED: ${r.error}`); return 1; }
      // Its own context per shot: nothing one page remembers (the machine last picked) leaks into the next.
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      try {
        await page.setViewport(shot.view);
        await page.goto(shot.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForSelector(shot.wait, { timeout: 20000 });
        await new Promise((res) => setTimeout(res, 1200));
        if (shot.act) await shot.act(page);
        const text = (await page.evaluate(() => document.body.innerText + ' ' + document.title)).toLowerCase();
        const hit = banned.find((t) => text.includes(t));
        if (hit) { refused += 1; say(`REFUSED ${shot.name}: the page shows something from this real computer; fix the source, never blur it.`); continue; }
        const file = path.join(OUT, `${shot.name}.png`);
        await page.screenshot({ path: file, type: 'png' });
        manifest[shot.name] = {
          file: `shots/${shot.name}.png`,
          width: Math.round(shot.view.width * shot.view.deviceScaleFactor),
          height: Math.round(shot.view.height * shot.view.deviceScaleFactor),
          scale: shot.view.deviceScaleFactor,
          css: { width: shot.view.width, height: shot.view.height },
          boxes: await page.evaluate(boxesOf),
        };
        say(`shot ${shot.name}`);
      } catch (e) {
        failed += 1;
        say(`FAILED ${shot.name}: ${e.message}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  say(`${Object.keys(manifest).length} shot(s) in the manifest; ${failed} failed; ${refused} refused`);
  return refused ? 2 : failed ? 1 : 0;
}

main().then((c) => process.exit(c)).catch((e) => { say(`FAILED: ${e.message}`); process.exit(1); });
