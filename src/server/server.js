'use strict';

/**
 * server.js — the office reader, bound to 127.0.0.1 and nowhere else.
 *
 * Responsibilities, in order of how badly they matter:
 *   1. Emit a frame every heartbeat_ms even when nothing changed, so the client
 *      can tell "quiet" from "blind". Silence is the signal.
 *   2. Serve `read(root)` over SSE.
 *   3. Raise each alarm ONCE, across restarts.
 *   4. Accept control actions on localhost with a per-launch token, and audit
 *      every one of them.
 *
 * It never writes anything outside the office home (home.js).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { read, loadConfig } = require('./reader');
const S = require('./sources');
const { buildView } = require('./view');
const mesh = require('./mesh');
const Q = require('./questions');
const push = require('./push');
const nudge = require('./nudge');
const work = require('./work');
const config = require('./config');
const { homeDir, claudeHome } = require('./home');
const { rotateEvents } = require('./events-archive');

const TOKEN = crypto.randomBytes(24).toString('hex');

/**
 * Alarm de-duplication that survives a restart: a restart must not re-arm
 * everything and re-raise the night's history. De-dupe on persisted
 * (lane, condition, first_seen), and suppress anything whose first_seen
 * predates process start.
 */
class AlarmLog {
  constructor(file, startedAt) {
    this.file = file;
    this.startedAt = startedAt;
    this.seen = new Map();
    this.pagesByRun = new Map();
    this.capNoticeSent = new Set();
    try {
      for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        if (!line.trim()) continue;
        const o = JSON.parse(line);
        this.seen.set(o.key, o);
      }
    } catch (_) { /* first run */ }
  }

  key(a) { return `${a.lane}|${a.condition}|${a.since}`; }

  /** @returns {{fresh: boolean, paged: boolean, capped: boolean}} */
  consider(a, cfg, now) {
    const k = this.key(a);
    if (this.seen.has(k)) return { fresh: false, paged: false, capped: false };

    const rec = { key: k, lane: a.lane, condition: a.condition, since: a.since, first_seen: now, severity: a.severity };
    this.seen.set(k, rec);
    try {
      fs.appendFileSync(this.file, JSON.stringify(rec) + '\n', 'utf8');
    } catch (_) { /* the wall still works; the dedupe degrades to in-memory */ }

    // Anything whose first_seen predates process start is history, not news.
    if (a.since < this.startedAt) return { fresh: true, paged: false, capped: false };
    if (a.severity !== 'page') return { fresh: true, paged: false, capped: false };

    const run = a.run || a.lane || 'fleet';
    const n = (this.pagesByRun.get(run) || 0) + 1;
    this.pagesByRun.set(run, n);
    if (n > cfg.alarms.pages_per_run_per_night) {
      return { fresh: true, paged: false, capped: true, suppressed: n - cfg.alarms.pages_per_run_per_night, cap_at: now };
    }
    return { fresh: true, paged: true, capped: false };
  }
}

function auditControl(home, entry) {
  try {
    fs.appendFileSync(path.join(home, 'controls-audit.jsonl'), JSON.stringify(entry) + '\n', 'utf8');
    return true;
  } catch (_) { return false; }
}

function start(opts) {
  const o = opts || {};
  const home = o.home || homeDir();
  fs.mkdirSync(home, { recursive: true });

  const { cfg, path: cfgPath, mtime: cfgMtime } = loadConfig(o.configPath);
  const root = o.root || home;
  const startedAt = Date.now();
  const alarmLog = new AlarmLog(path.join(home, 'alarms.jsonl'), startedAt);
  const clients = new Set();
  let capNotice = null;
  const self = o.machine || require('./geography').thisMachine();
  // The group chat's thread lives on the hub (channel.js). --channel-hub makes a test office one.
  const channelHub = o.channelHub != null ? !!o.channelHub : self === config.hubMachine();
  const channel = require('./channel');
  // A post is private work if its session says so, or if this wall sees that session as private work.
  const clientOf = (sessions) => (p) => !!p.client_work
    || sessions.some((s) => s.id === (p.from && p.from.session_id) && s.client_work);

  // The Agents' wing (agents.js): each specialist's office, whether it runs here, its doors.
  const agents = o.agents || require('./agents').createAgents({ self, file: o.agentsFile, dirs: o.agentsDirs });
  agents.refresh(true);

  const distDir = o.distDir || path.join(__dirname, '..', '..', 'dist');
  const staticDir = fs.existsSync(distDir) ? distDir : null;

  function buildFrame() {
    let state;
    try {
      // The source overrides must travel with the read. Without this the server
      // accepted --root/live paths and then read a default layout underneath
      // them, so a live office reported zero desks while `office-read.js`
      // against the same machine reported seven. Pass them through.
      state = read(root, {
        config: { cfg, path: cfgPath, mtime: cfgMtime },
        lastFetch: o.lastFetch,
        officeHome: o.officeHome,
        projects: o.projects,
        commsPaths: o.commsPaths,
      });
    } catch (e) {
      // A reader that throws must still emit a frame saying so. A frame that
      // never arrives is indistinguishable from a dead process, and the client
      // will (correctly) go blind — but it deserves the reason if we have one.
      state = {
        asOf: Date.now(), config: cfg, reader_error: String(e && e.message),
        verdict: { word: 'UNKNOWN · 1 dark', count: 0, dark: ['reader'], fact: null },
        alarms: [], machines: [], runs: [], desks: [],
        sources: { read: 0, total: 1, no_fact: 1, oldest_fact_age_ms: null },
      };
    }
    state.server_started_at = startedAt;
    state.token = TOKEN;

    // Notes waiting for / delivered to each desk.
    try {
      const inbox = require('./inbox');
      for (const d of state.desks || []) {
        if (d.remote) {
          // A desk on another machine: its notes wait in the hub's outbox for
          // that machine, then in that machine's own inbox (mesh.js).
          d.inbox = require('./mesh').noteStatus(home, d);
          delete d.remote_inbox;
          continue;
        }
        d.inbox = inbox.status(home, d.id);
        // Can this session receive a note? Decided by EVIDENCE, not by path: a
        // desk the office knows from live hook events has the office's hooks
        // registered, delivery hook included. A desk known only from its
        // transcript file does not, and a note to it would sit unread forever.
        d.inbox.deliverable = !d.reconstructed;
        if (d.reconstructed) {
          d.inbox.reason = "it isn't running the office's hooks: only sessions started in the WorkSpace folder are, until the hooks are installed for every session (node bin/install.js hooks --apply)";
        }
      }
    } catch (_) { /* a missing inbox is "nothing waiting", not a failure */ }

    const decorated = [];
    for (const a of state.alarms || []) {
      const d = alarmLog.consider(a, cfg, state.asOf);
      if (d.capped) {
        capNotice = { at: d.cap_at, suppressed: d.suppressed };
      }
      decorated.push(Object.assign({}, a, { paged: d.paged, first_seen_now: d.fresh }));
      if (d.paged && o.onPage) {
        try { o.onPage(a); } catch (_) { /* paging must never take the wall down */ }
      }
    }
    state.alarms = decorated;
    if (capNotice) state.alarm_cap = capNotice;
    return state;
  }

  /* ---- the owner's view: sessions, helpers and flows, on every machine ----
   *
   * The reader already folds in the other machines' desks (mesh.js feeds). This
   * adds this machine's comms-bus traffic, the flows each spoke sent with its
   * feed, and the machine tabs, and shapes it all through view.js. */

  let commsDbs = { at: 0, list: [] };
  function flowsNow(now) {
    if (!o.commsZones && !o.commsPaths) return [];
    if (now - commsDbs.at > 60000) {
      commsDbs = { at: now, list: S.findCommsDbs(o.commsZones, o.commsPaths, 6 * 3600 * 1000, now) };
    }
    return S.readFlows(commsDbs.list, new Date(now - 45 * 60 * 1000).toISOString());
  }

  function fleetView(opts = {}) {
    let state;
    try {
      state = read(root, {
        config: { cfg, path: cfgPath, mtime: cfgMtime },
        officeHome: o.officeHome, projects: o.projects, commsPaths: o.commsPaths,
      });
    } catch (e) {
      return { asOf: Date.now(), machine: self, machines: [], sessions: [], flows: [], brand: config.brand(), token: TOKEN, error: String(e && e.message) };
    }
    const flows = flowsNow(state.asOf).map((f) => Object.assign({ machine: self }, f));
    for (const m of mesh.MACHINES) {
      if (m === self) continue;
      const feed = mesh.readFeed(home, m);
      const fresh = state.machines.find((x) => x.name === m);
      if (feed && fresh && fresh.feed && fresh.feed.status === 'OK') {
        for (const f of feed.flows || []) flows.push(Object.assign({}, f, { machine: m }));
      }
    }
    const v = buildView(state, { machine: self, home, flows });
    // Each live session's emblem and frame (avatars.js). On the hub this is the fleet-wide choice.
    try { require('./avatars').apply(home, v.sessions, state.asOf); } catch (_) { /* a wall without avatars still renders */ }
    // The group chat: take this machine's session posts, send every new message out, show the thread.
    v.channel_hub = channelHub;
    v.channel = [];
    if (channelHub) {
      try {
        channel.drainLocal(home, clientOf(v.sessions), state.asOf);
        const stale = new Set((state.desks || []).filter((d) => d.state === 'stale').map((d) => `${d.machine || self}:${d.id}`));
        channel.fanOut(home, v.sessions, stale, self, state.asOf);
        v.channel = channel.view(home, v.sessions, self);
      } catch (_) { /* the floor still renders */ }
    }
    v.machines = (state.machines || []).map((m) => {
      const own = v.sessions.filter((s) => s.machine === m.name);
      const feed = m.feed || {};
      return {
        name: m.name,
        self: m.name === self,
        connected: m.name === self || feed.status === 'OK',
        reason: m.name === self ? null
          : feed.status === 'OK' ? null
          : feed.status === 'STALE' ? `stopped reporting ${formatAge(state.asOf - feed.observed_at)} ago`
          : 'not linked yet',
        sessions: own.length,
        working: own.filter((s) => s.state === 'working').length,
      };
    });
    v.questions = openQuestionsEverywhere(v.sessions);
    if (opts.nudge) {
      // The opt-in idle nudge (nudge.js), on the heartbeat only. Never to a
      // session waiting on the owner or on a permission prompt.
      try {
        const sent = nudge.check(home, v.sessions, {
          now: state.asOf, cfg, machine: self,
          askingOwner: new Set(v.questions.filter((q) => q.machine === self).map((q) => q.session_id)),
          onPermission: new Set((state.alarms || []).filter((a) => a.condition === 'permission-undecided').map((a) => a.desk)),
        });
        for (const id of sent) {
          auditControl(home, { at: new Date().toISOString(), action: 'NUDGE', target: id, actor: 'office', result: 'QUEUED' });
        }
      } catch (_) { /* a nudge must never take the wall down */ }
    }
    v.brand = config.brand();
    v.token = TOKEN;
    return v;
  }

  /** Owner questions waiting on every machine, oldest first, named by the session that asked. */
  function openQuestionsEverywhere(sessions) {
    const nameOf = (machine, id) => {
      const s = sessions.find((x) => x.machine === machine && x.id === id);
      return s ? s.name : 'A session that has since gone quiet';
    };
    const out = Q.openQuestions(home).map((q) => Object.assign({ machine: self }, q));
    for (const m of mesh.MACHINES) {
      if (m === self) continue;
      const feed = mesh.readFeed(home, m);
      for (const q of (feed && feed.questions) || []) {
        if (!Q.remoteAnswered(home, m, q.id)) out.push(Object.assign({ machine: m }, q));
      }
    }
    return out
      .map((q) => ({
        id: q.id, machine: q.machine, session_id: q.session_id, session_name: nameOf(q.machine, q.session_id),
        asked_at: q.asked_at, question: q.question, recommendation: q.recommendation,
      }))
      .sort((a, b) => a.asked_at - b.asked_at);
  }

  function findOpenQuestion(machine, id) {
    if (machine === self) {
      const q = Q.read(home, id);
      return q && !q.answer ? q : null;
    }
    const feed = mesh.readFeed(home, machine);
    const q = feed && (feed.questions || []).find((x) => x.id === id);
    return q && !Q.remoteAnswered(home, machine, id) ? q : null;
  }

  function formatAge(ms) {
    const min = Math.round(ms / 60000);
    return min < 60 ? `${min} min` : `${Math.round(min / 60)} h`;
  }

  // A buzz on the owner's phone when a new question lands (push.js). An office
  // with no signed-up phone sends nothing; tests pass pushSend to catch it.
  const notifier = o.push === false ? null : push.createNotifier(home, { send: o.pushSend });

  // The sessions of the last frame sent, for the Agents' wing's desk counts.
  let lastSessions = null;
  const sessionsNow = () => lastSessions || fleetView().sessions || [];

  function broadcast() {
    const frame = fleetView({ nudge: true });
    lastSessions = frame.sessions || [];
    if (notifier) {
      try { notifier.check(frame.questions, frame.asOf); } catch (_) { /* a push must never take the wall down */ }
    }
    const payload = `data: ${JSON.stringify(frame)}\n\n`;
    for (const res of clients) {
      try { res.write(payload); } catch (_) { clients.delete(res); }
    }
  }

  // DNS-rebinding guard. Binding 127.0.0.1 stops other machines, not other
  // WEBSITES: a page in the owner's own browser can point a hostname it owns
  // at 127.0.0.1, and the browser then treats this server as that site - it
  // can read /api/state (which carries the note token) and post notes, which
  // are instructions to every Hub session. The Host header is the one thing
  // such a page cannot fake, so only names we chose are served. --allow-host
  // adds one (the Tailscale name, for the phone).
  const allowedHosts = new Set(['127.0.0.1', 'localhost'].concat(o.allowHosts || []).map((h) => h.toLowerCase()));
  const hostOk = (h) => {
    if (!h) return false;
    const name = String(h).toLowerCase().replace(/:\d+$/, '');
    return allowedHosts.has(name);
  };

  const server = http.createServer((req, res) => {
    if (!hostOk(req.headers.host)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('unknown host');
      return;
    }
    const url = new URL(req.url, 'http://127.0.0.1');

    if (url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      clients.add(res);
      res.write(`data: ${JSON.stringify(fleetView())}\n\n`);
      req.on('close', () => clients.delete(res));
      return;
    }

    // The Work page (work.js): projects and their steps, read from folders on
    // this machine. /api/work, /api/work/<project>, /api/step/<project>/<id>.
    const decode = (x) => { try { return decodeURIComponent(x); } catch (_) { return x; } };
    const workPath = /^\/api\/work(?:\/([^/]+))?\/?$/.exec(url.pathname);
    const stepPath = /^\/api\/step\/([^/]+)\/([^/]+)\/?$/.exec(url.pathname);
    if ((workPath || stepPath) && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      let v;
      try {
        if (stepPath) v = work.step(home, decode(stepPath[1]), decode(stepPath[2]), Date.now());
        else if (workPath[1]) v = work.project(home, decode(workPath[1]), Date.now());
        else v = work.list(home, Date.now());
      } catch (e) {
        v = { ok: false, asOf: Date.now(), error: String(e && e.message) };
      }
      res.end(JSON.stringify(v));
      return;
    }

    if (url.pathname === '/api/agents') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      let v;
      try { v = agents.view(sessionsNow(), Date.now()); } catch (e) { v = { agents: [], error: String(e && e.message) }; }
      res.end(JSON.stringify(v));
      return;
    }

    // An agent's own mark and figure (agents.js fileFor): an .svg or .png directly inside the folder of
    // the agent its agent.json names, nothing else. Sandboxed, so an svg opened on its own runs no script.
    const agentFile = /^\/agent-files\/([^/]+)\/([^/]+)$/.exec(url.pathname);
    if (agentFile && req.method === 'GET') {
      const f = agents.fileFor ? agents.fileFor(decode(agentFile[1]), decode(agentFile[2])) : null;
      if (!f) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': /\.svg$/i.test(f) ? 'image/svg+xml' : 'image/png',
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      });
      res.end(fs.readFileSync(f));
      return;
    }

    // Mark a step To do, Doing or Done from the page. Kept in the office home.
    if (url.pathname === '/api/work-mark' && req.method === 'POST') {
      if (req.headers['x-office-token'] !== TOKEN) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'bad or missing X-Office-Token' }));
        return;
      }
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 4 * 1024) req.destroy(); });
      req.on('end', () => {
        let p = {};
        try { p = JSON.parse(body || '{}'); } catch (_) { /* handled below */ }
        let result;
        try { result = work.mark(home, p.project, p.id, p.status); } catch (e) { result = { ok: false, error: String(e && e.message) }; }
        auditControl(home, { at: new Date().toISOString(), action: 'WORK_MARK', target: `${p.project}/${p.id}`, status: p.status, result: result.ok ? 'OK' : `REFUSED: ${result.error}` });
        res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      });
      return;
    }

    if (url.pathname === '/api/state') {
      // The reader's raw output carries folder and transcript paths. It is for checking the office
      // on this computer, so a request that came in over the tailnet (tailscale serve stamps the
      // sender) is refused. The page itself uses /events, which carries the clean view.
      if (req.headers['tailscale-user-login']) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: '/api/state answers on this computer only' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(buildFrame(), null, 2));
      return;
    }

    // The owner posts to the group chat: everyone, one run or one machine. Never rate-limited.
    if (url.pathname === '/api/channel' && req.method === 'POST') {
      if (req.headers['x-office-token'] !== TOKEN) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'bad or missing X-Office-Token' }));
        return;
      }
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 16 * 1024) req.destroy(); });
      req.on('end', () => {
        let parsed = {};
        try { parsed = JSON.parse(body || '{}'); } catch (_) { /* handled below */ }
        const result = channelHub
          ? channel.store(home, { from: { kind: 'owner' }, scope: parsed.scope, to: parsed.to, text: parsed.text }, false, Date.now())
          : { ok: false, error: 'The group chat lives on the hub office.' };
        delete result.message;
        auditControl(home, {
          at: new Date().toISOString(), action: 'CHANNEL_POST', scope: parsed.scope || 'all',
          chars: String(parsed.text || '').length, actor: 'owner@office', result: result.ok ? 'STORED' : `REFUSED: ${result.error}`,
        });
        res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        broadcast();
      });
      return;
    }

    if (url.pathname === '/api/message' && req.method === 'POST') {
      if (req.headers['x-office-token'] !== TOKEN) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'bad or missing X-Office-Token' }));
        auditControl(home, { at: new Date().toISOString(), action: 'MESSAGE_REJECTED', reason: 'bad token', ip: req.socket.remoteAddress });
        return;
      }
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 16 * 1024) req.destroy(); });
      req.on('end', () => {
        let parsed = {};
        try { parsed = JSON.parse(body || '{}'); } catch (_) { /* handled below */ }
        // A session on another machine gets its note through that machine's
        // next feed; a local one goes straight into the local inbox.
        const mesh = require('./mesh');
        const owner = mesh.ownerOf(home, parsed.session_id, self);
        const result = owner
          ? mesh.queueNote(home, owner, parsed.session_id, parsed.text, 'owner')
          : require('./inbox').enqueue(home, parsed.session_id, parsed.text, 'owner');
        if (owner && result.ok) {
          require('./inbox').recordSent(home, parsed.session_id, { id: result.id, queued_at: result.queued_at, text: String(parsed.text || '').trim() });
        }
        // The audit records THAT a note was sent and to whom, and its length -
        // not its text. The text lives only in the session's inbox until the
        // hook hands it over.
        auditControl(home, {
          at: new Date().toISOString(), action: 'MESSAGE', target: parsed.session_id,
          chars: String(parsed.text || '').length, actor: 'owner@office', via: owner || self,
          result: result.ok ? 'QUEUED' : `REFUSED: ${result.error}`,
        });
        res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        broadcast();
      });
      return;
    }

    // Keep awake, per desk (nudge.js): whether the office may nudge this
    // session when it sits idle with nothing armed. This machine's desks only.
    if (url.pathname === '/api/keep-awake' && req.method === 'POST') {
      if (req.headers['x-office-token'] !== TOKEN) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'bad or missing X-Office-Token' }));
        return;
      }
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 4 * 1024) req.destroy(); });
      req.on('end', () => {
        let parsed = {};
        try { parsed = JSON.parse(body || '{}'); } catch (_) { /* handled below */ }
        const result = mesh.ownerOf(home, parsed.session_id, self)
          ? { ok: false, error: 'that session is on another machine; its own office keeps it awake' }
          : nudge.setKeepAwake(home, parsed.session_id, parsed.on === true);
        auditControl(home, {
          at: new Date().toISOString(), action: 'KEEP_AWAKE', target: parsed.session_id, actor: 'owner@office',
          result: result.ok ? (result.keep_awake ? 'ON' : 'OFF') : `REFUSED: ${result.error}`,
        });
        res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        broadcast();
      });
      return;
    }

    // One office for three machines (mesh.js). A spoke POSTs its wall here and
    // gets back the notes waiting for it. This is the only route another
    // machine may write to, and it is reachable only the way the phone is:
    // through `tailscale serve`, which stamps Tailscale-User-Login on tailnet
    // requests and strips any copy a client tried to send. No identity header
    // means the request did not come through the tailnet proxy - refused.
    if (url.pathname === '/api/mesh/ingest' && req.method === 'POST') {
      const who = req.headers['tailscale-user-login'];
      if (!who) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'feeds are accepted from the tailnet only' }));
        auditControl(home, { at: new Date().toISOString(), action: 'MESH_REJECTED', reason: 'no tailnet identity', ip: req.socket.remoteAddress });
        return;
      }
      let body = '';
      let tooBig = false;
      req.on('data', (chunk) => { body += chunk; if (body.length > 512 * 1024) { tooBig = true; req.destroy(); } });
      req.on('end', () => {
        if (tooBig) return;
        let parsed = null;
        try { parsed = JSON.parse(body || '{}'); } catch (_) { /* handled below */ }
        let result;
        try {
          result = parsed
            ? require('./mesh').ingest(home, parsed, Date.now(), self)
            : { ok: false, status: 400, error: 'bad JSON' };
        } catch (e) {
          result = { ok: false, status: 500, error: String(e && e.message) };
        }
        if (!result.ok) {
          auditControl(home, { at: new Date().toISOString(), action: 'MESH_REJECTED', reason: result.error, actor: String(who).slice(0, 120) });
        } else {
          // The hub's avatar choices for this spoke's sessions, so its own wall agrees.
          try { result.avatars = require('./avatars').forMachine(home, String(parsed.machine).toUpperCase(), Date.now()); } catch (_) { /* optional */ }
          // Group chat: the spoke's session posts in, the recent thread out (for SessionStart context).
          if (channelHub) {
            try {
              const m = String(parsed.machine).toUpperCase();
              const feed = mesh.readFeed(home, m);
              const desks = (feed && feed.desks) || [];
              result.channel_acks = channel.acceptRemote(home, m, parsed.channel_posts,
                (p) => !!p.client_work || desks.some((d) => d.id === (p.from && p.from.session_id) && d.client_work), Date.now());
              result.channel_recent = channel.readLines(channel.file(home, 'channel.jsonl')).slice(-10);
            } catch (_) { /* optional */ }
          }
        }
        const status = result.status || (result.ok ? 200 : 400);
        delete result.status;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        if (result.ok) broadcast();
      });
      return;
    }

    // The owner answers a question: go with the recommendation, let the org
    // decide, or his own words. It reaches the session as a note, on whichever
    // machine it lives.
    if (url.pathname === '/api/answer' && req.method === 'POST') {
      if (req.headers['x-office-token'] !== TOKEN) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'bad or missing X-Office-Token' }));
        return;
      }
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 16 * 1024) req.destroy(); });
      req.on('end', () => {
        let p = {};
        try { p = JSON.parse(body || '{}'); } catch (_) { /* handled below */ }
        const reply = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
        const machine = String(p.machine || self).toUpperCase();
        const a = Q.vetAnswer(p.kind, p.text);
        if (!a.ok) { reply(400, a); return; }
        const q = findOpenQuestion(machine, String(p.id || ''));
        if (!q) { reply(404, { ok: false, error: 'That question is no longer open.' }); return; }

        const text = Q.answerText(q, a.answer);
        let result;
        if (machine === self) {
          Q.recordAnswer(home, q.id, a.answer);
          result = require('./inbox').enqueue(home, q.session_id, text, 'owner');
        } else {
          result = mesh.queueNote(home, machine, q.session_id, text, 'owner', { question_id: q.id, kind: a.answer.kind, text: a.answer.text });
          if (result.ok) {
            Q.markRemoteAnswered(home, machine, q.id);
            require('./inbox').recordSent(home, q.session_id, { id: result.id, queued_at: result.queued_at, text });
          }
        }
        auditControl(home, { at: new Date().toISOString(), action: 'ANSWER', target: `${machine}:${q.session_id}`, kind: a.answer.kind, result: result.ok ? 'QUEUED' : `REFUSED: ${result.error}` });
        reply(result.ok ? 200 : 400, result.ok ? { ok: true } : result);
        broadcast();
      });
      return;
    }

    // Phone notifications (push.js). The public key is public; signing a
    // device up or off, or asking for a test buzz, takes the page token.
    if (url.pathname === '/api/push/key') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ publicKey: push.vapidKeys(home).publicKey }));
      return;
    }
    if (/^\/api\/push\/(subscribe|unsubscribe|test)$/.test(url.pathname) && req.method === 'POST') {
      const reply = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (req.headers['x-office-token'] !== TOKEN) { reply(403, { ok: false, error: 'bad or missing X-Office-Token' }); return; }
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 8 * 1024) req.destroy(); });
      req.on('end', () => {
        let p = {};
        try { p = JSON.parse(body || '{}'); } catch (_) { /* handled below */ }
        const action = url.pathname.slice('/api/push/'.length);
        if (action === 'unsubscribe') {
          const r = push.unsubscribe(home, String(p.endpoint || ''));
          auditControl(home, { at: new Date().toISOString(), action: 'PUSH_OFF', removed: r.removed });
          reply(200, r);
          return;
        }
        if (action === 'subscribe') {
          const r = push.subscribe(home, p.subscription);
          auditControl(home, { at: new Date().toISOString(), action: 'PUSH_ON', result: r.ok ? 'OK' : `REFUSED: ${r.error}` });
          reply(r.ok ? 200 : 400, r.ok ? { ok: true } : r);
          return;
        }
        // A test buzz, to this one device only, so the owner sees it work.
        const endpoint = String(p.endpoint || '');
        if (!push.subscriptions(home).some((s) => s.endpoint === endpoint)) { reply(404, { ok: false, error: 'This device is not signed up.' }); return; }
        // A brand-new sign-up is sometimes not live at the push service for a
        // moment, so try again briefly before calling it a failure.
        const message = { title: config.brand().name, body: "You're set. This is how a new question will reach you.", tag: push.TAG, url: '/?questions' };
        const delays = o.pushRetryMs || [0, 2000, 4000, 6000, 8000];
        (async () => {
          for (const wait of delays) {
            if (wait) await new Promise((r) => setTimeout(r, wait));
            const r = await push.sendAll(home, message, { endpoint, kind: 'test', send: o.pushSend });
            if (r.delivered) return true;
          }
          return false;
        })()
          .then((ok) => reply(ok ? 200 : 502, ok ? { ok: true } : { ok: false, error: 'The push service did not accept it.' }))
          .catch(() => reply(502, { ok: false, error: 'Could not reach the push service.' }));
      });
      return;
    }

    if (url.pathname === '/api/control' && req.method === 'POST') {
      if (req.headers['x-office-token'] !== TOKEN) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'bad or missing X-Office-Token' }));
        auditControl(home, { at: new Date().toISOString(), action: 'REJECTED', reason: 'bad token', ip: req.socket.remoteAddress });
        return;
      }
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 64 * 1024) req.destroy(); });
      req.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(body || '{}'); } catch (_) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'bad JSON' }));
          return;
        }
        const entry = {
          at: new Date().toISOString(), action: parsed.action, target: parsed.target,
          lane: parsed.lane, channel: parsed.channel, actor: 'owner@office', ip: req.socket.remoteAddress,
        };
        let result;
        try {
          result = o.onControl ? o.onControl(parsed) : { ok: false, error: 'no control handler wired' };
        } catch (e) {
          result = { ok: false, error: String(e && e.message) };
        }
        entry.result = result.ok ? 'OK' : `FAILED: ${result.error}`;
        auditControl(home, entry);
        res.writeHead(result.ok ? 200 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        broadcast();
      });
      return;
    }

    // The Home Screen manifest carries this office's own name (workspace.config.json).
    if (url.pathname === '/manifest.webmanifest') {
      const b = config.brand();
      let m = {};
      try { m = JSON.parse(fs.readFileSync(path.join(staticDir || distDir, 'manifest.webmanifest'), 'utf8')); } catch (_) { /* the defaults below */ }
      Object.assign(m, { name: b.company ? `${b.name} · ${b.company}` : b.name, short_name: b.name.slice(0, 12) });
      res.writeHead(200, { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store, max-age=0' });
      res.end(JSON.stringify(m, null, 2));
      return;
    }

    // Your own logo (workspace.config.json brand.logo), when you have set one.
    // Otherwise the tab icon is the WorkSpace orb in dist/.
    const logo = config.load().brand.logo;
    if (logo && (url.pathname === '/brand-logo' || url.pathname === '/favicon.ico' || url.pathname === '/favicon.svg')) {
      res.writeHead(200, { 'Content-Type': /\.svg$/i.test(logo) ? 'image/svg+xml' : 'image/png', 'Cache-Control': 'no-store, max-age=0' });
      res.end(fs.readFileSync(logo));
      return;
    }

    if (staticDir) {
      // A browser asks for /favicon.ico whatever the page links: it gets the orb.
      const rel = url.pathname === '/' ? 'index.html'
        : url.pathname === '/favicon.ico' ? 'favicon.svg'
          : url.pathname.replace(/^\/+/, '');
      const f = path.join(staticDir, rel);
      if (f.startsWith(staticDir) && fs.existsSync(f) && fs.statSync(f).isFile()) {
        const types = {
          '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
          '.png': 'image/png', '.webmanifest': 'application/manifest+json',
        };
        res.writeHead(200, {
          'Content-Type': types[path.extname(f)] || 'application/octet-stream',
          // A local wall served from disk must never be cached: a rebuilt
          // bundle that the browser refuses to fetch means you are looking at
          // an old screen and cannot tell.
          'Cache-Control': 'no-store, max-age=0',
        });
        res.end(fs.readFileSync(f));
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });

  const port = o.port || 4316;
  // 127.0.0.1 explicitly. Never 0.0.0.0, never a LAN interface. Other devices
  // reach it only through `tailscale serve` (guides/02-tailscale.md).
  server.listen(port, '127.0.0.1');

  const timer = setInterval(broadcast, cfg.poll.heartbeat_ms);
  timer.unref && timer.unref();

  // Proof of life, for office-start.js to report when this process is gone.
  const aliveFile = path.join(home, 'office.alive');
  const stamp = () => {
    try {
      fs.writeFileSync(aliveFile, JSON.stringify({
        pid: process.pid, port, started_at: new Date(startedAt).toISOString(), alive_at: new Date().toISOString(),
      }), 'utf8');
    } catch (_) { /* a missed stamp only blurs the time of death */ }
  };
  stamp();
  const aliveTimer = setInterval(stamp, 30000);
  aliveTimer.unref && aliveTimer.unref();

  // Keep the hook stream from growing forever (events-archive.js).
  const rotateTimer = setInterval(() => rotateEvents(home), 3600000);
  rotateTimer.unref && rotateTimer.unref();
  setTimeout(() => rotateEvents(home), 60000).unref();

  return {
    server, port, token: TOKEN, home, root,
    url: `http://127.0.0.1:${port}/`,
    stop() { clearInterval(timer); clearInterval(aliveTimer); clearInterval(rotateTimer); for (const c of clients) { try { c.end(); } catch (_) {} } server.close(); },
    buildFrame,
  };
}

module.exports = { start, AlarmLog, homeDir };

if (require.main === module) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };

  // LIVE IS THE DEFAULT: with no arguments it watches this machine. --root
  // points it at a fixture directory instead (tests).
  const root = arg('--root', undefined);
  const live = !root;
  const home = arg('--home', homeDir());

  const opts = { root: root || home, home, port: Number(arg('--port', config.officePort())) };
  if (args.includes('--channel-hub')) opts.channelHub = true;
  const extraHost = arg('--allow-host', undefined);
  if (extraHost) opts.allowHosts = extraHost.split(',').map((s) => s.trim()).filter(Boolean);
  if (live) {
    opts.officeHome = home;
    opts.projects = path.join(claudeHome(), 'projects');
    // The user-level comms bus, plus one per repo: one folder level under each
    // code root (workspace.config.json code_roots), where the org keeps its bus.
    opts.commsPaths = [path.join(claudeHome(), 'comms.db')];
    opts.commsZones = config.codeRoots().filter((z) => fs.existsSync(z));
  }

  const h = start(opts);
  process.stdout.write(`${config.brand().name} office listening on ${h.url}\n`);
  process.stdout.write(live ? 'watching: this machine (live)\n' : `watching: ${root}\n`);
  process.stdout.write(`token: ${h.token}\n`);
}
