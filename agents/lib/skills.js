'use strict';

/**
 * skills.js — the skills an agent needs: "requires": { "skills": [...] } in its agent.json
 * (agents/CONTRACT.md). Node built-ins and git.
 *
 *   needs(manifest)         the skill names it requires, each once, in its order
 *   plan(hub, names, who, opts)   { ok, errors, lines, changes, apply }. One line per skill, in order:
 *                             = <Hub>/.claude/skills/<name>   already there (yours or ours; never replaced)
 *                             + <Hub>/.claude/skills/<name>   not there: apply() copies it from the pack
 *                           ok is false (and apply does nothing) when a skill that is not there is not in
 *                           the pack either, or the install record cannot be read. Nothing is written
 *                           before apply(). opts.packLater is for the installer's dry run only, when
 *                           its skills part has the pack still to fetch: each missing skill is then a
 *                           "+" marked "checked once the pack is here", and apply does nothing.
 *   apply()                 writes each copy, then records it in <Hub>/.hub/installed.json
 *
 * The pack is the Hub's clone of the claude_skills pack, <Hub>/50-AI/claude_skills, read at the commit
 * in the Workspace's skills/starter.json (WORKSPACE_STARTER points at another list, as it does for
 * install.js), from git's own objects, never its working tree. A copy is recorded the way install.js
 * records the starter skills ({ kind, name, hash, from }), so `node install.js --remove` takes it out
 * again while its files are unchanged.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const suite = require('../../bin/install-suite');

const fwd = (p) => String(p).replace(/\\/g, '/');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const nothing = () => {};
const words = (list) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);

function needs(m) {
  const list = m && m.requires && Array.isArray(m.requires.skills) ? m.requires.skills : [];
  return [...new Set(list)];
}

function plan(hub, names, who, opts) {
  const into = path.join(hub, '.claude', 'skills');
  const missing = names.filter((n) => !fs.existsSync(path.join(into, n)));
  const there = (n) => `= ${fwd(path.join(into, n))}`;
  if (!missing.length) return { ok: true, errors: [], lines: names.map(there), changes: 0, apply: nothing };
  const refused = (msg) => ({ ok: false, errors: [msg], lines: [], changes: 0, apply: nothing });

  let starter;
  try { starter = suite.readStarter(); } catch (e) { return refused(e.message); }
  const packDir = path.join(hub, '50-AI', 'claude_skills');
  const short = starter.ref.slice(0, 7);
  if (opts && opts.packLater) {
    const later = (n) => `+ ${fwd(path.join(into, n))}  (a skill ${who} needs, from claude_skills@${short}; checked once the pack is here)`;
    return { ok: true, errors: [], lines: names.map((n) => (missing.includes(n) ? later(n) : there(n))), changes: missing.length, apply: nothing };
  }
  const copies = new Map();
  for (const n of missing) {
    let files = [];
    try { files = suite.packFiles(packDir, starter.ref, `${starter.path}/${n}`); } catch (_) { files = []; }
    if (files.length) copies.set(n, files);
  }
  const absent = missing.filter((n) => !copies.has(n));
  if (absent.length) {
    const why = fs.existsSync(path.join(packDir, '.git'))
      ? `the skills pack in ${fwd(packDir)} does not have ${absent.length > 1 ? 'them' : 'it'} at commit ${short} (the one skills/starter.json names)`
      : `the skills pack is not in ${fwd(packDir)} yet. Run the installer (node install.js) to get it, then try again`;
    return refused(`${who} needs the skill${absent.length > 1 ? 's' : ''} ${words(absent)}, which ${absent.length > 1 ? 'are' : 'is'} not in your Hub, and ${why}.`);
  }

  let record;
  try { record = suite.readRecord(hub); } catch (e) { return refused(e.message); }
  const lines = names.map((n) => (copies.has(n) ? `+ ${fwd(path.join(into, n))}  (a skill ${who} needs, from claude_skills@${short})` : there(n)));
  const apply = () => {
    for (const [n, files] of copies) {
      const dest = path.join(into, n);
      for (const f of files) {
        const p = path.join(dest, ...f.rel.split('/'));
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, f.buf);
        if (f.exec && process.platform !== 'win32') fs.chmodSync(p, 0o755);
      }
      record.copies[fwd(path.relative(hub, dest))] = {
        kind: 'skill', name: n, hash: suite.hashEntries(files.map((f) => ({ rel: f.rel, sum: sha(f.buf) }))), from: `claude_skills@${short}`,
      };
    }
    const r = Object.assign({}, record, { format: 1 });
    delete r._new;
    require('../../bin/install').writeJson(suite.recordFile(hub), r);
  };
  return { ok: true, errors: [], lines, changes: copies.size, apply };
}

module.exports = { needs, plan };
