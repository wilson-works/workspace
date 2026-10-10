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
 *
 * Nor does the token reach office.log: started without a terminal (at login,
 * office-start.js sends the office's output to that log), the office prints
 * that the token is hidden. That one runs server.js itself, on port 4401.
 */

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
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

test('the page token never reaches office.log: started without a terminal, the office says it is hidden', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tokenlog-'));
  const server = path.join(__dirname, '..', 'src', 'server', 'server.js');
  const child = spawn(process.execPath, [server, '--port', '4401', '--home', dir, '--root', dir], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  try {
    const out = await new Promise((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => reject(new Error(`no token line in 15 s: ${text}`)), 15000);
      child.stdout.on('data', (d) => {
        text += d;
        if (/^token: .*\n/m.test(text)) { clearTimeout(timer); resolve(text); }
      });
      child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`the office exited (${code}): ${text}`)); });
    });
    assert.match(out, /^token: \(hidden; the office page has it\)\r?$/m);
    assert.doesNotMatch(out, /[0-9a-f]{48}/, 'no token in what goes to the log');
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const gone = new Promise((r) => child.once('exit', r));
      child.kill();
      await gone;
    }
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
});
