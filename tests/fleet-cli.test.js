'use strict';

/**
 * fleet-cli.test.js — fleet/bin/fleet.js end to end: two Hubs (two "computers") and one bare repo
 * standing in for GitHub, all in a temp folder.
 *
 * Covers: init seeds the bare repo, registers the first computer and pushes, and a second run
 * changes nothing; join registers a second computer and refuses a name another computer holds; a
 * handoff written on one computer is listed and taken on the other, and the first sees it taken; the
 * sync stops on a file that is not this computer's and commits nothing; a rebase conflict is aborted,
 * leaving the clone exactly as it was.
 *
 * Hermetic: no network and no gh (the repo is given with --remote), no office probe
 * (FLEET_OFFICE_PROBE=0), no scheduler (FLEET_SCHEDULER=print), no git config of this computer's
 * (GIT_CONFIG_NOSYSTEM, GIT_CONFIG_GLOBAL), and the computer's name comes from COMPUTERNAME.
 * The steps build on each other and run in order.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI = path.join(__dirname, '..', 'fleet', 'bin', 'fleet.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-cli-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(HOME, { recursive: true });

const ENV = Object.assign({}, process.env, {
  HOME, USERPROFILE: HOME,
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(HOME, 'no-gitconfig'),
  FLEET_OFFICE_PROBE: '0', FLEET_SCHEDULER: 'print',
  WORKSPACE_CONFIG: path.join(TMP, 'no-workspace-config.json'),
});
delete ENV.HUB_ROOT;

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: ENV });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function makeHub(name, machine, role) {
  const dir = path.join(TMP, name);
  fs.mkdirSync(path.join(dir, '.hub'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.hub', 'hub.json'), JSON.stringify({
    format: 1, machine, role, code_zone: '20-Coding/Projects', workspace: '50-AI/workspace', owner: 'Alex', created: '2026-10-05',
  }));
  for (const z of ['00-Inbox', '20-Coding/Projects', '50-AI', '90-Archive/_DumpQueue']) fs.mkdirSync(path.join(dir, z), { recursive: true });
  return dir;
}

function fleet(hub, computer, args) {
  const r = spawnSync(process.execPath, [CLI].concat(args, ['--hub', hub]), {
    encoding: 'utf8', env: Object.assign({}, ENV, { COMPUTERNAME: computer }), timeout: 120000,
  });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

const BARE = path.join(TMP, 'remote', 'fleet-ops.git');
fs.mkdirSync(path.dirname(BARE), { recursive: true });
git(TMP, ['init', '--quiet', '--bare', '-b', 'main', BARE]);
const bareHead = () => git(TMP, ['--git-dir', BARE, 'rev-parse', 'main']);

const HUB_A = makeHub('desk', 'DESK', 'command');
const HUB_B = makeHub('mini', 'MINI', 'builder');
const CLONE_A = path.join(HUB_A, '50-AI', 'fleet-ops');
const CLONE_B = path.join(HUB_B, '50-AI', 'fleet-ops');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

test('init seeds the repo, registers the first computer and pushes; a second run changes nothing', () => {
  const r = fleet(HUB_A, 'DESK-PC', ['init', '--remote', BARE]);
  assert.strictEqual(r.code, 0, r.out);
  for (const f of ['fleet.json', 'README.md', 'CLAUDE.md', '.gitattributes', '.gitignore', 'templates/handoff.md',
    'templates/work-order.md', 'templates/comms-entry.md', 'board/backlog/.gitkeep', 'handoffs/open/.gitkeep',
    'machines/DESK.json', 'comms/DESK.md', 'heartbeats/DESK.json']) {
    assert.ok(fs.existsSync(path.join(CLONE_A, f)), `${f} is in the clone`);
  }
  const m = readJson(path.join(CLONE_A, 'machines', 'DESK.json'));
  assert.deepStrictEqual([m.name, m.role, m.computer, m.office_hub, m.status, m.code_zone], ['DESK', 'command', 'DESK-PC', true, 'active', '20-Coding/Projects']);
  assert.strictEqual(readJson(path.join(CLONE_A, 'fleet.json')).format, 1);

  const subjects = git(TMP, ['--git-dir', BARE, 'log', '--format=%s', 'main']).split('\n');
  assert.ok(subjects.includes('fleet: start the fleet'), subjects.join(' | '));
  assert.ok(subjects.some((s) => /^fleet\[DESK\]: join \d{4}-\d{2}-\d{2}$/.test(s)), subjects.join(' | '));
  // No identity on this computer: a repo-local one named for it.
  assert.strictEqual(git(TMP, ['--git-dir', BARE, 'log', '-1', '--format=%an <%ae>', 'main']), 'DESK fleet <desk@fleet.invalid>');

  // The heartbeat carries counts, never titles.
  const hb = readJson(path.join(CLONE_A, 'heartbeats', 'DESK.json'));
  assert.deepStrictEqual(Object.keys(hb.board).sort(), ['archive', 'backlog', 'doing', 'done']);
  assert.strictEqual(typeof hb.handoffs_open, 'number');
  assert.strictEqual(hb.office, null, 'the office probe was switched off');

  const head = bareHead();
  const again = fleet(HUB_A, 'DESK-PC', ['init', '--remote', BARE]);
  assert.strictEqual(again.code, 0, again.out);
  const marks = again.out.split(/\r?\n/).filter((l) => /^ {2}[+~=!-] /.test(l));
  assert.ok(marks.length > 5, again.out);
  assert.ok(marks.every((l) => l.startsWith('  = ')), again.out);
  assert.match(again.out, /Nothing changed\./);
  assert.strictEqual(bareHead(), head, 'a second run pushes nothing');
});

test('join registers a second computer; a name another computer holds is refused', () => {
  const clash = fleet(HUB_B, 'MINI-PC', ['join', BARE, '--machine', 'DESK']);
  assert.strictEqual(clash.code, 2, clash.out);
  assert.match(clash.out, /already the name of another computer/);
  assert.strictEqual(readJson(path.join(CLONE_B, 'machines', 'DESK.json')).computer, 'DESK-PC', 'DESK is left as it was');

  const r = fleet(HUB_B, 'MINI-PC', ['join', BARE]);
  assert.strictEqual(r.code, 0, r.out);
  const m = readJson(path.join(CLONE_B, 'machines', 'MINI.json'));
  assert.deepStrictEqual([m.name, m.role, m.computer, m.office_hub], ['MINI', 'builder', 'MINI-PC', false]);
  assert.ok(fs.existsSync(path.join(CLONE_B, 'comms', 'MINI.md')));
  assert.ok(git(TMP, ['--git-dir', BARE, 'log', '--format=%s', 'main']).split('\n').some((s) => s.startsWith('fleet[MINI]: join')));

  const again = fleet(HUB_B, 'MINI-PC', ['join', BARE]);
  assert.strictEqual(again.code, 0, again.out);
  assert.match(again.out, /Nothing changed\./);
});

let handoffId = null;

test('a handoff written on one computer is listed and taken on the other, and the first sees it taken', () => {
  const h = fleet(HUB_A, 'DESK-PC', ['handoff', '--to', 'MINI', 'Finish the tip buttons',
    '--body', 'The buttons are drawn. Wire them to the total, then check the receipt.', '--repo', 'demo-app', '--branch', 'feature/tips']);
  assert.strictEqual(h.code, 0, h.out);
  const open = fs.readdirSync(path.join(CLONE_A, 'handoffs', 'open')).filter((f) => f.endsWith('.md'));
  assert.strictEqual(open.length, 1, open.join(', '));
  assert.match(open[0], /^HO-\d{8}-\d{4}-DESK-finish-the-tip-buttons\.md$/);
  handoffId = open[0].replace(/\.md$/, '');
  const text = fs.readFileSync(path.join(CLONE_A, 'handoffs', 'open', open[0]), 'utf8');
  for (const line of [`id: ${handoffId}`, 'from: DESK', 'to: MINI', 'status: open', 'repo: demo-app', 'branch: feature/tips']) {
    assert.ok(text.includes(`\n${line}\n`), `${line} in:\n${text}`);
  }
  assert.match(text, /^---\n/);
  assert.match(text, /# Finish the tip buttons/);
  assert.match(text, /## Where the branch is/);

  const list = fleet(HUB_B, 'MINI-PC', ['pickup']);
  assert.strictEqual(list.code, 0, list.out);
  assert.ok(list.out.includes(handoffId), list.out);
  assert.match(list.out, /Finish the tip buttons/);

  const take = fleet(HUB_B, 'MINI-PC', ['pickup', handoffId]);
  assert.strictEqual(take.code, 0, take.out);
  const taken = path.join(CLONE_B, 'handoffs', 'taken', `${handoffId}.md`);
  assert.ok(fs.existsSync(taken), take.out);
  assert.ok(!fs.existsSync(path.join(CLONE_B, 'handoffs', 'open', `${handoffId}.md`)));
  const t = fs.readFileSync(taken, 'utf8');
  assert.match(t, /\ntaken_by: MINI\n/);
  assert.match(t, /\nstatus: taken\n/);
  assert.match(t, /\ntaken_at: /);

  const sync = fleet(HUB_A, 'DESK-PC', ['sync']);
  assert.strictEqual(sync.code, 0, sync.out);
  assert.ok(fs.existsSync(path.join(CLONE_A, 'handoffs', 'taken', `${handoffId}.md`)));
  const status = fleet(HUB_A, 'DESK-PC', ['status']);
  assert.strictEqual(status.code, 0, status.out);
  assert.match(status.out, /taken by MINI/);
  assert.match(status.out, /MINI\s+builder/);
});

test('a handoff for another computer is not taken without --any', () => {
  const h = fleet(HUB_A, 'DESK-PC', ['handoff', '--to', 'DESK', 'Review the tip buttons', '--body', 'Check the branch on the desk.']);
  assert.strictEqual(h.code, 0, h.out);
  const id = fs.readdirSync(path.join(CLONE_A, 'handoffs', 'open')).find((f) => f.includes('review-the-tip-buttons')).replace(/\.md$/, '');
  const r = fleet(HUB_B, 'MINI-PC', ['pickup', id]);
  assert.strictEqual(r.code, 2, r.out);
  assert.match(r.out, /is for DESK, not MINI/);
});

test('the sync stops on files that are not this computer\'s and commits nothing', () => {
  assert.strictEqual(fleet(HUB_A, 'DESK-PC', ['sync']).code, 0);
  const headLocal = git(CLONE_A, ['rev-parse', 'HEAD']);
  const headRemote = bareHead();
  fs.appendFileSync(path.join(CLONE_A, 'comms', 'MINI.md'), '\n## a note DESK should never write\n');
  fs.writeFileSync(path.join(CLONE_A, 'notes.txt'), 'a stray file\n');

  const r = fleet(HUB_A, 'DESK-PC', ['sync']);
  assert.strictEqual(r.code, 3, r.out);
  assert.match(r.out, /comms\/MINI\.md/);
  assert.match(r.out, /notes\.txt/);
  const flag = fs.readFileSync(path.join(CLONE_A, '.sync', 'DIRTY'), 'utf8');
  assert.match(flag, /comms\/MINI\.md/);
  assert.match(flag, /notes\.txt/);
  assert.strictEqual(readJson(path.join(CLONE_A, '.sync', 'last.json')).result, 'dirty');
  assert.strictEqual(git(CLONE_A, ['rev-parse', 'HEAD']), headLocal, 'nothing was committed');
  assert.strictEqual(bareHead(), headRemote, 'nothing was pushed');

  git(CLONE_A, ['checkout', '--', 'comms/MINI.md']);
  fs.unlinkSync(path.join(CLONE_A, 'notes.txt'));
  const ok = fleet(HUB_A, 'DESK-PC', ['sync']);
  assert.strictEqual(ok.code, 0, ok.out);
  assert.ok(!fs.existsSync(path.join(CLONE_A, '.sync', 'DIRTY')), 'a good sync clears the flag');
});

test('a rebase conflict is aborted: the clone is left exactly as it was, nothing half-merged', () => {
  // Another session, somewhere else, wrongly writes in DESK's comms file and pushes.
  const other = path.join(TMP, 'other');
  git(TMP, ['clone', '--quiet', BARE, other]);
  fs.appendFileSync(path.join(other, 'comms', 'DESK.md'), '\n## 2026-10-05 09:00\n\nWritten in the wrong file, elsewhere.\n');
  git(other, ['add', '--', 'comms/DESK.md']);
  git(other, ['-c', 'user.name=Other', '-c', 'user.email=other@example.invalid', 'commit', '--quiet', '-m', 'a stray edit']);
  git(other, ['push', '--quiet', 'origin', 'main']);
  const remoteHead = bareHead();

  const r = fleet(HUB_A, 'DESK-PC', ['post', 'A note from DESK.']);
  assert.strictEqual(r.code, 4, r.out);
  assert.match(r.out, /comms\/DESK\.md/);
  const gitDir = path.join(CLONE_A, '.git');
  assert.ok(!fs.existsSync(path.join(gitDir, 'rebase-merge')) && !fs.existsSync(path.join(gitDir, 'rebase-apply')), 'no rebase left in progress');
  assert.strictEqual(git(CLONE_A, ['status', '--porcelain']), '', 'the working tree is clean');
  assert.match(git(CLONE_A, ['log', '-1', '--format=%s']), /^fleet\[DESK\]: note /, 'HEAD is this computer\'s own commit, as before the pull');
  const comms = fs.readFileSync(path.join(CLONE_A, 'comms', 'DESK.md'), 'utf8');
  assert.match(comms, /A note from DESK\./);
  assert.ok(!comms.includes('<<<<<<<') && !comms.includes('Written in the wrong file'), 'no conflict markers, nothing of the other side');
  assert.match(fs.readFileSync(path.join(CLONE_A, '.sync', 'CONFLICT'), 'utf8'), /comms\/DESK\.md/);
  assert.strictEqual(readJson(path.join(CLONE_A, '.sync', 'last.json')).result, 'conflict');
  assert.strictEqual(bareHead(), remoteHead, 'nothing was pushed');
});
