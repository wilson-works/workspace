#!/usr/bin/env node
'use strict';

/**
 * work.js - the Work page's projects from the command line.
 *
 *   node bin/work.js list                                   every project and where it stands
 *   node bin/work.js show <project>                         one project's steps
 *   node bin/work.js mark <project> <step-id> <todo|doing|done>
 *
 * A mark is kept in the office home (src/server/work.js), the same place the
 * page's buttons write, so the page shows it on its next refresh.
 * Exit codes: 0 done; 2 refused (no such project or step, or a bad status).
 */

const W = require('../src/server/work');
const home = require('../src/server/home').homeDir();

const [cmd, a, b, c] = process.argv.slice(2);
const out = (s) => process.stdout.write(`${s}\n`);
const box = { todo: '[ ]', doing: '[~]', done: '[x]' };

if (cmd === 'list' || !cmd) {
  const v = W.list(home, Date.now());
  if (!v.projects.length) out('No projects yet. A project is a folder in projects/ (see projects/README.md).');
  for (const p of v.projects) {
    const c2 = p.counts;
    out(`${p.key}  ${p.name}  ${c2.done}/${c2.total} done${p.pct === null ? '' : ` (${p.pct}%)`}${p.next ? `  next: ${p.next.id} ${p.next.label}` : ''}`);
  }
  process.exit(0);
}

if (cmd === 'show') {
  const v = W.project(home, a, Date.now());
  if (!v.ok) { out(v.error); process.exit(2); }
  out(`${v.project.name} (${v.project.key}): ${v.counts.done}/${v.counts.total} done`);
  for (const s of v.steps) out(`  ${box[s.status]} ${s.id}  ${s.label}`);
  process.exit(0);
}

if (cmd === 'mark') {
  const r = W.mark(home, a, b, c);
  if (!r.ok) { out(`NOT MARKED: ${r.error}`); process.exit(2); }
  out(`MARKED ${r.project} ${r.id} ${r.status}. The Work page shows it on its next refresh.`);
  process.exit(0);
}

out('usage: node bin/work.js list | show <project> | mark <project> <step-id> <todo|doing|done>');
process.exit(2);
