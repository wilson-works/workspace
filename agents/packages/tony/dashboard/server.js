'use strict';

/**
 * dashboard/server.js — Tony's own page. Node's built-ins only; nothing to install.
 *
 *   node dashboard/server.js        (run from Tony's folder; "start" in agent.json says so)
 *
 * Written for the person who works with Tony, not for whoever builds him (owner 2026-11-07: "simplify the
 * dashboard look so it was less techy for the team"): what Tony does for you, how to ask him (prompts with a
 * Copy button), what stays with you, and what he has learned lately. No counts of files, no folder names.
 *
 * Its look: in a firm's Workspace with the Academy look (owner 2026-11-07: "rebrand Tony into a CBFC brandtheme"),
 * the page takes that look from the same design-system pack the office uses: the Workspace's own
 * workspace.config.json (<Hub>/50-AI/workspace) names it in brand.look / brand.pack / brand.stylesheets, and this
 * page serves those token sheets and their fonts at /pack/. Anywhere else, Tony's own colours from agent.json.
 *
 * - Listens on 127.0.0.1 only, on the port in its own agent.json (probe.port).
 * - Answers only requests addressed to 127.0.0.1 or localhost, plus the name in its own door.phone when it has
 *   one. Any other Host header gets 403.
 * - /          the page. Read fresh on every visit, so an edit shows at once.
 * - /health    {"ok":true}. No login and no token, ever: the office checks it to see Tony is up.
 * - /mark.svg  Tony's mark.
 * - /pack/...  the firm look's .css and font files, from inside its pack only (no "..", no other types).
 */

const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const crypto = require('crypto');

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
const plain = (s) => String(s).replace(/`([^`]*)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\s*\((?:memory|brains|rules)\/[^)]*\)/g, '').trim();
const REL_RE = /^(?!.*\.\.)[A-Za-z0-9_*][A-Za-z0-9._*-]*(\/[A-Za-z0-9_*][A-Za-z0-9._*-]*)*$/;

/** The firm's look, when this Hub's Workspace has one this page can draw: { pack, sheets }, else null. */
function firmLook() {
  let brand;
  try {
    const cfg = path.join(HOME, '..', '..', 'workspace', 'workspace.config.json');
    brand = JSON.parse(fs.readFileSync(cfg, 'utf8').replace(/^﻿/, '')).brand || {};
  } catch (_) { return null; }
  if (brand.look !== 'academy' || typeof brand.pack !== 'string') return null;
  const pack = path.resolve(brand.pack.replace(/^~(?=[\\/])/, os.homedir()));
  const sheets = [];
  if (fs.existsSync(pack)) {
    for (const rel of Array.isArray(brand.stylesheets) ? brand.stylesheets : []) {
      if (typeof rel !== 'string' || !REL_RE.test(rel) || !/\.css$/i.test(rel) || (rel.match(/\*/g) || []).length > 1) continue;
      const parts = rel.split('/');
      const star = parts.indexOf('*');
      if (star < 0) { if (fs.existsSync(path.join(pack, ...parts))) sheets.push(rel); continue; }
      let dirs = [];
      try { dirs = fs.readdirSync(path.join(pack, ...parts.slice(0, star))).sort(); } catch (_) { /* none */ }
      const hit = dirs.map((d) => [...parts.slice(0, star), d, ...parts.slice(star + 1)]).find((c) => fs.existsSync(path.join(pack, ...c)));
      if (hit) sheets.push(hit.join('/'));
    }
  }
  return { pack, sheets };   // no pack on this computer yet: the look's own values below still apply
}

/** The bullets under one "## heading" of CLAUDE.md, in plain words. */
function section(heading) {
  let text = '';
  try { text = fs.readFileSync(path.join(HOME, 'CLAUDE.md'), 'utf8'); } catch (_) { return []; }
  const m = new RegExp(`^## ${heading}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'mi').exec(text);
  if (!m) return [];
  const out = [];
  for (const line of m[1].split(/\r?\n/)) {
    if (/^\s*[-*]\s+\S/.test(line)) out.push(line.replace(/^\s*[-*]\s+/, ''));
    else if (/^\s{2,}\S/.test(line) && out.length) out[out.length - 1] += ` ${line.trim()}`;
  }
  return out.map(plain);
}

/** What Tony learned lately, newest first: memory/MEMORY.md's lines, without file names or the install note. */
function learned() {
  try {
    return fs.readFileSync(path.join(HOME, 'memory', 'MEMORY.md'), 'utf8').split(/\r?\n/)
      .filter((l) => /^\s*[-*]\s+\S/.test(l)).map((l) => plain(l.replace(/^\s*[-*]\s+/, '')))
      .filter((l) => !/basic setup installed/i.test(l)).slice(-3).reverse();
  } catch (_) { return []; }
}

// How to ask Tony: a person opens a Claude chat on their Hub and starts with his name. No client data in these.
const ASKS = [
  ['Code a week of bank lines', 'Tony, here are this week\'s bank lines for <client code>. Code each one to their chart of accounts and tell me why, one line each. Flag anything you are not sure of.'],
  ['Walk me through a close', 'Tony, walk me through this month\'s close for <client code>, one step at a time. Wait for me after each step.'],
  ['Explain something', 'Tony, explain <the accounting question> in plain words, with a small made-up example.'],
  ['Find a difference', 'Tony, <account> does not tie to the statement by <amount>. Help me find the difference, starting with the most likely causes.'],
];

function hostsAllowed(m) {
  const hosts = new Set(['127.0.0.1', 'localhost']);
  try { if (m.door && m.door.phone) hosts.add(new URL(m.door.phone).hostname.toLowerCase()); } catch (_) { /* no phone door */ }
  return hosts;
}

function page(m, firm, nonce) {
  const b = m.brand || {};
  // Tony's own colours, or the firm's look (the pack's tokens, each with the Academy's own value as the fallback).
  const own = { bg: colour(b.bg, '#15181F'), panel: colour(b.panel, '#30343E'), ink: colour(b.ink, '#EEF2F8'), accent: colour(b.accent, '#8A93A6') };
  const vars = firm
    ? `--bg: var(--surface-page, #F7F7F5); --card: var(--surface-card, #FFFFFF); --ink: var(--text-body, #26262A);
       --muted: var(--text-muted, #6A6A73); --line: var(--border-default, #E2E2E0); --accent: var(--red-600, #D40032);
       --well: var(--surface-well, #EFEFED); --plate: var(--surface-dark, #26262A); --on-plate: #FFFFFF;
       --display: var(--font-display, "Oswald", "Arial Narrow", sans-serif); --body: var(--font-sans, "Archivo", Arial, sans-serif);`
    : `--bg: ${own.bg}; --card: ${own.panel}; --ink: ${own.ink}; --muted: color-mix(in srgb, ${own.ink} 65%, transparent);
       --line: color-mix(in srgb, ${own.accent} 30%, transparent); --accent: ${own.accent}; --well: color-mix(in srgb, ${own.bg} 60%, ${own.panel});
       --plate: ${own.panel}; --on-plate: ${own.ink}; --display: ${esc(b.font || 'Inter, system-ui, sans-serif')}; --body: ${esc(b.font || 'Inter, system-ui, sans-serif')};`;
  const does = section('What I do');
  const never = section('What I never do');
  const lately = learned();
  const sheets = firm ? firm.sheets.map((s) => `<link rel="stylesheet" href="/pack/${esc(s)}">`).join('\n') : '';
  const mark = firm
    ? `<span class="plate" aria-hidden="true">${esc(String(m.name || 'T').trim()[0] || 'T')}</span>`
    : '<img class="mark" src="/mark.svg" alt="">';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.name)}${m.title ? ` · ${esc(m.title)}` : ''}</title>
<link rel="icon" href="/mark.svg">
${sheets}
<style>
  :root { ${vars} }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--ink); font: 16px/1.55 var(--body); }
  main { max-width: 780px; margin: 0 auto; padding: 32px 16px 56px; }
  header { display: flex; gap: 16px; align-items: center; }
  .mark { width: 64px; height: 64px; border-radius: 12px; }
  .plate { width: 60px; height: 60px; flex: none; display: inline-flex; align-items: center; justify-content: center;
    background: var(--plate); color: var(--on-plate); font: 600 30px/1 var(--display); }
  .kicker { margin: 0; font: 600 12px/1.2 var(--body); letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); }
  h1 { margin: 2px 0 0; font: 600 34px/1.1 var(--display); ${firm ? 'text-transform: uppercase;' : ''} }
  .ready { display: inline-flex; align-items: center; gap: 7px; margin-top: 6px; font-size: 13.5px; color: var(--muted); }
  .ready i { width: 8px; height: 8px; border-radius: 50%; background: #1f9d55; }
  .line { margin: 18px 0 22px; font-size: 17px; }
  section { margin: 0 0 14px; padding: 18px 20px; background: var(--card); border: 1px solid var(--line); border-radius: ${firm ? 'var(--radius-md, 8px)' : '14px'}; }
  h2 { margin: 0 0 10px; font: 600 17px/1.2 var(--display); ${firm ? 'text-transform: uppercase; letter-spacing: 0.04em;' : ''} }
  ul { margin: 0; padding-left: 20px; } li { margin: 6px 0; }
  .help { margin: 0 0 12px; color: var(--muted); font-size: 14.5px; }
  .ask { margin: 10px 0 0; }
  .ask p { margin: 0 0 4px; font-weight: 700; font-size: 14.5px; }
  .ask div { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; background: var(--well); border: 1px solid var(--line); border-radius: 6px; }
  .ask code { flex: 1; white-space: pre-wrap; font: 14px/1.5 var(--body); }
  button { flex: none; min-height: 34px; padding: 0 12px; cursor: pointer; font: 600 13px/1 var(--body); color: var(--ink);
    background: var(--card); border: 1px solid var(--line); border-radius: 6px; }
  button:hover { border-color: var(--accent); }
  button:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
  .empty { margin: 0; color: var(--muted); }
  footer { margin-top: 22px; font-size: 13px; color: var(--muted); }
</style></head>
<body><main>
<header>${mark}<div>${m.title ? `<p class="kicker">${esc(m.title)}</p>` : ''}<h1>${esc(m.name)}</h1><span class="ready"><i aria-hidden="true"></i>Ready when you are</span></div></header>
${m.line ? `<p class="line">${esc(m.line)}</p>` : ''}
${does.length ? `<section><h2>What I do for you</h2><ul>${does.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}
<section><h2>Ask me</h2>
<p class="help">Open a Claude chat on your Hub folder and start with my name. Copy one of these, then fill in the parts in &lt;angle brackets&gt;. Use client codes, not names.</p>
${ASKS.map(([t, p], i) => `<div class="ask"><p>${esc(t)}</p><div><code id="a${i}">${esc(p)}</code><button type="button" data-copy="a${i}">Copy</button></div></div>`).join('\n')}
</section>
${never.length ? `<section><h2>What stays with you</h2><ul>${never.slice(0, 2).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}
<section><h2>What I've learned lately</h2>
${lately.length ? `<ul>${lately.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '<p class="empty">Nothing yet. When you correct me, I write it down and do it your way next time.</p>'}
</section>
<footer>${esc(m.name)} works on this computer only.</footer>
</main>
<script nonce="${nonce}">
  for (const b of document.querySelectorAll('[data-copy]')) b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(document.getElementById(b.dataset.copy).textContent); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1600); } catch (_) { /* select it by hand */ }
  });
</script>
</body></html>`;
}

const decode = (x) => { try { return decodeURIComponent(x); } catch (_) { return null; } };

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
  if (url.pathname.startsWith('/pack/')) {
    const firm = firmLook();
    const rel = decode(url.pathname.slice('/pack/'.length));
    const type = rel && { '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff' }[path.extname(rel).toLowerCase()];
    const f = firm && rel ? path.resolve(firm.pack, rel) : null;
    if (type && f && !rel.includes('..') && /^[A-Za-z0-9_][A-Za-z0-9._/-]*$/.test(rel) && f.startsWith(firm.pack + path.sep) && fs.existsSync(f)) {
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      res.end(fs.readFileSync(f));
    } else { res.writeHead(404); res.end(); }
    return;
  }
  if (url.pathname === '/') {
    const nonce = crypto.randomBytes(12).toString('base64');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': `default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self'; script-src 'nonce-${nonce}'`,
    });
    res.end(page(m, firmLook(), nonce));
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
