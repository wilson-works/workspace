'use strict';

/**
 * tony-dashboard.test.js: Tony's page (agents/packages/tony/dashboard/server.js), its /pack/ route for a firm's look.
 * John's check on PR #19: started on a spare port from a scratch Hub with a scratch Workspace settings file, /pack/
 * is 404 for a bad % escape and for "..", 200 for a real file in the pack, 404 with no brand; /health 200 after.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const SRC = path.join(__dirname, '..', 'agents', 'packages', 'tony');
const hub = fs.mkdtempSync(path.join(os.tmpdir(), 'tony-page-'));
const tony = path.join(hub, '50-AI', 'agents', 'tony');
const settings = path.join(hub, '50-AI', 'workspace', 'workspace.config.json');
const pack = path.join(hub, 'pack');
let PORT = 0;   // a free port the system gives, so an earlier run still letting go of its port never collides
let proc = null;

fs.cpSync(SRC, tony, { recursive: true });
fs.mkdirSync(path.join(pack, 'tokens'), { recursive: true });
fs.writeFileSync(path.join(pack, 'tokens', 'colors.css'), ':root{--red-600:#D40032}');
fs.mkdirSync(path.dirname(settings), { recursive: true });
const brand = (on) => fs.writeFileSync(settings, JSON.stringify({ brand: on ? { look: 'academy', pack, stylesheets: ['tokens/colors.css'] } : {} }));
brand(true);
fs.writeFileSync(path.join(hub, 'outside.css'), 'body{}');

before(async () => {
  PORT = await new Promise((resolve) => { const s = require('net').createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  const m = JSON.parse(fs.readFileSync(path.join(tony, 'agent.json'), 'utf8'));
  m.probe.port = PORT;
  m.door.local = `http://127.0.0.1:${PORT}/`;
  fs.writeFileSync(path.join(tony, 'agent.json'), JSON.stringify(m));
  proc = spawn(process.execPath, [path.join(tony, 'dashboard', 'server.js')], { cwd: tony, stdio: 'ignore' });
});
// Windows will not remove a folder a live process works in: wait for Tony's page to exit, then remove it.
after(async () => {
  if (proc && proc.exitCode === null && proc.signalCode === null) { const gone = new Promise((r) => proc.once('exit', r)); proc.kill(); await gone; }
  fs.rmSync(hub, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

function get(p) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, headers: { Host: `127.0.0.1:${PORT}` } }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.end();
  });
}
async function up() {
  for (let i = 0; i < 50; i += 1) { if ((await get('/health')).status === 200) return; await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('Tony\'s page did not start');
}

test("Tony's page in a firm's look: /pack/ serves the pack's files and nothing else", async () => {
  await up();
  const page = await get('/');
  assert.equal(page.status, 200);
  assert.match(page.body, /\/pack\/tokens\/colors\.css/, 'the page links the pack');
  assert.equal((await get('/pack/tokens/colors.css')).status, 200);
  assert.equal((await get('/pack/%E0%A4%A.css')).status, 404, 'a bad % escape');
  assert.equal((await get('/pack/..%2Foutside.css')).status, 404, '..');
  assert.equal((await get('/pack/%2e%2e/outside.css')).status, 404, '%2e%2e');
  assert.equal((await get('/health')).status, 200, 'still running');
});

test("without a brand, /pack/ is 404 and the page keeps Tony's own colours", async () => {
  await up();
  brand(false);
  assert.equal((await get('/pack/tokens/colors.css')).status, 404);
  const page = await get('/');
  assert.doesNotMatch(page.body, /\/pack\//);
  assert.equal((await get('/health')).status, 200);
});
