'use strict';

/**
 * sandbox.js — where each invented computer's sandbox lives, and the environment its programs run in.
 *
 * Contract:
 *   sandboxes(base, ids) -> [{ name, id, computer, root, home, hub, workspace, config, office, claude,
 *                              fleet, agents, downloads, github, env }]
 *   base: the folder that holds the sandboxes (--sandboxes <dir> or VIDEO_SANDBOXES; never hardcoded).
 *   ids:  one sandbox id per computer, in demo-world order (--ids v4,v5,v6; default v4,v5,v6), so a
 *         sandbox is ws-fresh-<id>. Each one is a whole computer installed the real way (capture/install.js):
 *           <root>/home     the fake user folder: HOME, USERPROFILE, APPDATA, LOCALAPPDATA, CLAUDE_CONFIG_DIR
 *           <root>/tmp      TEMP and TMP
 *           <root>/Hub      the Hub the installer makes; the workspace is cloned into <Hub>/50-AI/workspace
 *         The office keeps its files in <home>/AppData/Local/WorkSpace, where the installer puts them.
 *   The first computer's sandbox also holds the stand-in GitHub every computer shares (<root>/fake-github):
 *   a fake gh first on PATH, and the bare repos it keeps beside itself.
 *
 * Every program runs with the computer's invented name (COMPUTERNAME) and none of the office's own
 * overrides (WORKSPACE_*, HUB_ROOT) from the shell it was started in, so nothing reads the real
 * computer, its real Claude folder or a real office.
 */

const os = require('os');
const path = require('path');

const WORLD = require('../demo-world.json');
const RIG = path.resolve(__dirname, '..', '..');
const DEFAULT_IDS = ['v4', 'v5', 'v6'];

const arg = (argv, n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };

function baseFrom(argv) {
  const v = arg(argv || process.argv.slice(2), '--sandboxes') || process.env.VIDEO_SANDBOXES;
  return path.resolve(v || path.join(os.tmpdir(), 'workspace-video'));
}

function idsFrom(argv) {
  const v = arg(argv || process.argv.slice(2), '--ids');
  const ids = v ? v.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_IDS;
  if (ids.length !== WORLD.computers.length || ids.some((s) => !/^[a-z0-9-]+$/i.test(s))) {
    throw new Error(`--ids needs ${WORLD.computers.length} sandbox ids, one per computer, like ${DEFAULT_IDS.join(',')}.`);
  }
  return ids;
}

function sandboxes(base, ids) {
  const list = ids || DEFAULT_IDS;
  const github = path.join(base, `ws-fresh-${list[0]}`, 'fake-github');
  return WORLD.computers.map((computer, i) => {
    const root = path.join(base, `ws-fresh-${list[i]}`);
    const home = path.join(root, 'home');
    const hub = path.join(root, 'Hub');
    const workspace = path.join(hub, '50-AI', 'workspace');
    const local = path.join(home, 'AppData', 'Local');
    const env = Object.assign({}, process.env, {
      HOME: home,
      USERPROFILE: home,
      APPDATA: path.join(home, 'AppData', 'Roaming'),
      LOCALAPPDATA: local,
      CLAUDE_CONFIG_DIR: path.join(home, '.claude'),
      TEMP: path.join(root, 'tmp'),
      TMP: path.join(root, 'tmp'),
      COMPUTERNAME: computer.name,
      HOSTNAME: computer.name,
      PATH: `${path.join(github, 'fake-gh')}${path.delimiter}${process.env.PATH || process.env.Path || ''}`,
      FLEET_SCHEDULER: 'print',
      GIT_AUTHOR_NAME: WORLD.person, GIT_AUTHOR_EMAIL: `${WORLD.person.toLowerCase()}@example.com`,
      GIT_COMMITTER_NAME: WORLD.person, GIT_COMMITTER_EMAIL: `${WORLD.person.toLowerCase()}@example.com`,
    });
    delete env.Path;
    for (const k of Object.keys(env)) if (/^WORKSPACE_/.test(k) || k === 'HUB_ROOT' || /^WW_/.test(k)) delete env[k];
    return {
      name: computer.name, id: list[i], computer, root, home, hub, workspace,
      config: path.join(workspace, 'workspace.config.json'),
      office: path.join(local, 'WorkSpace'),
      claude: path.join(home, '.claude'),
      fleet: path.join(hub, '50-AI', 'fleet-ops'),
      agents: path.join(hub, '50-AI', 'agents'),
      downloads: path.join(home, 'Downloads'),
      tmp: path.join(root, 'tmp'),
      github,
      env,
    };
  });
}

module.exports = { WORLD, RIG, DEFAULT_IDS, baseFrom, idsFrom, sandboxes };
