#!/usr/bin/env node
'use strict';

/**
 * office-forward.js - a spoke's half of the one shared office (src/server/mesh.js).
 *
 * Every interval it reads THIS machine's wall - the same reader.read() the local
 * office serves, already past the privacy boundary - and POSTs the desks and
 * alarms to the hub over the tailnet. The response carries any notes the owner
 * wrote, on the hub or on their phone, for a session on this machine; they go
 * into the LOCAL inbox, where the delivery hook already looks, and are
 * acknowledged on the next feed.
 *
 * Rules:
 *   - It opens no port. Only the hub listens, and only through `tailscale serve`.
 *   - It never reads anything the local wall does not already show.
 *   - It sends an empty floor as faithfully as a full one: the feed IS the
 *     liveness signal, and silence on the hub must mean this machine is off.
 *   - It runs once per machine (pid lock in the office home), and on the hub
 *     machine it exits at once - a machine does not feed itself.
 *   - It never throws out of the loop. A hub that is down is logged once on the
 *     way down and once on the way back, not every 15 seconds.
 *
 *   node bin/office-forward.js [--hub <url>] [--interval <ms>] [--once]
 *                              [--dev-identity <name>]   (local drills only)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { read, loadConfig } = require('../src/server/reader');
const geo = require('../src/server/geography');
const mesh = require('../src/server/mesh');
const inbox = require('../src/server/inbox');
const S = require('../src/server/sources');
const questions = require('../src/server/questions');
const channel = require('../src/server/channel');

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const flag = (n) => args.indexOf(n) >= 0;

const config = require('../src/server/config');
const { homeDir, ownerClaudeHome } = require('../src/server/home');

const home = homeDir();
const { cfg } = loadConfig();
const meshCfg = cfg.mesh || {};
const hub = String(arg('--hub', process.env.WORKSPACE_HUB || config.load().hub_url || '')).replace(/\/+$/, '');
const interval = Math.max(2000, Number(arg('--interval', meshCfg.default_interval_ms || 15000)));
const devIdentity = arg('--dev-identity', null);
const self = geo.thisMachine();

fs.mkdirSync(home, { recursive: true });
const logFile = path.join(home, 'forward.log');
const note = (m) => { try { fs.appendFileSync(logFile, `[${new Date().toISOString()}] forward: ${m}\n`); } catch (_) {} };

if (!hub) { note('no hub configured (workspace.config.json hub_url) - nothing to do'); process.exit(0); }
if (self === config.hubMachine() && !flag('--force')) {
  note(`this machine is the hub (${self}) - a machine does not feed itself`);
  process.exit(0);
}

/* ---- one forwarder per machine ---- */
const lockFile = path.join(home, 'forwarder.lock');
function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
if (!flag('--once')) {
  try {
    const old = Number(fs.readFileSync(lockFile, 'utf8').trim());
    if (old && old !== process.pid && alive(old)) { process.exit(0); }
  } catch (_) { /* no lock yet */ }
  fs.writeFileSync(lockFile, String(process.pid), 'utf8');
  const unlock = () => { try { if (Number(fs.readFileSync(lockFile, 'utf8')) === process.pid) fs.unlinkSync(lockFile); } catch (_) {} };
  process.on('exit', unlock);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
}

/* ---- notes already written into the local inbox (survives a restart) ---- */
const seenFile = path.join(home, 'mesh-notes-seen.json');
let seen = [];
try { seen = JSON.parse(fs.readFileSync(seenFile, 'utf8')); } catch (_) { seen = []; }
let acks = [];

// The office owner's sessions (home.js ownerClaudeHome), whichever account started this forwarder.
function liveOptions() {
  return {
    officeHome: home,
    projects: path.join(ownerClaudeHome(home), 'projects'),
    commsPaths: [path.join(ownerClaudeHome(home), 'comms.db')],
  };
}

// This machine's comms buses, one per repo, found the same way the hub finds
// its own (sources.findCommsDbs); re-listed once a minute.
let commsDbs = { at: 0, list: [] };
function flowsNow(opts, now) {
  if (now - commsDbs.at > 60000) {
    const zones = config.codeRoots().filter((z) => fs.existsSync(z));
    commsDbs = { at: now, list: S.findCommsDbs(zones, opts.commsPaths, 6 * 3600 * 1000, now) };
  }
  return S.readFlows(commsDbs.list, new Date(now - 45 * 60 * 1000).toISOString()).slice(0, 60);
}

function buildFeed() {
  const opts = liveOptions();
  const state = read(home, opts);
  const desks = (state.desks || [])
    .filter((d) => !d.remote)
    .map((d) => mesh.flattenDesk(d, inbox.status(home, d.id)));
  const alarms = (state.alarms || []).filter((a) => !a.machine);
  const flows = flowsNow(opts, state.asOf);
  const open = questions.openQuestions(home).slice(0, 30)
    .map((q) => ({ id: q.id, session_id: q.session_id, asked_at: q.asked_at, question: q.question, recommendation: q.recommendation }));
  // Group chat posts this machine's sessions made (bin/office-say.js); the hub keeps the thread.
  const channelPosts = channel.readLines(channel.file(home, 'outbox.jsonl')).slice(0, 20);
  return { v: 1, machine: self, sent_at: Date.now(), interval_ms: interval, desks, alarms, flows, questions: open, acks, channel_posts: channelPosts };
}

function post(feed) {
  return new Promise((resolve) => {
    let url;
    try { url = new URL(`${hub}/api/mesh/ingest`); } catch (e) { resolve({ ok: false, error: `bad hub url: ${e.message}` }); return; }
    const body = Buffer.from(JSON.stringify(feed), 'utf8');
    const headers = { 'Content-Type': 'application/json', 'Content-Length': body.length };
    if (devIdentity) headers['Tailscale-User-Login'] = devIdentity;
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, { method: 'POST', headers, timeout: 10000 }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; if (text.length > 1024 * 1024) req.destroy(); });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (_) { /* below */ }
        if (res.statusCode === 200 && parsed && parsed.ok) resolve(parsed);
        else resolve({ ok: false, error: `hub answered ${res.statusCode}${parsed && parsed.error ? `: ${parsed.error}` : ''}` });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timed out after 10 s')));
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.end(body);
  });
}

/** The hub took these posts: drop them from the outbox. Keep its recent thread for SessionStart. */
function takeChannel(result) {
  try {
    const acked = new Set(Array.isArray(result.channel_acks) ? result.channel_acks : []);
    const out = channel.file(home, 'outbox.jsonl');
    if (acked.size) {
      const keep = channel.readLines(out).filter((p) => !acked.has(p.id));
      const tmp = `${out}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, keep.map((p) => JSON.stringify(p)).join('\n') + (keep.length ? '\n' : ''), 'utf8');
      fs.renameSync(tmp, out);
    }
    if (Array.isArray(result.channel_recent)) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(channel.file(home, 'recent.json'), JSON.stringify({ at: Date.now(), messages: result.channel_recent.slice(-10) }), 'utf8');
    }
  } catch (_) { /* the posts stay queued and go again next feed */ }
}

function takeNotes(notes) {
  const handed = [];
  for (const n of notes || []) {
    if (!n || !n.id) continue;
    if (seen.includes(n.id)) { handed.push(n.id); continue; } // written before; the ack was lost
    const r = inbox.enqueue(home, n.session_id, n.text, n.from || 'owner');
    if (r.ok && n.answer && n.answer.question_id) {
      const a = questions.vetAnswer(n.answer.kind, n.answer.text);
      if (a.ok) questions.recordAnswer(home, n.answer.question_id, a.answer);
    }
    if (r.ok) {
      seen.push(n.id);
      handed.push(n.id);
      note(`note ${n.id} for ${String(n.session_id).slice(0, 8)} written to the local inbox (${String(n.text || '').length} chars)`);
    } else {
      // Unusable here (bad session id, too long): acknowledge it so the hub
      // stops re-sending, and say why in the log.
      handed.push(n.id);
      note(`note ${n.id} refused by the local inbox: ${r.error}`);
    }
  }
  seen = seen.slice(-500);
  try { fs.writeFileSync(seenFile, JSON.stringify(seen), 'utf8'); } catch (_) {}
  return handed;
}

let lastOk = null;
async function tick() {
  let result;
  try {
    result = await post(buildFeed());
  } catch (e) {
    result = { ok: false, error: String(e && e.message) };
  }
  if (result.ok) {
    if (lastOk !== true) note(`feeding ${hub} as ${self} every ${interval} ms (${result.desks} desk(s) accepted)`);
    lastOk = true;
    acks = takeNotes(result.notes);
    require('../src/server/avatars').takeFromHub(home, result.avatars, Date.now());
    takeChannel(result);
  } else {
    if (lastOk !== false) note(`hub unreachable: ${result.error} - will keep trying quietly`);
    lastOk = false;
  }
  return result;
}

(async () => {
  if (flag('--once')) {
    const r = await tick();
    process.stdout.write(JSON.stringify({ ok: r.ok, error: r.error || null, desks: r.desks == null ? null : r.desks, notes: (r.notes || []).length }) + '\n');
    process.exit(r.ok ? 0 : 1);
  }
  await tick();
  setInterval(tick, interval);
})();
