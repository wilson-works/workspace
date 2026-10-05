#!/usr/bin/env node
'use strict';

/**
 * demo-agent.js — a stand-in dashboard for one of the invented agents (Iris, Quill), for filming.
 *
 *   node capture/demo-agent.js <key> [--pid-file <file>]
 *
 * Contract: serves, on 127.0.0.1 and the agent's port from demo-world.json, a one-page dashboard
 * in the agent's own colours at / and a token-free health answer at /health (what the office's
 * probe checks). Everything on the page is invented. With --pid-file it records its pid there so
 * it is stopped by that pid. It reads nothing and writes nothing else.
 */

const fs = require('fs');
const http = require('http');
const WORLD = require('../demo-world.json');

const args = process.argv.slice(2);
const key = args[0];
const a = WORLD.agents.find((x) => x.key === key);
if (!a) {
  process.stdout.write(`No agent called ${key}. Choose one of: ${WORLD.agents.map((x) => x.key).join(', ')}\n`);
  process.exit(2);
}
const pidAt = args.indexOf('--pid-file');

const BOARDS = {
  iris: {
    heading: 'Briefs',
    stat: [['Briefs this week', '4'], ['Sources read today', '14'], ['Waiting on you', '1']],
    rows: [
      ['Raised-bed soil: what to mix in', 'In progress', '3 sources so far'],
      ['First and last frost dates, by region', 'Done', '5 sources'],
      ['Which herbs grow well in shade', 'Done', '4 sources'],
      ['How long sourdough keeps on the shelf', 'Queued', 'Asked by Quill'],
    ],
    ask: 'Ask Iris to look into something…',
  },
  quill: {
    heading: 'Drafts',
    stat: [['Drafts open', '3'], ['Published this month', '6'], ['Waiting on you', '1']],
    rows: [
      ['Spring newsletter', 'Outline ready', 'Waiting on your review'],
      ['Menu page introduction', 'Drafting', 'For the bakery site'],
      ['Three tips for a first raised bed', 'Done', 'Uses the brief from Iris'],
      ['About page, second pass', 'Queued', 'After the outline'],
    ],
    ask: 'Ask Quill to write something…',
  },
};

function page() {
  const b = a.brand;
  const d = BOARDS[a.key];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pill = (s) => {
    const tone = /done/i.test(s) ? 'done' : /progress|drafting|ready/i.test(s) ? 'live' : 'wait';
    return `<span class="pill ${tone}">${esc(s)}</span>`;
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(a.name)} · ${esc(a.title)}</title>
<style>
:root{--bg:${b.bg};--panel:${b.panel};--ink:${b.ink};--a:${b.accent};--a2:${b.accent2}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:${b.font};}
header{display:flex;align-items:center;gap:18px;padding:28px 40px;border-bottom:1px solid rgba(255,255,255,.08)}
.mark{width:52px;height:52px;border-radius:50%;background:radial-gradient(circle at 30% 30%,var(--a),var(--a2));display:grid;place-items:center;font-weight:800;font-size:24px;color:#fff;box-shadow:0 0 30px color-mix(in srgb,var(--a) 40%,transparent)}
h1{margin:0;font-size:26px}h1 small{display:block;font-size:14px;font-weight:500;opacity:.7;margin-top:2px}
.live{margin-left:auto;font-size:13px;display:flex;align-items:center;gap:8px;opacity:.85}.live i{width:9px;height:9px;border-radius:50%;background:#22C55E;box-shadow:0 0 10px #22C55E}
main{padding:32px 40px;display:grid;gap:24px;max-width:1100px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.stat{background:var(--panel);border-radius:16px;padding:18px 22px}.stat b{display:block;font-size:32px;margin-top:6px;color:var(--a)}
.stat span{font-size:13px;opacity:.75}
.card{background:var(--panel);border-radius:16px;padding:8px 0}
.card h2{font-size:15px;letter-spacing:.12em;text-transform:uppercase;opacity:.7;margin:14px 22px 6px}
.row{display:grid;grid-template-columns:1fr auto 190px;gap:16px;align-items:center;padding:14px 22px;border-top:1px solid rgba(255,255,255,.06)}
.row .t{font-size:17px;font-weight:600}.row .n{font-size:13px;opacity:.7;text-align:right}
.pill{font-size:12px;padding:4px 10px;border-radius:999px;font-weight:600}
.pill.done{background:rgba(34,197,94,.16);color:#86EFAC}.pill.live{background:color-mix(in srgb,var(--a) 22%,transparent);color:var(--a)}.pill.wait{background:rgba(255,255,255,.08);opacity:.8}
.ask{background:var(--panel);border-radius:16px;padding:18px 22px;font-size:16px;opacity:.75;border:1px dashed rgba(255,255,255,.18)}
</style></head><body>
<header><div class="mark">${esc(a.name[0])}</div><h1>${esc(a.name)}<small>${esc(a.title)} · ${esc(a.line)}</small></h1><span class="live"><i></i>Running</span></header>
<main>
<section class="stats">${d.stat.map(([k, v]) => `<div class="stat"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</section>
<section class="card"><h2>${esc(d.heading)}</h2>${d.rows.map(([t, s, n]) => `<div class="row"><span class="t">${esc(t)}</span>${pill(s)}<span class="n">${esc(n)}</span></div>`).join('')}</section>
<div class="ask">${esc(d.ask)}</div>
</main></body></html>`;
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, agent: a.key }));
    return;
  }
  if (req.url === '/' || req.url.startsWith('/?')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(page());
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});
server.listen(a.port, '127.0.0.1', () => {
  if (pidAt >= 0) fs.writeFileSync(args[pidAt + 1], String(process.pid), 'utf8');
  process.stdout.write(`${a.name}'s dashboard on http://127.0.0.1:${a.port}/\n`);
});
