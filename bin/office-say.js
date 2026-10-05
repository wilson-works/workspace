#!/usr/bin/env node
'use strict';

/**
 * office-say.js — post to the office's group chat, as this session.
 *
 *   node <workspace>/bin/office-say.js "text" [--to <callsign>] [--scope run|machine|all]
 *
 * Default scope: this session's own run if it has one, otherwise everyone. The post is signed with
 * the session's callsign. Group messages are for coordination: reply only if you are addressed,
 * asked, or affected, and never just to acknowledge.
 *
 * Refused, exit 2, with the reason and when you may post again:
 *   - over 500 characters;
 *   - more than 1 post a minute or 6 an hour from this session;
 *   - within 60 s of receiving a group message that was not addressed to you (the loop breaker);
 *   - from a private-work session: a file or folder name, or anything that is not plain English.
 * Exit 0 posted; 1 other failure (no session id).
 *
 * The checks run here, on the session's own machine, which holds its history. The post is queued in
 * <office home>/channel/outbox.jsonl: the hub's office takes it from there, and on another machine
 * the forwarder carries it to the hub in its next feed.
 */

const fs = require('fs');
const path = require('path');
const C = require('../src/server/channel');
const S = require('../src/server/sources');
const geo = require('../src/server/geography');

const args = process.argv.slice(2);
const flagVal = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const text = args.find((a, i) => !a.startsWith('--') && (i === 0 || !['--to', '--scope', '--session'].includes(args[i - 1])));
const to = flagVal('--to');
const scopeArg = flagVal('--scope');
const sessionId = flagVal('--session') || process.env.CLAUDE_CODE_SESSION_ID;

const home = require('../src/server/home').homeDir();

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } }

if (!sessionId || !/^[0-9a-f-]{8,64}$/i.test(sessionId)) {
  process.stdout.write('NOT POSTED: no session id (CLAUDE_CODE_SESSION_ID is not set; pass --session <id>).\n');
  process.exit(1);
}

const machine = geo.thisMachine();
const book = readJson(path.join(home, 'callsigns.json')) || {};
const callsign = book[sessionId] && book[sessionId].name ? book[sessionId].name : null;
const clientWork = S.isClientWork(process.cwd(), process.env.CLAUDE_PROJECT_DIR);
const now = Date.now();

const refuse = (line) => { process.stdout.write(`NOT POSTED: ${line}\n`); process.exit(2); };

const content = C.contentRefusal(text, clientWork);
if (content) refuse(content);

// This session's own posts, and the group messages handed to it (sent log joined to receipts).
const saidFile = path.join(home, 'channel', 'said', `${sessionId}.jsonl`);
const said = C.readLines(saidFile).map((r) => r.at);
const sent = C.readLines(path.join(home, 'inbox', 'sent', `${sessionId}.jsonl`)).filter((n) => n.from === 'group');
const delivered = new Map(C.readLines(path.join(home, 'inbox', 'delivered', `${sessionId}.jsonl`)).map((d) => [d.id, d.delivered_at]));
const received = sent.filter((n) => delivered.has(n.id)).map((n) => ({
  at: delivered.get(n.id),
  addressed: !!callsign && String(n.text).startsWith(`[Group → ${callsign}]`),
}));
const rate = C.rateRefusal(said, received, now);
if (rate) refuse(rate.line);

const scope = scopeArg === 'all' ? 'all' : scopeArg === 'machine' ? `machine:${machine}` : 'auto';
const id = `g${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const post = {
  id, at: now, from: { kind: 'session', callsign, machine, session_id: sessionId },
  scope, to: to || null, text: String(text).trim(), client_work: clientWork,
};
fs.mkdirSync(path.join(home, 'channel', 'said'), { recursive: true });
fs.appendFileSync(path.join(home, 'channel', 'outbox.jsonl'), JSON.stringify(post) + '\n', 'utf8');
fs.appendFileSync(saidFile, JSON.stringify({ id, at: now }) + '\n', 'utf8');
process.stdout.write(`POSTED ${id} as ${callsign || 'this session'} (${machine}) to ${scope === 'auto' ? 'your run (or everyone)' : scope}${to ? `, addressed to ${to}` : ''}.\n`);
