'use strict';

/**
 * dashboard/server.js — this agent's own page. Node's built-ins only; nothing to install.
 *
 *   node dashboard/server.js        (run from the agent's folder; "start" in agent.json says so)
 *
 * - Listens on 127.0.0.1 only, never on the network, on the port in its own agent.json (probe.port).
 * - Answers only requests addressed to 127.0.0.1 or localhost, plus the name in its own door.phone
 *   when it has one (tailscale serve passes that name through). Any other Host header gets 403, so a
 *   web page elsewhere cannot point a name of its own at this port and read the page.
 * - /          its page in its own colours: name, title, how many brains, rules and memory lines it
 *              has, and the latest memory lines. Read fresh on every visit, so an edit shows at once.
 * - /health    {"ok":true}. No login and no token, ever: the office checks it to see the agent is up.
 * - /mark.svg  its mark.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

const HOME = path.join(__dirname, '..');
const manifest = () => JSON.parse(fs.readFileSync(path.join(HOME, 'agent.json'), 'utf8').replace(/^﻿/, ''));

let PORT;
try { PORT = Number(manifest().probe.port); } catch (_) { PORT = NaN; }
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) {
  process.stderr.write('agent.json needs probe.port, a number from 1024 to 65535. Nothing was started.\n');
  process.exit(2);
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const colour = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? v : d);

/** The markdown files in one of its folders, its README left out. */
function topics(sub) {
  try { return fs.readdirSync(path.join(HOME, sub)).filter((f) => /\.md$/i.test(f) && f.toLowerCase() !== 'readme.md').sort(); } catch (_) { return []; }
}

/** The lines of memory/MEMORY.md that point at a lesson ("- ..."), in file order. */
function memoryLines() {
  try {
    return fs.readFileSync(path.join(HOME, 'memory', 'MEMORY.md'), 'utf8').split(/\r?\n/)
      .filter((l) => /^\s*[-*]\s+\S/.test(l)).map((l) => l.replace(/^\s*[-*]\s+/, ''));
  } catch (_) { return []; }
}

function hostsAllowed(m) {
  const hosts = new Set(['127.0.0.1', 'localhost']);
  try { if (m.door && m.door.phone) hosts.add(new URL(m.door.phone).hostname.toLowerCase()); } catch (_) { /* no phone door */ }
  return hosts;
}

function page(m) {
  const b = m.brand || {};
  const bg = colour(b.bg, '#0B1020');
  const panel = colour(b.panel, '#16213E');
  const ink = colour(b.ink, '#E6EDF7');
  const accent = colour(b.accent, '#38BDF8');
  const accent2 = colour(b.accent2, '#818CF8');
  const brains = topics('brains');
  const rules = topics('rules');
  const memory = memoryLines();
  const latest = memory.slice(-5).reverse();
  const tile = (n, word, items) => `<section class="tile"><p class="n">${n}</p><p class="w">${word}</p>${items.length ? `<p class="list">${items.map((x) => esc(x.replace(/\.md$/i, '').replace(/-/g, ' '))).join(' · ')}</p>` : ''}</section>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.name)}${m.title ? ` · ${esc(m.title)}` : ''}</title>
<link rel="icon" href="/mark.svg">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 20% 0%, ${panel} 0%, ${bg} 60%); color: ${ink};
         font-family: ${esc(b.font || 'Inter, system-ui, sans-serif')}; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 16px 48px; }
  header { display: flex; gap: 16px; align-items: center; }
  header img { width: 64px; height: 64px; border-radius: 16px; }
  h1 { margin: 0; font-size: 28px; }
  .title { margin: 2px 0 0; color: ${accent}; font-weight: 600; }
  .line { margin: 16px 0 24px; opacity: .85; line-height: 1.5; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .tile, .memory { background: color-mix(in srgb, ${panel} 80%, transparent); border: 1px solid color-mix(in srgb, ${accent} 30%, transparent);
         border-radius: 16px; padding: 16px; }
  .tile p { margin: 0; }
  .n { font-size: 34px; font-weight: 700; color: ${accent}; }
  .w { opacity: .8; }
  .list { margin-top: 8px !important; font-size: 13px; opacity: .7; }
  .memory { margin-top: 12px; }
  .memory h2 { margin: 0 0 8px; font-size: 16px; color: ${accent2}; }
  .memory ul { margin: 0; padding-left: 18px; line-height: 1.6; }
  .empty { opacity: .6; }
  footer { margin-top: 24px; font-size: 12px; opacity: .55; }
</style></head>
<body><main>
<header><img src="/mark.svg" alt=""><div><h1>${esc(m.name)}</h1>${m.title ? `<p class="title">${esc(m.title)}</p>` : ''}</div></header>
${m.line ? `<p class="line">${esc(m.line)}</p>` : '<p class="line"></p>'}
<div class="tiles">
${tile(brains.length, brains.length === 1 ? 'brain topic' : 'brain topics', brains)}
${tile(rules.length, rules.length === 1 ? 'rule' : 'rules', rules)}
${tile(memory.length, memory.length === 1 ? 'memory line' : 'memory lines', [])}
</div>
<section class="memory"><h2>Latest in memory</h2>
${latest.length ? `<ul>${latest.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '<p class="empty">Nothing learned yet.</p>'}
</section>
<footer>${esc(m.name)} runs on this computer only. Its files are in ${esc(path.basename(HOME))}/.</footer>
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
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'",
    });
    res.end(page(m));
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
