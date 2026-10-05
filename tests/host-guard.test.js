'use strict';

/**
 * host-guard.test.js — CTL-06: the DNS-rebinding guard.
 *
 * A website in the owner's own browser can point a name it controls at
 * 127.0.0.1; the bind address does not stop that, the Host header does. With
 * notes reaching every session, a page that could read the token and post a
 * note could instruct those sessions. Starts a real server on a spare port and
 * speaks raw HTTP so the Host header is exactly what we send.
 *
 * /api/state (the reader's raw output, with folder and transcript paths) also
 * answers on this computer only: a request that came through `tailscale serve`
 * carries Tailscale-User-Login, and is refused.
 */

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { start } = require('../src/server/server');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hostguard-'));
const PORT = 4391;
const h = start({ root: home, home, port: PORT, allowHosts: ['desk.example.ts.net'] });
after(() => { h.stop(); fs.rmSync(home, { recursive: true, force: true }); });

function get(host, p, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method: 'GET', headers: Object.assign({ Host: host }, headers) }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('CTL-06 a request whose Host is a foreign name gets 403 and no state (the rebinding case)', async () => {
  const r = await get(`evil.example.com:${PORT}`, '/api/state');
  assert.equal(r.status, 403);
  assert.ok(!r.body.includes(h.token), 'the token must not reach a foreign Host');
});

test('CTL-06 positive control: 127.0.0.1, localhost and the one allowed extra name are served', async () => {
  for (const host of [`127.0.0.1:${PORT}`, `localhost:${PORT}`, 'desk.example.ts.net']) {
    const r = await get(host, '/api/state');
    assert.equal(r.status, 200, `expected 200 for Host ${host}`);
  }
});

test('/api/state refuses a request that came over the tailnet, and leaks no token', async () => {
  const r = await get('desk.example.ts.net', '/api/state', { 'Tailscale-User-Login': 'alex@example.com' });
  assert.equal(r.status, 403);
  assert.ok(!r.body.includes(h.token), 'the token must not reach the tailnet through /api/state');
});
