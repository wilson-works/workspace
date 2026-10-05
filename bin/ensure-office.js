#!/usr/bin/env node
'use strict';

/**
 * ensure-office.js - the SessionStart hook that keeps the office up:
 *   1. probe 127.0.0.1 on this office's port (workspace.config.json office.port, default 4316);
 *   2. return immediately if something answers;
 *   3. otherwise spawn office-start.js detached (it does the Tailscale wait and the log);
 *   4. never block, always exit 0 - a hook that cannot start the office must not stop a session.
 */

const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

let PORT = 4316;
try { PORT = require('../src/server/config').officePort(); } catch (_) { /* the default */ }

function probe() {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port: PORT }, () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    s.setTimeout(1500, () => { s.destroy(); resolve(false); });
  });
}

(async () => {
  try {
    // The forwarder first, every time: it is pid-locked (a second copy exits at
    // once) and exits by itself on the hub, so this costs one short-lived node
    // and guarantees a forwarder that died comes back with the next session.
    const fwd = spawn(process.execPath, [path.join(__dirname, 'office-forward.js')], {
      detached: true, stdio: 'ignore', windowsHide: true,
    });
    fwd.unref();
    if (await probe()) process.exit(0);
    const child = spawn(process.execPath, [path.join(__dirname, 'office-start.js')], {
      detached: true, stdio: 'ignore', windowsHide: true,
    });
    child.unref();
  } catch (e) { /* fail open */ }
  process.exit(0);
})();
