'use strict';

/**
 * install-agent-offer.test.js — the installer's offer of one of our agents (install.js, the agents
 * part, and --agent), with a local catalog (WW_AGENT_CATALOG).
 *
 * Hermetic, like install-plan.test.js: every folder the installer can touch is inside one temp dir
 * (HOME, USERPROFILE, APPDATA, LOCALAPPDATA, Claude Code's folder, the office's home, the settings file,
 * the starter list, the catalog), the skills pack is a small git repo made here, the office is not
 * started (--no-start; its port is one the system hands out, only written into the settings), the
 * agent is not started (--no-start), and nothing reaches the network. The hub, fleet and check parts
 * are skipped.
 *
 * Proves: --agent <key> installs that catalog agent without asking, with the skills it requires (one
 * already copied as a starter skill is "="), and the summary's agents line names it; a second run is
 * "=" and "Nothing changed."; --yes alone never installs it and says how to; with nobody at the keyboard
 * it is not installed either; a dry run writes nothing and names it "(once installed)"; an unknown key,
 * or --agent with --skip agents, is refused before anything is written; --remove takes out the skill
 * the agent brought and keeps the agent.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const lib = require('../agents/lib/agents');

const REPO = path.resolve(__dirname, '..');
const INSTALL = path.join(REPO, 'install.js');
const SEP = '[\\\\/]';

function git(cwd, args) {
  return execFileSync('git', ['-c', 'user.name=Alex', '-c', 'user.email=alex@example.com', '-c', 'commit.gpgsign=false'].concat(args), {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  }).trim();
}

function spare() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

/** A temp world: a Hub, a pack (alpha is a starter skill; gamma is not), a starter list, an agent package and a catalog. */
async function sandbox(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-offer-'));
  t.after(() => { try { fs.rmSync(base, { recursive: true, force: true, maxRetries: 3 }); } catch (_) { /* best effort */ } });
  const d = (...p) => path.join(base, ...p);
  const hub = d('Hub');
  fs.mkdirSync(path.join(hub, '.hub'), { recursive: true });
  fs.writeFileSync(path.join(hub, '.hub', 'hub.json'), JSON.stringify({
    format: 1, machine: 'DESK', role: 'command', code_zone: '20-Coding/Projects', workspace: '50-AI/workspace', owner: 'Alex', created: '2026-10-05',
  }));

  const pack = d('pack');
  for (const s of ['alpha', 'gamma']) {
    fs.mkdirSync(path.join(pack, 'skills', s), { recursive: true });
    fs.writeFileSync(path.join(pack, 'skills', s, 'SKILL.md'), `---\nname: ${s}\ndescription: A test skill.\n---\n\nDo the ${s} job.\n`);
  }
  git(pack, ['init', '-q']);
  git(pack, ['add', 'skills']);
  git(pack, ['commit', '-q', '-m', 'the pack']);
  const ref = git(pack, ['rev-parse', 'HEAD']);
  const starter = d('starter.json');
  fs.writeFileSync(starter, JSON.stringify({ pack, ref, path: 'skills', skills: [{ name: 'alpha', why: 'does the alpha job' }] }));

  const pkg = d('cat', 'packages', 'sample');
  lib.scaffold(pkg, { key: 'sample', name: 'Sample', title: 'The Sample Desk', port: await spare() });
  const m = JSON.parse(fs.readFileSync(path.join(pkg, 'agent.json'), 'utf8'));
  m.requires = { skills: ['alpha', 'gamma'] };
  fs.writeFileSync(path.join(pkg, 'agent.json'), JSON.stringify(m, null, 2));
  const catalog = d('cat', 'catalog.json');
  fs.writeFileSync(catalog, JSON.stringify({ agents: [
    { key: 'sample', name: 'Sample', title: 'The Sample Desk', line: 'Does the sample job.', source: 'packages/sample', price: 'free', offer: 'Sample, the sample desk, can move into your office now. Install it?' },
  ] }));

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
    WW_AGENT_CATALOG: catalog,
    HUB_ROOT: hub,
  });
  delete env.WORKSPACE_PORT;
  return { base, hub, pack, env, officePort: await spare(), agent: path.join(hub, '50-AI', 'agents', 'sample') };
}

function install(sb, ...extra) {
  const r = spawnSync(process.execPath, [INSTALL, '--hub', sb.hub, '--skills-source', sb.pack, '--skip', 'check,hub,fleet',
    '--no-start', '--office-port', String(sb.officePort)].concat(extra), { env: sb.env, encoding: 'utf8', input: '', timeout: 120000, windowsHide: true });
  return { code: r.status, text: `${r.stdout || ''}${r.stderr || ''}` };
}

const record = (sb) => JSON.parse(fs.readFileSync(path.join(sb.hub, '.hub', 'installed.json'), 'utf8'));

test('--agent installs it without asking, with its skills; the summary names it; a second run changes nothing', async (t) => {
  const sb = await sandbox(t);
  const r = install(sb, '--yes', '--agent', 'sample');
  assert.strictEqual(r.code, 0, r.text);
  assert.ok(fs.existsSync(path.join(sb.agent, 'agent.json')), r.text);
  assert.match(r.text, /Sample, from .*packages.sample:/, r.text);
  assert.match(r.text, /^ {4}\+ .*\.claude\/skills\/gamma {2}\(a skill Sample needs/m, r.text);
  assert.match(r.text, /^ {4}= .*\.claude\/skills\/alpha$/m, 'the starter skill is already there');
  assert.ok(fs.existsSync(path.join(sb.hub, '.claude', 'skills', 'gamma', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(sb.hub, '.claude', 'agents', 'sample.md')), 'its subagent is registered');
  assert.strictEqual(lib.runningPid(sb.agent), null, '--no-start starts nothing');
  assert.match(r.text, new RegExp(`Your agents +.*50-AI${SEP}agents: Sample`), r.text);
  const copies = record(sb).copies;
  assert.ok(copies['.claude/skills/alpha'], 'the starter skill stays recorded');
  assert.strictEqual(copies['.claude/skills/gamma'].name, 'gamma', 'the skill the agent brought is recorded too');

  const again = install(sb, '--yes', '--agent', 'sample');
  assert.strictEqual(again.code, 0, again.text);
  assert.match(again.text, new RegExp(`= 50-AI${SEP}agents${SEP}sample: Sample is in your office`), again.text);
  assert.match(again.text, /^ {2}= .*\.claude\/skills\/gamma$/m, again.text);
  assert.match(again.text, /Nothing changed\./, again.text);

  const removed = install(sb, '--yes', '--remove');
  assert.strictEqual(removed.code, 0, removed.text);
  assert.ok(!fs.existsSync(path.join(sb.hub, '.claude', 'skills', 'gamma')), '--remove takes out the skill the agent brought');
  assert.ok(fs.existsSync(path.join(sb.agent, 'agent.json')), 'and keeps the agent');
});

test('--yes alone, or nobody at the keyboard, never installs it, and says how to', async (t) => {
  const sb = await sandbox(t);
  const yes = install(sb, '--yes');
  assert.strictEqual(yes.code, 0, yes.text);
  assert.ok(!fs.existsSync(sb.agent), yes.text);
  assert.match(yes.text, /Sample, The Sample Desk, is on offer, and was not installed: --yes installs an agent only when you name it with --agent\./);
  assert.match(yes.text, /To install: add --agent sample, or run node agents\/bin\/install-agent\.js sample/);
  assert.match(yes.text, /Your agents +.* \(none yet\)/);

  const quiet = install(sb);
  assert.strictEqual(quiet.code, 0, quiet.text);
  assert.ok(!fs.existsSync(sb.agent));
  assert.match(quiet.text, /was not installed: there is nobody at the keyboard to ask/);
});

test('a dry run plans it, names it in the summary, and writes nothing', async (t) => {
  const sb = await sandbox(t);
  const r = install(sb, '--dry-run', '--agent', 'sample');
  assert.strictEqual(r.code, 0, r.text);
  assert.match(r.text, /^ {4}\+ .*50-AI\/agents\/sample\/ \(\d+ files\)$/m, r.text);
  assert.match(r.text, /^ {4}\+ .*\.claude\/skills\/gamma {2}\(a skill Sample needs, from claude_skills@\w{7}; checked once the pack is here\)$/m,
    'the pack is fetched by this install, so its skills are planned, not refused');
  assert.match(r.text, /Sample \(once installed\)/);
  assert.match(r.text, /Dry run: nothing was written\./);
  assert.ok(!fs.existsSync(path.join(sb.hub, '50-AI')), 'nothing in the Hub');
  assert.ok(!fs.existsSync(path.join(sb.hub, '.hub', 'installed.json')));
});

test('an unknown key, or --agent with --skip agents, is refused before anything is written', async (t) => {
  const sb = await sandbox(t);
  const unknown = install(sb, '--yes', '--agent', 'nobody');
  assert.strictEqual(unknown.code, 2, unknown.text);
  assert.match(unknown.text, /NOT DONE: --agent: there is no agent called "nobody" in the catalog/);
  assert.match(unknown.text, /sample +Sample, The Sample Desk/);
  const skipped = install(sb, '--yes', '--agent', 'sample', '--skip', 'check,hub,fleet,agents');
  assert.strictEqual(skipped.code, 2, skipped.text);
  assert.match(skipped.text, /cannot go with --skip agents/);
  assert.ok(!fs.existsSync(path.join(sb.hub, '.hub', 'installed.json')), 'nothing written');
  assert.ok(!fs.existsSync(sb.env.WORKSPACE_CONFIG));
});
