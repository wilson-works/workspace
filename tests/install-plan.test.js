'use strict';

/**
 * install-plan.test.js — the one installer (install.js at the repo root), run as a command against a
 * temp Hub.
 *
 * Hermetic: every folder the installer can touch is inside one temp dir (HOME, USERPROFILE,
 * APPDATA, LOCALAPPDATA, Claude Code's folder, the office's home, the settings file, the starter
 * list), the skills pack is a small git repo made here, nothing listens on a port (--no-start; the
 * port number is only written into the settings), and nothing reaches the network. The Hub marker
 * is made by hand and the hub, fleet and check parts are skipped, so this file needs only node and git.
 *
 * Proves: a dry run writes nothing; a second run changes nothing and says so; under --yes a file of
 * the user's that differs is kept; the record holds each skill's content hash (recomputed here from
 * the documented formula); --remove takes out what it added and keeps a skill the user edited, the
 * user's own hook, the settings and the Hub.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const INSTALL = path.join(REPO, 'install.js');
const SKILLS = ['alpha', 'beta'];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const SEP = '[\\\\/]';

function git(cwd, args) {
  return execFileSync('git', ['-c', 'user.name=Alex', '-c', 'user.email=alex@example.com', '-c', 'commit.gpgsign=false'].concat(args), {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  }).trim();
}

/** A temp world: a Hub with a hand-made marker, a fake skills pack, a fake home, a starter list. */
function sandbox(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-install-'));
  t.after(() => { try { fs.rmSync(base, { recursive: true, force: true, maxRetries: 3 }); } catch (_) { /* best effort */ } });
  const d = (...p) => path.join(base, ...p);
  const hub = d('Hub');
  fs.mkdirSync(path.join(hub, '.hub'), { recursive: true });
  fs.writeFileSync(path.join(hub, '.hub', 'hub.json'), JSON.stringify({
    format: 1, machine: 'DESK', role: 'command', code_zone: '20-Coding/Projects', workspace: '50-AI/workspace', owner: 'Alex', created: '2026-10-05',
  }));

  const pack = d('pack');
  for (const s of SKILLS) {
    fs.mkdirSync(path.join(pack, 'skills', s), { recursive: true });
    fs.writeFileSync(path.join(pack, 'skills', s, 'SKILL.md'), `---\nname: ${s}\ndescription: A test skill.\n---\n\nDo the ${s} job.\n`);
  }
  fs.mkdirSync(path.join(pack, 'skills', 'alpha', 'scripts'));
  fs.writeFileSync(path.join(pack, 'skills', 'alpha', 'scripts', 'run.sh'), '#!/bin/sh\necho alpha\n');
  fs.mkdirSync(path.join(pack, 'skills', 'not-in-the-starter-set'));
  fs.writeFileSync(path.join(pack, 'skills', 'not-in-the-starter-set', 'SKILL.md'), 'not copied\n');
  git(pack, ['init', '-q']);
  git(pack, ['add', 'skills']);
  git(pack, ['commit', '-q', '-m', 'the pack']);
  const ref = git(pack, ['rev-parse', 'HEAD']);

  const starter = d('starter.json');
  fs.writeFileSync(starter, JSON.stringify({ pack, ref, path: 'skills', skills: SKILLS.map((name) => ({ name, why: `does the ${name} job` })) }));

  const home = d('home');
  fs.mkdirSync(home);
  const env = Object.assign({}, process.env, {
    HOME: home,
    USERPROFILE: home,
    APPDATA: d('home', 'AppData', 'Roaming'),
    LOCALAPPDATA: d('home', 'AppData', 'Local'),
    XDG_CONFIG_HOME: d('home', '.config'),
    XDG_DATA_HOME: d('home', '.local', 'share'),
    CLAUDE_CONFIG_DIR: d('home', '.claude'),
    WORKSPACE_HOME: d('office'),
    WORKSPACE_CONFIG: d('workspace.config.json'),
    WORKSPACE_STARTER: starter,
  });
  delete env.HUB_ROOT;
  delete env.WORKSPACE_PORT;
  return { base, hub, pack, ref, env, cfg: env.WORKSPACE_CONFIG };
}

function install(sb, ...extra) {
  const r = spawnSync(process.execPath, [INSTALL, '--hub', sb.hub, '--skills-source', sb.pack, '--skip', 'check,hub,fleet',
    '--no-start', '--office-port', '4471'].concat(extra), { env: sb.env, encoding: 'utf8', input: '', timeout: 120000, windowsHide: true });
  return { code: r.status, text: `${r.stdout || ''}${r.stderr || ''}` };
}

/** Every file under dir (outside .git folders): relative path -> sha256. */
function snapshot(dir) {
  const outMap = {};
  const walk = (p) => {
    for (const ent of fs.readdirSync(p, { withFileTypes: true })) {
      if (ent.name === '.git') continue;
      const f = path.join(p, ent.name);
      if (ent.isDirectory()) walk(f);
      else outMap[path.relative(dir, f)] = sha(fs.readFileSync(f));
    }
  };
  walk(dir);
  return outMap;
}

/** The documented content hash: sha256 over "<path>\0<sha256 of bytes>\n", in path order. */
function contentHash(dir) {
  const rels = [];
  const walk = (p) => {
    for (const ent of fs.readdirSync(p, { withFileTypes: true })) {
      const f = path.join(p, ent.name);
      if (ent.isDirectory()) walk(f);
      else rels.push(path.relative(dir, f).split(path.sep).join('/'));
    }
  };
  walk(dir);
  rels.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const h = crypto.createHash('sha256');
  for (const rel of rels) h.update(`${rel}\0${sha(fs.readFileSync(path.join(dir, ...rel.split('/'))))}\n`);
  return `sha256:${h.digest('hex')}`;
}

const record = (sb) => JSON.parse(fs.readFileSync(path.join(sb.hub, '.hub', 'installed.json'), 'utf8'));
const settings = (sb) => JSON.parse(fs.readFileSync(path.join(sb.hub, '.claude', 'settings.json'), 'utf8'));
const commands = (s) => Object.values(s.hooks || {}).flat().flatMap((g) => g.hooks || []).map((h) => h.command);

test('a dry run prints the plan and writes nothing', (t) => {
  const sb = sandbox(t);
  const before = snapshot(sb.base);
  const r = install(sb, '--dry-run');
  assert.strictEqual(r.code, 0, r.text);
  assert.match(r.text, new RegExp(`\\+ \\.claude${SEP}skills${SEP}alpha`), r.text);
  assert.match(r.text, new RegExp(`\\+ 50-AI${SEP}claude_skills`), r.text);
  assert.match(r.text, /\+ \.claude[\\/]settings\.json: the office's \d+ hooks/, r.text);
  assert.match(r.text, /Dry run: nothing was written\. \d+ change\(s\) planned\./, r.text);
  assert.deepStrictEqual(snapshot(sb.base), before, 'the dry run changed a file');
  assert.ok(!fs.existsSync(sb.cfg), 'the dry run wrote workspace.config.json');
  assert.ok(!fs.existsSync(path.join(sb.hub, '.hub', 'installed.json')), 'the dry run wrote the record');
});

test('a second run changes nothing and says so', (t) => {
  const sb = sandbox(t);
  const first = install(sb, '--yes');
  assert.strictEqual(first.code, 0, first.text);
  assert.match(first.text, /\d+ change\(s\) made\./, first.text);
  assert.ok(fs.existsSync(path.join(sb.hub, '.claude', 'skills', 'alpha', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(sb.hub, '.claude', 'skills', 'workspace-setup', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(sb.hub, '50-AI', 'agents', 'README.md')));
  assert.ok(!fs.existsSync(path.join(sb.hub, '.claude', 'skills', 'not-in-the-starter-set')), 'a skill outside the starter set was copied');
  const cfg = JSON.parse(fs.readFileSync(sb.cfg, 'utf8'));
  assert.strictEqual(cfg.office.port, 4471);
  assert.ok(path.isAbsolute(cfg.office.home), 'office.home must be absolute');
  assert.strictEqual(cfg.owner.name, 'Alex');
  assert.strictEqual(cfg.machines[0].name, 'DESK');
  assert.strictEqual(cfg.machines[0].hub, true);

  const between = snapshot(sb.base);
  const second = install(sb, '--yes');
  assert.strictEqual(second.code, 0, second.text);
  assert.match(second.text, /Nothing changed\./, second.text);
  assert.doesNotMatch(second.text, /^\s+[+~-] /m, `a second run planned a change:\n${second.text}`);
  assert.match(second.text, new RegExp(`= \\.claude${SEP}skills${SEP}alpha`), second.text);
  assert.deepStrictEqual(snapshot(sb.base), between, 'the second run changed a file');
});

test('under --yes a file of the user\'s that differs is kept', (t) => {
  const sb = sandbox(t);
  const mine = path.join(sb.hub, '.claude', 'skills', 'beta', 'SKILL.md');
  fs.mkdirSync(path.dirname(mine), { recursive: true });
  fs.writeFileSync(mine, 'my own beta skill\n');
  fs.writeFileSync(sb.cfg, JSON.stringify({ owner: { name: 'Sam' }, office: { port: 5555 } }));
  const cfgBefore = fs.readFileSync(sb.cfg, 'utf8');

  const r = install(sb, '--yes');
  assert.strictEqual(r.code, 0, r.text);
  assert.match(r.text, new RegExp(`! \\.claude${SEP}skills${SEP}beta .*kept`), r.text);
  assert.strictEqual(fs.readFileSync(mine, 'utf8'), 'my own beta skill\n', 'the user\'s skill was replaced');
  assert.match(r.text, /! owner\.name/, r.text);
  assert.match(r.text, /! office\.port: yours is 5555/, r.text);
  assert.strictEqual(fs.readFileSync(sb.cfg, 'utf8'), cfgBefore, 'the user\'s workspace.config.json was changed');
  assert.ok(fs.existsSync(path.join(sb.hub, '.claude', 'skills', 'alpha', 'SKILL.md')), 'the other skill was not installed');
  assert.ok(!record(sb).copies['.claude/skills/beta'], 'a kept file of the user\'s was recorded as the installer\'s');
});

test('the record holds each copy\'s content hash, and the hooks it added', (t) => {
  const sb = sandbox(t);
  const r = install(sb, '--yes');
  assert.strictEqual(r.code, 0, r.text);
  const rec = record(sb);
  for (const s of SKILLS) {
    const entry = rec.copies[`.claude/skills/${s}`];
    assert.ok(entry, `no record for ${s}`);
    assert.strictEqual(entry.name, s);
    assert.strictEqual(entry.hash, contentHash(path.join(sb.pack, 'skills', s)), `${s}: the record is not the pack's content hash`);
    assert.strictEqual(entry.hash, contentHash(path.join(sb.hub, '.claude', 'skills', s)), `${s}: the copy is not what the record says`);
    assert.ok(entry.from.includes(sb.ref.slice(0, 7)), `${s}: the record does not name the pinned commit`);
  }
  assert.ok(fs.existsSync(path.join(sb.hub, '.claude', 'skills', 'alpha', 'scripts', 'run.sh')), 'a skill\'s sub-folder was not copied');
  assert.ok(rec.copies['.claude/skills/workspace-setup'], 'the setup skill copy is not recorded');
  const added = Object.values(rec.hooks.added).flat();
  assert.ok(added.length > 0, 'no hook commands recorded');
  const have = commands(settings(sb));
  for (const c of added) assert.ok(have.includes(c), `recorded hook not in the Hub settings: ${c}`);
  assert.ok(added.some((c) => c.includes('office-hook.js')), 'the office hook is not among the recorded hooks');
  assert.strictEqual(git(path.join(sb.hub, '50-AI', 'claude_skills'), ['rev-parse', 'HEAD']), sb.ref, 'the pack clone is not at the pin');
});

test('--remove takes out what it added and keeps what the user changed', (t) => {
  const sb = sandbox(t);
  const sFile = path.join(sb.hub, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(sFile), { recursive: true });
  fs.writeFileSync(sFile, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo mine' }] }] } }));
  const r1 = install(sb, '--yes');
  assert.strictEqual(r1.code, 0, r1.text);
  const beta = path.join(sb.hub, '.claude', 'skills', 'beta', 'SKILL.md');
  fs.appendFileSync(beta, 'A line the user added.\n');

  const dry = snapshot(sb.base);
  const plan = install(sb, '--remove', '--dry-run');
  assert.strictEqual(plan.code, 0, plan.text);
  assert.deepStrictEqual(snapshot(sb.base), dry, '--remove --dry-run changed a file');

  const r2 = install(sb, '--remove', '--yes');
  assert.strictEqual(r2.code, 0, r2.text);
  assert.ok(!fs.existsSync(path.join(sb.hub, '.claude', 'skills', 'alpha')), 'an unchanged starter skill was not removed');
  assert.ok(!fs.existsSync(path.join(sb.hub, '.claude', 'skills', 'workspace-setup')), 'the unchanged setup skill was not removed');
  assert.ok(fs.readFileSync(beta, 'utf8').includes('A line the user added.'), 'the edited skill was removed or changed');
  assert.match(r2.text, new RegExp(`! \\.claude${SEP}skills${SEP}beta .*kept`), r2.text);
  const left = commands(settings(sb));
  assert.ok(left.includes('echo mine'), 'the user\'s own hook was removed');
  assert.ok(!left.some((c) => c.includes('office-hook.js')), 'an office hook is still in the Hub settings');
  assert.ok(fs.readdirSync(path.dirname(sFile)).some((f) => f.startsWith('settings.json.bak-')), 'no backup of the settings was made');
  assert.ok(fs.existsSync(path.join(sb.hub, '.hub', 'hub.json')), 'the Hub marker was removed');
  assert.ok(fs.existsSync(sb.cfg), 'workspace.config.json was removed');
  assert.ok(fs.existsSync(path.join(sb.hub, '50-AI', 'claude_skills')), 'the pack clone was removed');
  assert.ok(fs.existsSync(path.join(sb.hub, '50-AI', 'agents', 'README.md')), 'the agents folder was removed');
  assert.match(r2.text, /Kept/, r2.text);
  const rec = record(sb);
  assert.ok(rec.copies['.claude/skills/beta'], 'the kept skill left the record, so a later removal could not see it');
  assert.ok(!rec.copies['.claude/skills/alpha'], 'a removed skill is still in the record');
});

// The Hub fence (--fence): the two file-tool blocks, the hook (Monitor too), the Hub's Temp folder and a daily driver's
// headroom (the env block), all in the Hub's own settings; the person's own env values are kept, and --remove takes out
// only what the fence wrote.
const fenceCmdOf = (sb) => `node "${REPO.replace(/\\/g, '/')}/.claude/hooks/hub-fence.js" "${sb.hub.replace(/\\/g, '/')}"`;
const fenceGroupOf = (s, cmd) => ((s.hooks && s.hooks.PreToolUse) || []).find((g) => (g.hooks || []).some((h) => h.command === cmd));

test('--fence: files in the Hub, temp files in Temp, one job at a time; the person\'s env kept; --remove takes it out', (t) => {
  const sb = sandbox(t);
  const sFile = path.join(sb.hub, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(sFile), { recursive: true });
  fs.writeFileSync(sFile, JSON.stringify({ env: { CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: '3', MY_SETTING: 'x' } }));
  const r1 = install(sb, '--yes', '--fence');
  assert.strictEqual(r1.code, 0, r1.text);
  assert.match(r1.text, /\+ the Hub fence: Claude works only inside .*\(temp files in Temp, one job at a time\)/, r1.text);
  assert.match(r1.text, /! the Hub fence: your CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS \(3\) is kept/, r1.text);

  const s = settings(sb);
  const temp = path.join(sb.hub, 'Temp');
  assert.strictEqual(s.permissions.blockReadsOutsideWorkingDirectories, true);
  assert.strictEqual(s.permissions.blockWritesOutsideWorkingDirectories, true);
  const g = fenceGroupOf(s, fenceCmdOf(sb));
  assert.ok(g, 'the fence hook is not in the Hub settings');
  assert.match(g.matcher, /(^|\|)Bash(\||$)/);
  assert.match(g.matcher, /(^|\|)Monitor(\||$)/, 'Monitor runs a shell command too');
  assert.strictEqual(s.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS, '3', 'the person\'s own value was replaced');
  assert.strictEqual(s.env.MY_SETTING, 'x');
  assert.ok(!('TEMP' in s.env) && !('TMPDIR' in s.env), 'the fence sets no temp variables (the hook keeps temp files in the Hub)');
  for (const k of ['CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH', 'CLAUDE_CODE_DISABLE_BACKGROUND_TASKS',
    'CLAUDE_CODE_DISABLE_AGENT_VIEW', 'CLAUDE_CODE_DISABLE_CRON', 'CLAUDE_CODE_DISABLE_WORKFLOWS']) assert.strictEqual(s.env[k], '1', k);
  assert.ok(fs.statSync(temp).isDirectory(), 'the Hub has no Temp folder');
  const rulesFile = path.join(sb.hub, '.claude', 'rules', 'hub-fence.md');
  const rules = fs.readFileSync(rulesFile, 'utf8');
  assert.match(rules, /Temp files stay in the Hub/);
  assert.match(rules, /One job at a time/);

  const r2 = install(sb, '--yes', '--fence');
  assert.strictEqual(r2.code, 0, r2.text);
  assert.match(r2.text, /= the Hub fence: Claude works only inside/, r2.text);

  const r3 = install(sb, '--remove', '--yes');
  assert.strictEqual(r3.code, 0, r3.text);
  const left = settings(sb);
  assert.deepStrictEqual(left.env, { CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: '3', MY_SETTING: 'x' }, 'the fence env is still there, or the person\'s was taken');
  assert.ok(!left.permissions, 'the fence blocks are still there');
  assert.ok(!commands(left).some((c) => c.includes('hub-fence.js')), 'the fence hook is still there');
  assert.ok(!fs.existsSync(rulesFile), 'the fence rules are still there');
});

test('--fence again on an earlier fence adds Monitor to its hook and the Temp and headroom settings', (t) => {
  const sb = sandbox(t);
  const sFile = path.join(sb.hub, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(sFile), { recursive: true });
  const old = 'Read|Write|Edit|MultiEdit|NotebookEdit|Glob|Grep|LS|Bash|PowerShell';
  fs.writeFileSync(sFile, JSON.stringify({
    permissions: { blockReadsOutsideWorkingDirectories: true, blockWritesOutsideWorkingDirectories: true },
    hooks: { PreToolUse: [{ matcher: old, hooks: [{ type: 'command', command: fenceCmdOf(sb), timeout: 10 }] }] },
  }));
  const r = install(sb, '--yes', '--fence');
  assert.strictEqual(r.code, 0, r.text);
  assert.match(r.text, /\+ the Hub fence/, r.text);
  const s = settings(sb);
  assert.strictEqual(s.hooks.PreToolUse.filter((x) => (x.hooks || []).some((h) => h.command === fenceCmdOf(sb))).length, 1, 'the fence hook was added twice');
  assert.match(fenceGroupOf(s, fenceCmdOf(sb)).matcher, /Monitor/);
  assert.ok(fs.statSync(path.join(sb.hub, 'Temp')).isDirectory(), 'the Hub has no Temp folder');
  assert.ok(fs.existsSync(path.join(sb.hub, '.claude', 'rules', 'hub-fence.md')), 'the fence rules were not added');
  assert.strictEqual(s.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS, '1');
});

test('bad options are refused with exit 2 and write nothing', (t) => {
  const sb = sandbox(t);
  const before = snapshot(sb.base);
  for (const bad of [['--skip', 'nonsense'], ['--role', 'boss'], ['--office-port', '80'], ['--fleet', 'join', '--yes'], ['--whatever']]) {
    const r = install(sb, ...bad);
    assert.strictEqual(r.code, 2, `${bad.join(' ')}:\n${r.text}`);
    assert.match(r.text, /NOT DONE/);
  }
  assert.deepStrictEqual(snapshot(sb.base), before);
});
