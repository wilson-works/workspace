'use strict';

/**
 * home.js — where the office keeps its state, and where Claude Code keeps its own.
 *
 * Every part of the WorkSpace (server, hooks, CLIs) resolves the office home
 * here, so a hook and the server can never disagree about which inbox a note
 * sits in. WORKSPACE_HOME overrides it (tests); otherwise office.home in
 * workspace.config.json (a second office on one computer, a sandbox install);
 * otherwise the default for this system:
 *
 *   Windows  %LOCALAPPDATA%\WorkSpace
 *   macOS    ~/Library/Application Support/WorkSpace
 *   Linux    $XDG_DATA_HOME/WorkSpace (default ~/.local/share/WorkSpace)
 */

const os = require('os');
const path = require('path');

function homeDir() {
  const env = process.env.WORKSPACE_HOME;
  if (env && env.trim()) return env.trim();
  // A hook runs inside whatever session fired it, with that session's environment, so the
  // setting in this office's own workspace.config.json is what keeps it pointed at the right office.
  try {
    const own = require('./config').load().office.home;
    if (own) return own;
  } catch (_) { /* no settings: the default */ }
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'WorkSpace');
  }
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'WorkSpace');
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'WorkSpace');
}

/** Claude Code's own folder (transcripts under projects/, the user-level comms bus). */
function claudeHome() {
  const env = process.env.CLAUDE_CONFIG_DIR;
  return env && env.trim() ? env.trim() : path.join(os.homedir(), '.claude');
}

/**
 * The user folder an office home belongs to (C:\Users\<name>\AppData\..., /Users/<name>/Library/...,
 * /home/<name>/.local/...), else this account's own. On a computer with more than one account, an
 * office started from another account must still read its owner's sessions, not the starter's.
 */
function ownerProfile(home) {
  const m = /^(.*?[\\/](?:Users|home)[\\/][^\\/]+)[\\/](?:AppData|Library|\.local)[\\/]/i.exec(String(home || ''));
  return m ? m[1] : os.homedir();
}

/**
 * Claude Code's folder for the person whose office this is: CLAUDE_CONFIG_DIR when set, else the
 * `.claude` folder in the user folder the office home belongs to (ownerProfile). The office, the
 * forwarder and office-read.js read transcripts and the user-level comms bus from here.
 */
function ownerClaudeHome(home) {
  const env = process.env.CLAUDE_CONFIG_DIR;
  return env && env.trim() ? env.trim() : path.join(ownerProfile(home || homeDir()), '.claude');
}

module.exports = { homeDir, claudeHome, ownerProfile, ownerClaudeHome };
