'use strict';

/**
 * push.js — a buzz on the owner's phone when a session asks them something.
 *
 * No constant pings: when a session asks a question, the owner is notified
 * and can open the office on their phone to answer before it goes stale.
 *
 * So: one push per new question, never for anything else, and never more than
 * one every MIN_GAP_MS - questions that arrive inside the gap ride together in
 * the next one ("3 questions waiting"). Nothing re-pings: a question is pushed
 * once, across restarts. Questions that were already waiting before anyone
 * subscribed are not news and are not pushed.
 *
 * Standard Web Push (RFC 8030 / 8291 / 8292) on Node's own crypto - no
 * dependency, like the rest of the server. The payload is encrypted to the
 * phone, so the push service (Apple, Google, Mozilla) carries only ciphertext.
 *
 * Storage under <office home>/push/: the VAPID key pair, the subscriptions,
 * which questions have been pushed, and a log that records THAT a push went and
 * how it fared - never its text.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const MIN_GAP_MS = 2 * 60 * 1000;
// How long the push service holds a push for a phone that is off. A question
// older than this is better found on the page than buzzed about.
const TTL_S = 4 * 3600;
const SEEN_KEEP_MS = 14 * 24 * 3600 * 1000;
const MAX_SUBS = 20;
// A push service can answer "no such device" for a subscription made seconds
// ago (measured on FCM: one fresh sign-up in two). Only a
// subscription older than this is dropped for it.
const SETTLE_MS = 10 * 60 * 1000;
// The VAPID contact the push services see: where this software comes from.
const SUBJECT = 'https://github.com/wilson-works/workspace';
const TAG = 'workspace-questions';

// Only the browser push services. A subscription is a URL the server will POST
// to, so it is never allowed to name anything else.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/,
  /^web\.push\.apple\.com$/, /(^|\.)push\.apple\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s || ''), 'base64url');

function dir(home) { return path.join(home, 'push'); }

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}

function writeAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function log(home, entry) {
  try {
    fs.mkdirSync(dir(home), { recursive: true });
    fs.appendFileSync(path.join(dir(home), 'push.log'), JSON.stringify(Object.assign({ at: new Date().toISOString() }, entry)) + '\n', 'utf8');
  } catch (_) { /* a missed log line never stops a push */ }
}

/* -------------------------------------------------------------- VAPID keys */

/** This office's VAPID key pair, made once and kept. */
function vapidKeys(home) {
  const file = path.join(dir(home), 'vapid.json');
  const have = readJson(file, null);
  if (have && have.publicKey && have.privateJwk) return have;
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const keys = { publicKey: b64u(Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)])), privateJwk: jwk };
  writeAtomic(file, keys);
  return keys;
}

/** RFC 8292: `vapid t=<ES256 JWT>, k=<public key>`, scoped to the push service's origin. */
function vapidHeader(endpoint, keys, now) {
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({
    aud: new URL(endpoint).origin, exp: Math.floor((now || Date.now()) / 1000) + 12 * 3600, sub: SUBJECT,
  }));
  const key = crypto.createPrivateKey({ key: keys.privateJwk, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${keys.publicKey}`;
}

/* ------------------------------------------------------ payload encryption */

/**
 * RFC 8291 aes128gcm, one record. `fixed` pins the sender key and salt - the
 * test uses it to reproduce the RFC's own worked example byte for byte.
 */
function encrypt(sub, payload, fixed) {
  const uaPublic = fromB64u(sub.keys.p256dh);
  const authSecret = fromB64u(sub.keys.auth);
  const ecdh = crypto.createECDH('prime256v1');
  if (fixed && fixed.asPrivate) ecdh.setPrivateKey(fromB64u(fixed.asPrivate));
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = fixed && fixed.salt ? fromB64u(fixed.salt) : crypto.randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

/* ------------------------------------------------------------ subscriptions */

function subsFile(home) { return path.join(dir(home), 'subscriptions.json'); }
function subscriptions(home) { return readJson(subsFile(home), []); }

/** Returns {ok, subscription} or {ok:false, error}. */
function vetSubscription(s) {
  if (!s || typeof s !== 'object') return { ok: false, error: 'no subscription' };
  let url;
  try { url = new URL(String(s.endpoint || '')); } catch (_) { return { ok: false, error: 'bad endpoint' }; }
  if (url.protocol !== 'https:' || !PUSH_HOSTS.some((re) => re.test(url.hostname))) {
    return { ok: false, error: 'that is not a browser push service' };
  }
  const keys = s.keys || {};
  const p256dh = fromB64u(keys.p256dh);
  const auth = fromB64u(keys.auth);
  if (p256dh.length !== 65 || p256dh[0] !== 4 || auth.length !== 16) return { ok: false, error: 'bad subscription keys' };
  return { ok: true, subscription: { endpoint: url.href, keys: { p256dh: b64u(p256dh), auth: b64u(auth) } } };
}

function subscribe(home, raw, now) {
  const v = vetSubscription(raw);
  if (!v.ok) return v;
  const list = subscriptions(home).filter((x) => x.endpoint !== v.subscription.endpoint);
  if (list.length >= MAX_SUBS) return { ok: false, error: `already ${MAX_SUBS} devices - turn one off first` };
  list.push(Object.assign({ added_at: now == null ? Date.now() : now }, v.subscription));
  writeAtomic(subsFile(home), list);
  return { ok: true, subscription: v.subscription };
}

function unsubscribe(home, endpoint) {
  const list = subscriptions(home);
  const kept = list.filter((x) => x.endpoint !== endpoint);
  if (kept.length !== list.length) writeAtomic(subsFile(home), kept);
  return { ok: true, removed: list.length - kept.length };
}

/* ------------------------------------------------------------------ sending */

/** POST one push. Resolves {status} (0 = never reached the service); never rejects. */
function sendOne(home, sub, message, now) {
  return new Promise((resolve) => {
    let body;
    let auth;
    try {
      body = encrypt(sub, JSON.stringify(message));
      auth = vapidHeader(sub.endpoint, vapidKeys(home), now);
    } catch (e) { resolve({ status: 0, error: String(e && e.message) }); return; }
    const req = https.request(sub.endpoint, {
      method: 'POST',
      timeout: 15000,
      headers: {
        TTL: String(TTL_S), Urgency: 'high', Topic: TAG.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32),
        'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
        'Content-Length': body.length, Authorization: auth,
      },
    }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', (e) => resolve({ status: 0, error: String(e && e.message) }));
    req.end(body);
  });
}

/**
 * Push `message` to every subscription (or one endpoint). A settled
 * subscription the service says is gone (404/410) is dropped - that is the
 * phone having turned notifications off or uninstalled the office.
 */
async function sendAll(home, message, opts) {
  const o = opts || {};
  const send = o.send || sendOne;
  const now = o.now || Date.now();
  let subs = subscriptions(home);
  if (o.endpoint) subs = subs.filter((s) => s.endpoint === o.endpoint);
  const results = await Promise.all(subs.map((s) => send(home, s, message, now).then((r) => ({ s, r }))));
  const gone = results
    .filter(({ s, r }) => (r.status === 404 || r.status === 410) && now - (s.added_at || 0) > SETTLE_MS)
    .map(({ s }) => s.endpoint);
  for (const e of gone) unsubscribe(home, e);
  const delivered = results.filter(({ r }) => r.status >= 200 && r.status < 300).length;
  log(home, {
    kind: o.kind || 'questions', devices: subs.length, delivered, dropped: gone.length,
    failed: results.filter(({ s, r }) => !(r.status >= 200 && r.status < 300) && !gone.includes(s.endpoint))
      .map(({ s, r }) => `${new URL(s.endpoint).hostname}: ${r.status || r.error}`),
  });
  return { devices: subs.length, delivered, dropped: gone.length };
}

/* ------------------------------------------------ deciding when to buzz */

function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

/** What the phone shows for a batch of new questions. `open` is everything still waiting. */
function messageFor(fresh, open) {
  const first = fresh[0];
  // The office names a session it can no longer see "A session that has since
  // gone quiet" - true on the page, clumsy as a headline.
  const name = /^A session that/.test(first.session_name || '') ? '' : clip(first.session_name, 40);
  const title = fresh.length > 1 ? `${fresh.length} new questions for you` : name ? `Question from ${name}` : 'New question for you';
  let body = clip(first.question, 160);
  if (fresh.length > 1) body += `  (+${fresh.length - 1} more)`;
  else if (open > 1) body += `  (${open} waiting)`;
  return { title, body, tag: TAG, url: '/?questions', count: open };
}

const keyOf = (q) => `${q.machine}:${q.id}`;

/**
 * One call per frame with the questions open everywhere. Pushes what is new,
 * at most once per MIN_GAP_MS; state survives a restart so nothing re-pings.
 */
function createNotifier(home, opts) {
  const o = opts || {};
  const gap = o.minGapMs == null ? MIN_GAP_MS : o.minGapMs;
  const stateFile = path.join(dir(home), 'pushed.json');
  const saved = readJson(stateFile, null);
  const state = saved || { seen: {}, last_sent_at: 0 };
  let seeded = !!saved;
  let inFlight = false;

  const save = () => { try { writeAtomic(stateFile, state); } catch (_) { /* degrades to in-memory */ } };

  function check(questions, now) {
    const t = now || Date.now();
    const open = questions || [];
    // The first time this office ever runs with push, whatever is already
    // waiting is history. Mark it seen without a buzz.
    if (!seeded) {
      for (const q of open) state.seen[keyOf(q)] = t;
      seeded = true;
      save();
      return null;
    }
    const fresh = open.filter((q) => !state.seen[keyOf(q)]);
    if (!fresh.length || inFlight) return null;
    // No phone signed up: nothing to send, and these are not news to a phone
    // that signs up later.
    if (!subscriptions(home).length) {
      for (const q of fresh) state.seen[keyOf(q)] = t;
      save();
      return null;
    }
    if (t - (state.last_sent_at || 0) < gap) return null;

    for (const q of fresh) state.seen[keyOf(q)] = t;
    const openKeys = new Set(open.map(keyOf));
    for (const [k, at] of Object.entries(state.seen)) {
      if (!openKeys.has(k) && t - at > SEEN_KEEP_MS) delete state.seen[k];
    }
    state.last_sent_at = t;
    save();
    const message = messageFor(fresh, open.length);
    inFlight = true;
    const done = sendAll(home, message, { send: o.send, now: t })
      .catch(() => null)
      .finally(() => { inFlight = false; });
    return { message, done };
  }

  return { check };
}

module.exports = {
  vapidKeys, vapidHeader, encrypt, vetSubscription, subscribe, unsubscribe, subscriptions,
  sendOne, sendAll, messageFor, createNotifier, MIN_GAP_MS, TAG,
};
