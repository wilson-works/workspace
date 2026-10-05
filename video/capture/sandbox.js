'use strict';

/**
 * sandbox.js — where each invented computer's sandbox lives, and the environment its programs run in.
 *
 * Contract:
 *   sandboxes(base, opts) -> [{ name, sandbox, root, home, claude, office, config, run, hubRoot, env, computer }]
 *   opts.deskConfig: where the DESK's settings go (default: the repo root's workspace.config.json).
 *   base is the folder that holds ws-fresh-v1 (DESK), ws-fresh-v2 (MINI) and ws-fresh-v3 (LAPTOP).
 *   It comes from --sandboxes <dir> or VIDEO_SANDBOXES; never a hardcoded path.
 *
 * Every program the capture runs for a computer gets a fake home inside its sandbox: HOME,
 * USERPROFILE, APPDATA, LOCALAPPDATA, CLAUDE_CONFIG_DIR and WORKSPACE_HOME all point there, and
 * COMPUTERNAME / WORKSPACE_MACHINE are the invented computer name, so nothing ever reads the real
 * computer's name, its real Claude folder or a real office.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const WORLD = require('../demo-world.json');
const RIG = path.resolve(__dirname, '..', '..');

function baseFrom(argv) {
  const args = argv || process.argv.slice(2);
  const i = args.indexOf('--sandboxes');
  const v = i >= 0 ? args[i + 1] : process.env.VIDEO_SANDBOXES;
  if (!v) return path.join(os.tmpdir(), 'workspace-video');
  return path.resolve(v);
}

/** One computer's sandbox. The DESK's settings file is the one in the repo root (the office's default). */
function sandboxOf(base, computer, opts) {
  const root = path.join(base, `ws-fresh-${computer.sandbox}`);
  const home = path.join(root, 'home');
  const claude = path.join(home, '.claude');
  const office = path.join(root, 'office');
  const deskConfig = (opts && opts.deskConfig) || path.join(RIG, 'workspace.config.json');
  const config = computer.hub ? deskConfig : path.join(root, 'workspace.config.json');
  const hubRoot = path.join(home, 'Hub');
  const env = Object.assign({}, process.env, {
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
    CLAUDE_CONFIG_DIR: claude,
    WORKSPACE_HOME: office,
    WORKSPACE_CONFIG: config,
    WORKSPACE_MACHINE: computer.name,
    WORKSPACE_PORT: String(computer.office_port),
    COMPUTERNAME: computer.name,
    HOSTNAME: computer.name,
  });
  // A Hub only exists once the installer has made one in this sandbox (phase 2). Until then the
  // office runs on its own and never probes a drive for a Hub.
  if (fs.existsSync(path.join(hubRoot, '.hub', 'hub.json'))) env.HUB_ROOT = hubRoot;
  else delete env.HUB_ROOT;
  return {
    name: computer.name, sandbox: computer.sandbox, computer, root, home, claude, office, config,
    run: path.join(root, 'run'), hubRoot, env,
  };
}

function sandboxes(base, opts) {
  return WORLD.computers.map((c) => sandboxOf(base, c, opts));
}

module.exports = { WORLD, RIG, baseFrom, sandboxes, sandboxOf };
