'use strict';

/**
 * push.test.js — the buzz on the owner's phone: notified when a question
 * comes in, but no constant pings.
 *
 * The encryption is checked against RFC 8291's own worked example, byte for
 * byte - a push service rejects anything else silently, so "it round-trips
 * with itself" would prove nothing. The rest is the promise: one buzz per new
 * question, batched, never repeated, never to anything but a push service.
 *
 * WORKSPACE_CONFIG points at a file that does not exist, so the office runs on
 * its defaults (named WorkSpace) whatever this computer's own settings say.
 */

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

process.env.WORKSPACE_CONFIG = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'push-cfg-')), 'workspace.config.json');

const P = require('../src/server/push');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'push-'));

// RFC 8291 Appendix A.
const RFC = {
  sub: {
    endpoint: 'https://push.example.net/push/JzLQ3raZJfFBR0aqvOMsLrt54w4rJUsV',
    keys: { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
  },
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  plaintext: 'When I grow up, I want to be a watermelon',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

// A real-shaped subscription on a real push host, with keys a phone would send.
function phone(host) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint: `https://${host || 'fcm.googleapis.com'}/fcm/send/${crypto.randomBytes(8).toString('hex')}`,
    keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') },
  };
}

const q = (id, machine, text) => ({ id, machine: machine || 'DESK', session_name: 'Event quotes', question: text || `Question ${id} for the owner?`, recommendation: 'Yes.' });

test('2026-09-23 the payload encryption reproduces RFC 8291 Appendix A byte for byte', () => {
  const out = P.encrypt(RFC.sub, RFC.plaintext, { asPrivate: RFC.asPrivate, salt: RFC.salt });
  assert.equal(out.toString('base64url'), RFC.body);
});

test('2026-09-23 the VAPID header is an ES256 JWT for the push service origin, signed by the key it names', () => {
  const home = tmp();
  const keys = P.vapidKeys(home);
  assert.deepEqual(P.vapidKeys(home), keys, 'the key pair is made once and kept');
  const hdr = P.vapidHeader('https://web.push.apple.com/QGuQyavXutnMY2', keys, Date.UTC(2026, 8, 23));
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(\S+)$/.exec(hdr);
  assert.ok(m, hdr);
  const claims = JSON.parse(Buffer.from(m[2], 'base64url'));
  assert.equal(claims.aud, 'https://web.push.apple.com');
  assert.equal(claims.sub, 'https://github.com/wilson-works/workspace', 'the contact the push services see is where this software comes from');
  assert.equal(m[4], keys.publicKey);
  const raw = Buffer.from(keys.publicKey, 'base64url');
  const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') }, format: 'jwk' });
  assert.ok(crypto.verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(m[3], 'base64url')));
});

test('2026-09-23 a subscription may only name a browser push service', () => {
  for (const host of ['fcm.googleapis.com', 'web.push.apple.com', 'updates.push.services.mozilla.com', 'wns2-by3p.notify.windows.com']) {
    assert.ok(P.vetSubscription(phone(host)).ok, host);
  }
  const bad = [
    phone('127.0.0.1'), phone('evil.example.com'), phone('fcm.googleapis.com.evil.example'),
    Object.assign(phone(), { endpoint: 'http://fcm.googleapis.com/fcm/send/x' }),
    Object.assign(phone(), { keys: { p256dh: 'AAAA', auth: 'BBBB' } }),
    null, {},
  ];
  for (const s of bad) assert.equal(P.vetSubscription(s).ok, false, JSON.stringify(s));
});

function stubSend(calls, status) {
  return (home, sub, message) => { calls.push({ endpoint: sub.endpoint, message }); return Promise.resolve({ status: status || 201 }); };
}

test('2026-09-23 one buzz per new question: history is quiet, nothing repeats, a restart does not re-ping', async () => {
  const home = tmp();
  const calls = [];
  let n = P.createNotifier(home, { send: stubSend(calls), minGapMs: 0 });
  // First ever run: what is already waiting is history.
  assert.equal(n.check([q('qold0001')], 1000), null);
  // Nobody signed up: a new question is marked seen, not saved up for later.
  assert.equal(n.check([q('qold0001'), q('qnosub01')], 2000), null);
  P.subscribe(home, phone());
  assert.equal(n.check([q('qold0001'), q('qnosub01')], 3000), null, 'signing up must not dump the backlog');

  const r = n.check([q('qold0001'), q('qnosub01'), q('qnew0001', 'MINI', 'Can we raise the event price?')], 4000);
  assert.ok(r);
  await r.done;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].message.title, 'Question from Event quotes');
  assert.match(calls[0].message.body, /^Can we raise the event price\?/);
  assert.match(calls[0].message.body, /3 waiting/);
  assert.equal(calls[0].message.url, '/?questions');
  assert.equal(calls[0].message.tag, 'workspace-questions');
  assert.equal(P.TAG, 'workspace-questions');

  assert.equal(n.check([q('qnew0001', 'MINI')], 5000), null, 'the same question never buzzes twice');
  n = P.createNotifier(home, { send: stubSend(calls), minGapMs: 0 });
  assert.equal(n.check([q('qnew0001', 'MINI')], 6000), null, 'nor after a restart');
  assert.equal(calls.length, 1);
});

test('2026-09-23 questions inside the gap wait and go together in one buzz', async () => {
  const home = tmp();
  const calls = [];
  const n = P.createNotifier(home, { send: stubSend(calls), minGapMs: 120000 });
  n.check([], 0);
  P.subscribe(home, phone());
  await n.check([q('qa000001')], 200000).done;
  assert.equal(n.check([q('qa000001'), q('qb000001')], 230000), null, 'inside the gap: held');
  assert.equal(n.check([q('qa000001'), q('qb000001'), q('qc000001')], 260000), null);
  const r = n.check([q('qa000001'), q('qb000001'), q('qc000001')], 321000);
  await r.done;
  assert.equal(calls.length, 2);
  assert.equal(calls[1].message.title, '2 new questions for you');
  assert.match(calls[1].message.body, /\(\+1 more\)$/);
});

test('2026-09-23 a session the office can no longer see still gets a clean headline', () => {
  const gone = Object.assign(q('qgone001'), { session_name: 'A session that has since gone quiet' });
  assert.equal(P.messageFor([gone], 1).title, 'New question for you');
  const long = Object.assign(q('qlong001'), { session_name: 'x'.repeat(80) });
  assert.ok(P.messageFor([long], 1).title.length <= 'Question from '.length + 40);
});

test('2026-09-23 a device the push service says is gone is dropped; one that failed is kept', async () => {
  const home = tmp();
  const gone = phone();
  const flaky = phone('web.push.apple.com');
  P.subscribe(home, gone, 0);
  P.subscribe(home, flaky, 0);
  const r = await P.sendAll(home, { title: 't', body: 'b' }, {
    now: 3600000,
    send: (h, sub) => Promise.resolve({ status: sub.endpoint === gone.endpoint ? 410 : 503 }),
  });
  assert.deepEqual(r, { devices: 2, delivered: 0, dropped: 1 });
  assert.deepEqual(P.subscriptions(home).map((s) => s.endpoint), [flaky.endpoint]);
  const logged = fs.readFileSync(path.join(home, 'push', 'push.log'), 'utf8');
  assert.ok(!logged.includes('"b"') && !logged.includes(flaky.endpoint), 'the log says how it went, not what it said or where exactly');
});

test('2026-09-23 a sign-up seconds old is not dropped for "no such device" (FCM does that while it settles)', async () => {
  const home = tmp();
  const fresh = phone();
  P.subscribe(home, fresh, 1000);
  const r = await P.sendAll(home, { title: 't', body: 'b' }, { now: 5000, send: () => Promise.resolve({ status: 404 }) });
  assert.deepEqual(r, { devices: 1, delivered: 0, dropped: 0 });
  assert.equal(P.subscriptions(home).length, 1);
});

/* ---------------------------------------------------------------- the routes */

const { start } = require('../src/server/server');
const home = tmp();
const PORT = 4393;
const sent = [];
let settling = 0;
// The first send to a device named "settling" answers 404, as a fresh FCM sign-up sometimes does.
const routeSend = (h2, sub, message) => {
  if (sub.endpoint.includes('settling') && settling++ === 0) return Promise.resolve({ status: 404 });
  return stubSend(sent)(h2, sub, message);
};
const h = start({ root: home, home, port: PORT, pushSend: routeSend, pushRetryMs: [0, 10, 10] });
after(() => { h.stop(); fs.rmSync(home, { recursive: true, force: true }); });

function call(method, p, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const req = http.request({
      host: '127.0.0.1', port: PORT, path: p, method,
      headers: Object.assign({ Host: `127.0.0.1:${PORT}`, 'Content-Type': 'application/json' }, token ? { 'X-Office-Token': token } : {}),
    }, (res) => {
      let b = '';
      res.on('data', (d) => { b += d; });
      res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (_) { /* not json */ } resolve({ status: res.statusCode, body: j, raw: b, type: res.headers['content-type'] }); });
    });
    req.on('error', reject);
    req.end(data);
  });
}

test('2026-09-23 the page signs a device up with its token, gets a test buzz, and can turn it off', async () => {
  const key = await call('GET', '/api/push/key');
  assert.equal(Buffer.from(key.body.publicKey, 'base64url').length, 65);

  const dev = phone();
  assert.equal((await call('POST', '/api/push/subscribe', { subscription: dev })).status, 403, 'no token, no sign-up');
  assert.equal((await call('POST', '/api/push/subscribe', { subscription: phone('evil.example.com') }, h.token)).status, 400);
  assert.equal((await call('POST', '/api/push/subscribe', { subscription: dev }, h.token)).status, 200);
  assert.equal(P.subscriptions(home).length, 1);

  const t = await call('POST', '/api/push/test', { endpoint: dev.endpoint }, h.token);
  assert.equal(t.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].endpoint, dev.endpoint);
  assert.equal(sent[0].message.title, 'WorkSpace', 'the test buzz carries the office name');
  assert.equal(sent[0].message.tag, P.TAG);
  assert.equal((await call('POST', '/api/push/test', { endpoint: phone().endpoint }, h.token)).status, 404, 'a test goes only to a signed-up device');

  assert.equal((await call('POST', '/api/push/unsubscribe', { endpoint: dev.endpoint }, h.token)).status, 200);
  assert.equal(P.subscriptions(home).length, 0);
});

test('2026-09-23 the test buzz tries again when a brand-new sign-up is not live yet, and keeps the device', async () => {
  const dev = Object.assign(phone(), {});
  dev.endpoint = dev.endpoint.replace('/fcm/send/', '/fcm/send/settling');
  assert.equal((await call('POST', '/api/push/subscribe', { subscription: dev }, h.token)).status, 200);
  const before = sent.length;
  const t = await call('POST', '/api/push/test', { endpoint: dev.endpoint }, h.token);
  assert.equal(t.status, 200, JSON.stringify(t.body));
  assert.equal(sent.length, before + 1);
  assert.ok(P.subscriptions(home).some((s) => s.endpoint === dev.endpoint));
});

test('2026-09-23 the service worker, manifest and icons are served for the phone', async () => {
  for (const [p, type] of [['/sw.js', 'text/javascript'], ['/manifest.webmanifest', 'application/manifest+json'], ['/icon-192.png', 'image/png']]) {
    const r = await call('GET', p);
    assert.equal(r.status, 200, p);
    assert.equal(r.type, type, p);
  }
  const html = await call('GET', '/');
  assert.match(html.raw, /rel="manifest"/);
});
