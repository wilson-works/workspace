'use strict';

/**
 * dashboard/server.js — CBFC's door: it opens the CBFC Academy. Node's built-ins only; nothing to install.
 * (The Workspace's agent template, with / changed: see below.)
 *
 *   node dashboard/server.js        (run from the agent's folder; "start" in agent.json says so)
 *
 * - Listens on 127.0.0.1 only, never on the network, on the port in its own agent.json (probe.port).
 * - Answers only requests addressed to 127.0.0.1 or localhost, plus the name in its own door.phone
 *   when it has one (tailscale serve passes that name through). Any other Host header gets 403, so a
 *   web page elsewhere cannot point a name of its own at this port and read the page.
 * - /          when the Academy answers on http://127.0.0.1:7650/api/health, a redirect to the Academy.
 *              Otherwise a plain page in CBFC's colours: installed but not running (and what to click),
 *              or not installed on this computer (and where the install guide is). Checked on every visit.
 * - /health    {"ok":true}. No login and no token, ever: the office checks it to see the agent is up.
 * - /mark.svg  its mark.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

const os = require('os');

const HOME = path.join(__dirname, '..');
const ACADEMY = 'http://127.0.0.1:7650/';

/** Does the Academy answer its health check? Any answer below 500 within two seconds is yes. */
function academyUp() {
  return new Promise((resolve) => {
    const req = http.get(`${ACADEMY}api/health`, { timeout: 2000 }, (res) => { res.resume(); resolve(res.statusCode < 500); });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

/** Where the Academy's installers put it: <home>/cbfc-academy (Mac and PC), or the builds folder on Windows. */
function academyInstalled() {
  const places = [path.join(os.homedir(), 'cbfc-academy', 'server', 'server.mjs')];
  if (process.env.LOCALAPPDATA) places.push(path.join(process.env.LOCALAPPDATA, 'CBFC-Academy', 'builds'));
  return places.some((p) => fs.existsSync(p));
}
const manifest = () => JSON.parse(fs.readFileSync(path.join(HOME, 'agent.json'), 'utf8').replace(/^﻿/, ''));

let PORT;
try { PORT = Number(manifest().probe.port); } catch (_) { PORT = NaN; }
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) {
  process.stderr.write('agent.json needs probe.port, a number from 1024 to 65535. Nothing was started.\n');
  process.exit(2);
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const colour = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? v : d);

function hostsAllowed(m) {
  const hosts = new Set(['127.0.0.1', 'localhost']);
  try { if (m.door && m.door.phone) hosts.add(new URL(m.door.phone).hostname.toLowerCase()); } catch (_) { /* no phone door */ }
  return hosts;
}

function page(m, installed) {
  const b = m.brand || {};
  const bg = colour(b.bg, '#0B1020');
  const panel = colour(b.panel, '#16213E');
  const ink = colour(b.ink, '#E6EDF7');
  const accent = colour(b.accent, '#38BDF8');
  const body = installed
    ? `<h2>The Academy is installed, but it is not running right now.</h2>
<ol><li>Double-click <strong>CBFC Academy</strong> on your Desktop.</li>
<li>Wait about ten seconds, then press <strong>Try again</strong> below.</li>
<li>Still nothing? Restart the computer: the Academy starts by itself when you sign in.</li></ol>`
    : `<h2>The CBFC Academy is not installed on this computer yet.</h2>
<p>The Academy is the firm's private library, with Ask CBFC and Planning. It does not come with the Workspace, so it is installed on its own.</p>
<ol><li>Ask the firm's office manager for the <strong>CBFC Academy install guide</strong> and its install file (a <strong>CBFC-Academy</strong> ZIP in the firm's Google Drive).</li>
<li>Follow the guide's steps for a Mac or a PC. It takes about 20 minutes.</li>
<li>Come back to this door and press <strong>Try again</strong>. It opens the Academy at ${esc(ACADEMY)}.</li></ol>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.name)} · ${installed ? 'Academy not running' : 'Academy not installed'}</title>
<link rel="icon" href="/mark.svg">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 20% 0%, ${panel} 0%, ${bg} 60%); color: ${ink};
         font-family: ${esc(b.font || 'Inter, system-ui, sans-serif')}; }
  main { max-width: 640px; margin: 0 auto; padding: 32px 16px 48px; }
  header { display: flex; gap: 16px; align-items: center; }
  header img { width: 64px; height: 64px; border-radius: 16px; }
  h1 { margin: 0; font-size: 28px; }
  .title { margin: 2px 0 0; color: ${accent}; font-weight: 600; }
  .note { margin-top: 24px; background: color-mix(in srgb, ${panel} 80%, transparent); border: 1px solid color-mix(in srgb, ${accent} 30%, transparent);
          border-radius: 16px; padding: 20px; line-height: 1.6; }
  h2 { margin: 0 0 8px; font-size: 19px; }
  ol { padding-left: 22px; margin: 8px 0 0; }
  li { margin: 6px 0; }
  a.again { display: inline-block; margin-top: 20px; min-height: 44px; padding: 11px 20px; border-radius: 12px; background: ${accent};
            color: ${bg}; font-weight: 700; text-decoration: none; }
  a.again:focus-visible { outline: 3px solid ${ink}; outline-offset: 3px; }
  footer { margin-top: 24px; font-size: 13px; opacity: .7; }
</style></head>
<body><main>
<header><img src="/mark.svg" alt=""><div><h1>${esc(m.name)}</h1><p class="title">${esc(m.title || 'The Academy')}</p></div></header>
<section class="note" role="status">${body}
<a class="again" href="/">Try again</a></section>
<footer>This door runs on this computer only. When the Academy is running, it opens the Academy straight away.</footer>
</main></body></html>`;
}

const server = http.createServer((req, res) => {
  let m;
  try { m = manifest(); } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`agent.json could not be read: ${e.message}`);
    return;
  }
  const host = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
  if (!hostsAllowed(m).has(host)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('unknown host');
    return;
  }
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end('{"ok":true}');
    return;
  }
  if (url.pathname === '/mark.svg') {
    try {
      const svg = fs.readFileSync(path.join(HOME, 'mark.svg'));
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" });
      res.end(svg);
    } catch (_) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('no mark');
    }
    return;
  }
  if (url.pathname === '/') {
    academyUp().then((up) => {
      if (up) { res.writeHead(302, { Location: ACADEMY, 'Cache-Control': 'no-store' }); res.end(); return; }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'",
      });
      res.end(page(m, academyInstalled()));
    });
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

server.on('error', (e) => {
  process.stderr.write(e.code === 'EADDRINUSE'
    ? `Port ${PORT} is already in use. Give this agent another port in agent.json (probe.port and door.local).\n`
    : `${e.message}\n`);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`${manifest().name} is on http://127.0.0.1:${PORT}/\n`);
});
