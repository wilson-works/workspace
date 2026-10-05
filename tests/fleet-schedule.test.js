'use strict';

/**
 * fleet-schedule.test.js — the daily sync's scheduler commands (fleet/lib/fleet.js scheduleSpec,
 * `fleet schedule`).
 *
 * Covers: the exact Windows Task Scheduler command and how it is typed; the exact macOS LaunchAgent
 * (its file, its daily time, the command it runs) and the launchctl commands; the Linux crontab
 * line; `fleet schedule` and `fleet schedule --remove` under FLEET_SCHEDULER=print print the
 * commands for this platform and run none (no plist is written either); a bad time is refused.
 * Hermetic: a hand-made fleet folder in a temp Hub with a fake home; nothing is ever registered.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const fleet = require('../fleet/lib/fleet');

const WIN = {
  node: 'C:\\Program Files\\nodejs\\node.exe',
  script: 'C:\\Users\\alex\\Hub\\50-AI\\workspace\\fleet\\bin\\fleet.js',
  hub: 'C:\\Users\\alex\\Hub',
  at: '08:30',
};

test('Windows: one schtasks command, daily at the time, running the quiet sync for this Hub', () => {
  const s = fleet.scheduleSpec('win32', WIN);
  const tr = '"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\alex\\Hub\\50-AI\\workspace\\fleet\\bin\\fleet.js" sync --quiet --hub "C:\\Users\\alex\\Hub"';
  assert.deepStrictEqual(s.create, [{
    cmd: 'schtasks',
    args: ['/Create', '/SC', 'DAILY', '/ST', '08:30', '/TN', 'WilsonWorks Fleet Sync', '/TR', tr, '/F'],
  }]);
  assert.deepStrictEqual(s.remove, [{ cmd: 'schtasks', args: ['/Delete', '/TN', 'WilsonWorks Fleet Sync', '/F'] }]);
  assert.strictEqual(fleet.display(s.create[0].cmd, s.create[0].args),
    'schtasks /Create /SC DAILY /ST 08:30 /TN "WilsonWorks Fleet Sync" /TR '
    + '"\\"C:\\Program Files\\nodejs\\node.exe\\" \\"C:\\Users\\alex\\Hub\\50-AI\\workspace\\fleet\\bin\\fleet.js\\" sync --quiet --hub \\"C:\\Users\\alex\\Hub\\"" /F');
  assert.ok(!s.create[0].args.includes('/RU'), 'it runs as the person, with no stored password');
});

test('macOS: a LaunchAgent with StartCalendarInterval, loaded with launchctl', () => {
  const s = fleet.scheduleSpec('darwin', {
    node: '/usr/local/bin/node', script: '/Users/alex/Hub/50-AI/workspace/fleet/bin/fleet.js', hub: '/Users/alex/Hub', home: '/Users/alex', at: '07:05',
  });
  const file = '/Users/alex/Library/LaunchAgents/com.wilsonworks.fleet-sync.plist';
  assert.strictEqual(s.file, file);
  assert.match(s.text, /<key>Label<\/key><string>com\.wilsonworks\.fleet-sync<\/string>/);
  assert.match(s.text, /<key>StartCalendarInterval<\/key><dict><key>Hour<\/key><integer>7<\/integer><key>Minute<\/key><integer>5<\/integer><\/dict>/);
  assert.ok(s.text.includes('<key>ProgramArguments</key><array><string>/usr/local/bin/node</string>'
    + '<string>/Users/alex/Hub/50-AI/workspace/fleet/bin/fleet.js</string><string>sync</string><string>--quiet</string>'
    + '<string>--hub</string><string>/Users/alex/Hub</string></array>'));
  assert.ok(!/RunAtLoad/.test(s.text), 'it waits for its time, not for the login');
  assert.deepStrictEqual(s.create, [
    { cmd: 'launchctl', args: ['unload', file], mayFail: true },
    { cmd: 'launchctl', args: ['load', '-w', file] },
  ]);
  assert.deepStrictEqual(s.remove, [{ cmd: 'launchctl', args: ['unload', '-w', file], mayFail: true }]);
});

test('Linux: the crontab line to add, and nothing to run', () => {
  const s = fleet.scheduleSpec('linux', { node: '/usr/bin/node', script: '/home/alex/Hub/50-AI/workspace/fleet/bin/fleet.js', hub: '/home/alex/Hub', at: '08:30' });
  assert.strictEqual(s.line, '30 8 * * * "/usr/bin/node" "/home/alex/Hub/50-AI/workspace/fleet/bin/fleet.js" sync --quiet --hub "/home/alex/Hub"');
  assert.deepStrictEqual(s.create, []);
});

/* ---- the command, under FLEET_SCHEDULER=print ---- */

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-schedule-'));
const HOME = path.join(TMP, 'home');
const HUB = path.join(TMP, 'Hub');
fs.mkdirSync(path.join(HUB, '.hub'), { recursive: true });
fs.writeFileSync(path.join(HUB, '.hub', 'hub.json'), JSON.stringify({ format: 1, machine: 'DESK', role: 'command', code_zone: '20-Coding/Projects' }));
fs.mkdirSync(path.join(HUB, '50-AI', 'fleet-ops', 'machines'), { recursive: true });
fs.mkdirSync(HOME, { recursive: true });
fs.writeFileSync(path.join(HUB, '50-AI', 'fleet-ops', 'fleet.json'), JSON.stringify({ format: 1, created: '2026-10-05' }));

function run(args) {
  const env = Object.assign({}, process.env, { HOME, USERPROFILE: HOME, FLEET_SCHEDULER: 'print', COMPUTERNAME: 'DESK-PC' });
  delete env.HUB_ROOT;
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'fleet', 'bin', 'fleet.js')].concat(args, ['--hub', HUB]), { encoding: 'utf8', env, timeout: 60000 });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

test('fleet schedule under FLEET_SCHEDULER=print prints this platform\'s exact commands and runs none', () => {
  const r = run(['schedule', '--at', '06:45']);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /none was run/);
  if (process.platform === 'win32') {
    assert.ok(r.out.includes('schtasks /Create /SC DAILY /ST 06:45 /TN "WilsonWorks Fleet Sync" /TR '), r.out);
    assert.ok(r.out.includes(`sync --quiet --hub \\"${HUB}\\"`), r.out);
  } else if (process.platform === 'darwin') {
    assert.match(r.out, /launchctl load -w /);
    assert.match(r.out, /<integer>6<\/integer><key>Minute<\/key><integer>45<\/integer>/);
  }
  assert.ok(!fs.existsSync(path.join(HOME, 'Library', 'LaunchAgents')), 'no LaunchAgent was written');
});

test('fleet schedule --remove under FLEET_SCHEDULER=print prints the removal and runs none', () => {
  const r = run(['schedule', '--remove']);
  assert.strictEqual(r.code, 0, r.out);
  if (process.platform === 'win32') assert.ok(r.out.includes('schtasks /Delete /TN "WilsonWorks Fleet Sync" /F'), r.out);
  else if (process.platform === 'darwin') assert.match(r.out, /launchctl unload -w /);
});

test('a time that is not HH:MM is refused', () => {
  const r = run(['schedule', '--at', '25:00']);
  assert.strictEqual(r.code, 2, r.out);
  assert.match(r.out, /HH:MM/);
});
