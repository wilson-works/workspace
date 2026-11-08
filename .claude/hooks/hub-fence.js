#!/usr/bin/env node
/**
 * hub-fence.js — the Hub fence: Claude reads and changes files only inside the Hub, so the rest of
 * the computer stays private. Added by `node install.js --fence` as a PreToolUse hook in the Hub's
 * own .claude/settings.json, next to two Claude Code settings that do the main work:
 *
 *   permissions.blockReadsOutsideWorkingDirectories / blockWritesOutsideWorkingDirectories
 *     Claude Code itself refuses its file tools outside the folder the chat is open on, in every
 *     mode. (blockWrites needs Claude Code 2.1.314 or newer; an older one ignores it.)
 *
 * This hook is the second layer, and the only one for shell commands on Windows, where Claude Code
 * has no sandbox. It refuses, with a reason the session reads:
 *   - Read, Write, Edit, MultiEdit, NotebookEdit: a file outside the Hub;
 *   - Glob, Grep, LS: a folder (or an absolute pattern) outside the Hub;
 *   - Bash, PowerShell, Monitor: a command that names a path outside the Hub: C:\..., /c/..., /Users/...,
 *     ~, $HOME, %USERPROFILE%, $env:APPDATA and the like, or ..\.. past the Hub; and a command that
 *     asks Windows for a personal folder ([Environment]::GetFolderPath).
 * Inside means the Hub (argv[2]) and Claude's own folders for this Hub's chats (the folder of this
 * session's transcript: saved tool results and memory) and ~/.claude/plans. Temp files go in the Hub's
 * own Temp folder (the refusal says so); the computer's temp folder is outside, by name, by $TEMP or
 * $TMPDIR, or as /tmp. Claude Code's own temp folder (where it saves a command's output) and Claude's plugins
 * (~/.claude/plugins, where a private plugin such as Tony's full training lives) may be read, never
 * changed. Quoted commands (bash -c "...", python -c "...") are read inside, two levels deep.
 * Connectors (MCP), web search and fetch, and the browser are not file tools: the fence leaves them
 * alone, and they ask the person as usual.
 *
 * Honest limit: it reads a command, it does not run it. A command that builds a path at run time
 * (a script that opens a file it computes) can get past it.
 * It never breaks a session: if the hook itself fails, the call goes ahead and Claude Code's own
 * block still stands. It prints nothing unless it refuses.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const WIN = process.platform === 'win32';
const norm = (p) => {
  const r = path.resolve(p).replace(/[\\/]+$/, '');
  return WIN || process.platform === 'darwin' ? r.toLowerCase() : r;
};
const within = (p, root) => { const a = norm(p); const b = norm(root); return a === b || a.startsWith(b + path.sep); };

// Folders a POSIX shell names from its root. Anything else starting with "/" (a sed or awk pattern,
// a Windows switch such as /E) is not taken for a path.
const POSIX_ROOTS = /^\/(Users|home|etc|var|private|Volumes|opt|usr|root|mnt|Library|System|Applications|bin|sbin|srv|media|dev|tmp|cygdrive)(\/|$)/;
const ENV_DIRS = ['USERPROFILE', 'HOME', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'OneDrive', 'OneDriveConsumer',
  'OneDriveCommercial', 'PUBLIC', 'ProgramData', 'ALLUSERSPROFILE', 'TEMP', 'TMP', 'SystemDrive', 'SystemRoot', 'windir'];
// The Hub's temp folder (TEMP_DIR in hub/lib/root.js; this hook stands alone, so the name is written here too).
const HUB_TEMP = 'Temp';

/** Claude Code's own temp folders (<temp>/claude on Windows, <temp>/claude-<uid> elsewhere): read-only, for its saved output. */
function claudeTemps() {
  const bases = [process.env.CLAUDE_CODE_TMPDIR, os.tmpdir(),
    WIN && process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Temp'),
    !WIN && '/tmp', process.platform === 'darwin' && '/private/tmp'].filter(Boolean);
  const leaf = WIN ? 'claude' : `claude-${typeof process.getuid === 'function' ? process.getuid() : ''}`;
  return [...new Set(bases.map((b) => path.join(b, leaf)))];
}

function hubOf() {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  // <Hub>/50-AI/workspace/.claude/hooks/hub-fence.js
  return path.resolve(__dirname, '..', '..', '..', '..');
}

/** A shell word with $HOME, ~, %VAR%, $env:VAR expanded, as far as this hook can tell. */
function expand(word) {
  let w = word;
  const env = (name) => {
    const key = Object.keys(process.env).find((k) => k.toLowerCase() === name.toLowerCase());
    if (name.toLowerCase() === 'home' && !key) return os.homedir();
    if (name.toLowerCase() === 'homepath' && key) return (process.env.HOMEDRIVE || '') + process.env[key];
    return key ? process.env[key] : null;
  };
  if (w === '~' || /^~[\\/]/.test(w)) w = os.homedir() + w.slice(1);
  w = w.replace(/\$\{?env:([A-Za-z_][A-Za-z0-9_]*)\}?/gi, (m, n) => env(n) || m);
  w = w.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (m, n) => (ENV_DIRS.some((d) => d.toLowerCase() === n.toLowerCase()) ? env(n) || m : m));
  // Every folder variable in $NAME / ${NAME} form ($APPDATA, $LOCALAPPDATA, $OneDrive ...), not only a few.
  w = w.replace(DOLLAR_DIRS, (m, n) => env(n) || m);
  return w;
}
const DOLLAR_DIRS = new RegExp(`\\$\\{?(${ENV_DIRS.concat('TMPDIR').join('|')})\\}?(?![A-Za-z0-9_])`, 'gi');

/** The absolute path a word names, or null when it is not a path this hook can place. */
function placeOf(word, cwd) {
  if (!word || word.includes('://')) return null;
  const w = expand(word);
  if (/^[A-Za-z]:([\\/]|$)/.test(w) || /^\\\\[^\\]/.test(w)) return w.length === 2 ? `${w}\\` : w;
  // Git Bash names drive C: as /c/. Only a drive this computer has counts (an awk '/x/' does not).
  if (WIN && /^\/[A-Za-z](\/|$)/.test(w) && fs.existsSync(`${w[1]}:\\`)) return `${w[1]}:\\${w.slice(3).replace(/\//g, '\\')}`;
  if (POSIX_ROOTS.test(w)) {
    if (/^\/dev\/(null|stdout|stderr|stdin|tty)$/.test(w)) return null;
    if (WIN && /^\/tmp(\/|$)/.test(w)) return path.join(os.tmpdir(), w.slice(4));
    return w;
  }
  if (/(^|[\\/])\.\.([\\/]|$)/.test(w)) return path.resolve(cwd, w);
  return null;
}

/**
 * The words of a shell command, quotes taken off, with --flag=VALUE and >FILE split out. A quoted word is also
 * split into its own words, two levels deep, so bash -c "cat D:/x", python -c "open('D:/x')", node -e "..." and
 * powershell -c 'Get-Content C:\...' are read too (John, PR #18 bounce 1, item 1). One side effect, accepted: a
 * commit message holding a path past the Hub (../..) is refused like the path itself.
 */
function words(cmd, depth = 0) {
  const out = [];
  for (const raw of String(cmd).match(/"[^"]*"|'[^']*'|[^\s"'|;&<>(){}]+/g) || []) {
    const quoted = /^["']/.test(raw);
    const t = raw.replace(/^["']|["']$/g, '');
    out.push(t);
    const eq = t.indexOf('=');
    if (eq > 0) out.push(t.slice(eq + 1));
    if (quoted && depth < 2) out.push(...words(t, depth + 1));
  }
  return out;
}

function decide(input, hub) {
  const tool = String(input.tool_name || '');
  const ti = input.tool_input || {};
  const cwd = input.cwd || process.cwd();
  // Read-only: Claude's plugins, and Claude Code's own temp folder (its saved command output). The computer's temp
  // folder is not inside: temp files go in the Hub's Temp folder.
  const readable = [path.join(os.homedir(), '.claude', 'plugins'), ...claudeTemps()];
  // Claude's own folders for this Hub's chats: where it saves a big tool or connector result and reads it back,
  // and its memory (the folder holding this session's transcript), plus its plans. Other projects' stay refused.
  const own = [input.transcript_path ? path.dirname(String(input.transcript_path)) : null, path.join(os.homedir(), '.claude', 'plans')].filter(Boolean);
  const ok = (p, readOnly) => within(p, hub) || own.some((d) => within(p, d)) || (readOnly && readable.some((d) => within(p, d)));

  if (['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const f = ti.file_path || ti.notebook_path;
    if (!f) return null;
    const p = path.resolve(cwd, expand(String(f)));
    return ok(p, tool === 'Read') ? null : p;
  }
  if (['Glob', 'Grep', 'LS'].includes(tool)) {
    const dir = path.resolve(cwd, expand(String(ti.path || '.')));
    if (!ok(dir, true)) return dir;
    const pat = ti.pattern && tool === 'Glob' ? placeOf(String(ti.pattern).split(/[*?[{]/)[0], cwd) : null;
    if (pat && !ok(path.resolve(cwd, pat), true)) return pat;
    // A ".." anywhere in a Glob pattern, even after a wildcard (*/../../x): place it with each wildcard part as one folder.
    if (ti.pattern && tool === 'Glob' && /(^|[\\/])\.\.([\\/]|$)/.test(String(ti.pattern))) {
      const p = path.resolve(dir, String(ti.pattern).split(/[\\/]/).map((s) => (/[*?[{]/.test(s) ? 'x' : s)).join(path.sep));
      if (!ok(p, true)) return p;
    }
    return null;
  }
  if (tool === 'Bash' || tool === 'PowerShell' || tool === 'Monitor') {
    const cmd = String(ti.command || '');
    if (/GetFolderPath|SpecialFolder|Shell\.Application/i.test(cmd)) return 'a personal folder of this computer';
    // Folder variables first, across the whole command: ${APPDATA} would otherwise be split at its braces.
    const ws = words(cmd.replace(DOLLAR_DIRS, (m) => expand(m)));
    for (let i = 0; i < ws.length; i += 1) {
      // cmd's own switches (cmd /c dir, cmd /k) are not drive C: or K:.
      if (/^\/[A-Za-z]$/.test(ws[i]) && i > 0 && /^cmd(\.exe)?$/i.test(ws[i - 1])) continue;
      const p = placeOf(ws[i], cwd);
      if (p && !ok(p, false)) return p;
    }
    return null;
  }
  return null;
}

function main() {
  let text = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { text += c; });
  process.stdin.on('end', () => {
    try {
      const input = JSON.parse(text || '{}');
      const hub = hubOf();
      // The Hub's Temp folder, where the refusal sends temp files: it comes back if someone emptied it by deleting it.
      try { fs.mkdirSync(path.join(hub, HUB_TEMP), { recursive: true }); } catch (_) { /* the Hub itself may be gone */ }
      const outside = decide(input, hub);
      if (!outside) return;
      const reason = `Outside the Hub: ${outside}. The Hub fence keeps Claude inside ${hub}, so the rest of this computer stays private. `
        + `Work inside the Hub instead; for a temporary file use ${path.join(hub, HUB_TEMP)}. `
        + 'If the person needs a file from somewhere else, ask them to copy it into 00-Inbox in the Hub first.';
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
    } catch (_) { /* never break a session: Claude Code's own block still stands */ }
  });
}

if (require.main === module) main();
module.exports = { decide, placeOf, words, expand, claudeTemps, HUB_TEMP };
