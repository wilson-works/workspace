'use strict';

/**
 * hub-fence.test.js: the Hub fence (.claude/hooks/hub-fence.js decide()) and the office's /brand-pack/ route.
 * John's checks on workspace PR #18 (bounce 1, items 1-4 and 7): inside, outside, relative, ..\, a quoted -c
 * command, $APPDATA, the session's own folder; and a bad % escape or a ".." to /brand-pack/ is a 404 while the
 * office keeps running.
 */

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { decide } = require('../.claude/hooks/hub-fence');

const hub = fs.mkdtempSync(path.join(os.tmpdir(), 'fence-hub-'));
fs.mkdirSync(path.join(hub, 'notes'), { recursive: true });
const outside = path.join(os.homedir(), 'Documents', 'private-test.txt');   // not the Hub, not temp
const fwd = (p) => p.replace(/\\/g, '/');
const call = (tool, tool_input, extra) => decide(Object.assign({ tool_name: tool, tool_input, cwd: hub }, extra || {}), hub);
const refused = (r) => assert.ok(r, 'expected a refusal');
const allowed = (r) => assert.equal(r, null);

test('a file inside the Hub, by full path or relative, is allowed', () => {
  allowed(call('Read', { file_path: path.join(hub, 'notes', 'a.md') }));
  allowed(call('Read', { file_path: 'notes/a.md' }));
  allowed(call('Write', { file_path: path.join(hub, 'notes', 'b.md') }));
  allowed(call('Bash', { command: 'ls notes && cat notes/a.md' }));
});

test('a file outside the Hub is refused for every file tool', () => {
  for (const t of ['Read', 'Write', 'Edit']) refused(call(t, { file_path: outside }));
  refused(call('Grep', { pattern: 'x', path: path.dirname(outside) }));
});

test('..\\ past the Hub is refused, in a shell command and in a Glob even after a wildcard', () => {
  refused(call('Bash', { command: 'cat ../../../private-test.txt' }));
  refused(call('PowerShell', { command: 'Get-Content ..\\..\\..\\private-test.txt' }));
  refused(call('Glob', { pattern: '*/../../../../x' }));
  allowed(call('Glob', { pattern: 'notes/*.md' }));
});

test('a path inside a quoted -c / -e command is read too (bash, python, node, powershell)', () => {
  refused(call('Bash', { command: `bash -c "cat ${fwd(outside)}"` }));
  refused(call('Bash', { command: `python -c "print(open('${fwd(outside)}').read())"` }));
  refused(call('Bash', { command: `node -e "require('fs').readFileSync('${fwd(outside)}')"` }));
  refused(call('PowerShell', { command: `powershell -c 'Get-Content ${outside}'` }));
  allowed(call('Bash', { command: 'bash -c "ls notes"' }));
});

test('folder variables in $NAME form are placed: $HOME, $USERPROFILE, $APPDATA, $LOCALAPPDATA', () => {
  refused(call('Bash', { command: 'cat $HOME/Documents/x.txt' }));
  for (const v of ['USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
    if (!process.env[v]) continue;   // a Mac has none of these
    refused(call('Bash', { command: `cat $${v}/x.txt` }), v);
    refused(call('Bash', { command: `cat \${${v}}/x.txt` }), v);
  }
});

test("Claude's own folder for this chat (saved tool results, memory) is inside; another project's is not", () => {
  const proj = path.join(os.homedir(), '.claude', 'projects', 'fence-test-hub');
  const transcript_path = path.join(proj, 'sess-1.jsonl');
  allowed(call('Read', { file_path: path.join(proj, 'sess-1', 'tool-results', 'big.txt') }, { transcript_path }));
  allowed(call('Write', { file_path: path.join(proj, 'memory', 'note.md') }, { transcript_path }));
  allowed(call('Write', { file_path: path.join(os.homedir(), '.claude', 'plans', 'p.md') }, { transcript_path }));
  refused(call('Read', { file_path: path.join(os.homedir(), '.claude', 'projects', 'someone-else', 's.jsonl') }, { transcript_path }));
});

test("cmd's own switches are not drives: cmd /c dir is allowed, cmd /c type C:\\... is not", () => {
  allowed(call('Bash', { command: 'cmd /c dir' }));
  refused(call('Bash', { command: `cmd /c "type ${outside}"` }));
});

// The office's /brand-pack/ route: a bad % escape or a ".." is a 404, and the office keeps answering.
const pack = fs.mkdtempSync(path.join(os.tmpdir(), 'fence-pack-'));
fs.writeFileSync(path.join(pack, 'a.css'), 'body{}');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fence-office-'));
const cfgFile = path.join(home, 'workspace.config.json');
fs.writeFileSync(cfgFile, JSON.stringify({ brand: { pack, look: 'academy' } }));
process.env.WORKSPACE_CONFIG = cfgFile;
const { start } = require('../src/server/server');
const PORT = 4397;
const office = start({ root: home, home, port: PORT });
after(() => {
  office.stop();
  for (const d of [hub, pack, home]) fs.rmSync(d, { recursive: true, force: true });
});

function get(p) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method: 'GET', headers: { Host: `127.0.0.1:${PORT}` } }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end();
  });
}

test('/brand-pack/: a bad % escape and a ".." are 404, the office keeps running, a real file is served', async () => {
  assert.equal(await get('/brand-pack/%E0%A4%A.css'), 404);
  assert.equal(await get('/brand-pack/..%2F..%2Fworkspace.config.json'), 404);
  assert.equal(await get('/brand-pack/a.css'), 200);
  assert.equal(await get('/api/state'), 200);   // still running
});
