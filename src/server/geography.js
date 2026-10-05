'use strict';

/**
 * geography.js — which machine this is.
 *
 * The names come from workspace.config.json `machines` (config.js): each one a
 * short wall name (DESK, LAPTOP, MINI ...) and the computer it runs on. Nothing
 * here guesses a name that is not this computer's own.
 */

const config = require('./config');

/** Wall name for a computer name: the configured machine it belongs to, else its own name. */
function wallName(computerName) {
  const n = config.wallName(computerName);
  const m = config.machines().find((x) => x.computer === n);
  return m ? m.name : n;
}

/** This machine's wall name. WORKSPACE_MACHINE overrides (tests). */
function thisMachine() {
  return config.thisMachine();
}

module.exports = { wallName, thisMachine };
