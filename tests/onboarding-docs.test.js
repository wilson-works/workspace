'use strict';

/**
 * onboarding-docs.test.js — the Claude-led setup (SETUP.md), the update path (guides/09-updates.md,
 * prompts/update-my-workspace.md) and the README's "send it to someone" message say only what is true
 * of this repo.
 *
 * Hermetic: reads files in this repo, runs `git check-ignore --no-index` against its .gitignore (read
 * only), and calls the installer's argument parser in-process. Nothing is written, nothing listens,
 * nothing reaches the network.
 *
 * Proves:
 *   - every relative Markdown link in the README, SETUP.md, the guides, the prompts, the agent
 *     contract and the Get started course resolves to a file or folder in this repo;
 *   - every `node <tool>.js` those onboarding pages tell Claude to run is a file in this repo (with
 *     or without the `50-AI/workspace/` prefix a chat on the Hub uses);
 *   - the line a person pastes is the same in SETUP.md and in the README's two sections;
 *   - the installer accepts the exact options SETUP.md gives it, and install-agent knows bryn;
 *   - what guide 9 says git never tracks (workspace.config.json, brand/, a person's own project) is
 *     ignored, and what it says ships (the course, the config files) is not.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, ...rel.split('/')), 'utf8');
const exists = (rel) => fs.existsSync(path.join(REPO, ...rel.split('/')));
const THE_LINE = 'Set up my WilsonWorks Workspace from https://github.com/wilson-works/workspace, following SETUP.md.';

function mdFiles() {
  const list = ['README.md', 'SETUP.md', 'CLAUDE.md', 'agents/CONTRACT.md', 'projects/README.md',
    'projects/getting-started/PROJECT.md'];
  for (const dir of ['guides', 'prompts', 'projects/getting-started/steps']) {
    for (const f of fs.readdirSync(path.join(REPO, ...dir.split('/')))) if (f.endsWith('.md')) list.push(`${dir}/${f}`);
  }
  return list;
}

/** The Markdown links of a file, outside fenced code blocks: [text](target). */
function links(text) {
  const outside = text.replace(/```[\s\S]*?```/g, '');
  const found = [];
  const re = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m;
  while ((m = re.exec(outside))) found.push(m[1]);
  return found;
}

test('every relative Markdown link in the docs resolves to something in this repo', () => {
  const broken = [];
  for (const file of mdFiles()) {
    for (const target of links(read(file))) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue; // web, mail, in-page
      const rel = decodeURIComponent(target.split('#')[0]);
      if (!rel) continue;
      const abs = path.resolve(path.dirname(path.join(REPO, ...file.split('/'))), rel);
      if (!fs.existsSync(abs)) broken.push(`${file} -> ${target}`);
    }
  }
  assert.deepStrictEqual(broken, [], `broken links:\n${broken.join('\n')}`);
});

test('the onboarding pages name the new pages, and those pages exist', () => {
  for (const f of ['SETUP.md', 'guides/09-updates.md', 'prompts/update-my-workspace.md']) assert.ok(exists(f), f);
  assert.match(read('README.md'), /\]\(SETUP\.md\)/);
  assert.match(read('README.md'), /\]\(guides\/09-updates\.md\)/);
  assert.match(read('SETUP.md'), /prompts\/update-my-workspace\.md/);
  assert.match(read('guides/09-updates.md'), /\]\(\.\.\/prompts\/update-my-workspace\.md\)/);
});

test('every `node <tool>.js` the onboarding pages run is a file in this repo', () => {
  const pages = ['SETUP.md', 'guides/09-updates.md', 'prompts/update-my-workspace.md',
    'projects/getting-started/steps/09-your-first-specialist.md'];
  const missing = [];
  let seen = 0;
  for (const page of pages) {
    const re = /\bnode\s+((?:50-AI\/workspace\/)?[\w./-]+\.js)\b/g;
    let m;
    const text = read(page);
    while ((m = re.exec(text))) {
      seen += 1;
      const rel = m[1].replace(/^50-AI\/workspace\//, '');
      if (!exists(rel)) missing.push(`${page}: node ${m[1]}`);
    }
  }
  assert.ok(seen >= 15, `expected the pages to run the Workspace's tools; found ${seen}`);
  assert.deepStrictEqual(missing, [], `tools that are not in the repo:\n${missing.join('\n')}`);
});

test('the line to paste is the same in SETUP.md and both README sections', () => {
  const setup = read('SETUP.md');
  const readme = read('README.md');
  assert.ok(setup.includes(THE_LINE), 'SETUP.md');
  const install = readme.slice(readme.indexOf('## Install with Claude'), readme.indexOf('## Send it to someone'));
  const send = readme.slice(readme.indexOf('## Send it to someone'), readme.indexOf('## Install in one line'));
  assert.ok(install.includes(THE_LINE), 'README, Install with Claude');
  assert.ok(send.includes(THE_LINE), 'README, Send it to someone');
  // The message says what a person needs first.
  for (const need of ['Claude Code', 'Node.js 20', 'Git']) assert.ok(send.includes(need), `the message names ${need}`);
  // "Install with Claude" comes before the shell one-liners.
  assert.ok(readme.indexOf('## Install with Claude') < readme.indexOf('## Install in one line'));
});

test('SETUP.md asks about the look and feel before it installs anything', () => {
  const setup = read('SETUP.md');
  const design = setup.indexOf('### Step 1. How should it look and feel?');
  const install = setup.indexOf('### Step 2. Install it');
  assert.ok(design > 0 && install > design, 'step 1 is the design conversation, step 2 the install');
  for (const key of ['brand.office_name', 'brand.colors', 'brand.logo', 'owner.name', 'my-workspace']) {
    assert.ok(setup.includes(key), `SETUP.md names ${key}`);
  }
  // Every colour it offers is a code the office accepts.
  const codes = setup.slice(design, install).match(/#[0-9A-Fa-f]{3,8}\b/g) || [];
  assert.ok(codes.length >= 10, 'it offers palettes');
  for (const c of codes) assert.match(c, /^#[0-9a-f]{6}$/i, c);
});

test('the installer accepts the exact options SETUP.md gives it', () => {
  const suite = require('../bin/install-suite.js');
  const o = suite.parseArgs(['--dry-run', '--hub', 'Hub', '--owner', 'Alex', '--machine', 'DESK', '--agent', 'louise'], { interactive: false });
  assert.strictEqual(o.dryRun, true);
  assert.strictEqual(o.agent, 'louise');
  assert.strictEqual(o.machine, 'DESK');
  const y = suite.parseArgs(['--yes', '--hub', 'Hub', '--owner', 'Alex', '--machine', 'DESK', '--agent', 'louise'], { interactive: false });
  assert.strictEqual(y.yes, true);
  const catalog = require('../agents/lib/catalog.js');
  assert.ok(catalog.find('bryn'), 'install-agent bryn is a catalog key');
});

test('what guide 9 says git never tracks is ignored, and what ships is not', () => {
  const ignored = (rel) => spawnSync('git', ['check-ignore', '-q', '--no-index', rel], { cwd: REPO, windowsHide: true }).status === 0;
  for (const rel of ['workspace.config.json', 'brand/logo.svg', 'projects/my-own-project/PROJECT.md']) {
    assert.strictEqual(ignored(rel), true, `${rel} is ignored`);
  }
  for (const rel of ['projects/getting-started/PROJECT.md', 'projects/demo-app/PROJECT.md', 'config/org-people.json',
    'config/callsigns.json', 'src/ui/office.css']) {
    assert.strictEqual(ignored(rel), false, `${rel} is tracked`);
  }
});

test('the update procedure never resets, forces, stashes or pushes', () => {
  const steps = read('prompts/update-my-workspace.md');
  const commands = (steps.match(/`git [^`]+`/g) || []).map((s) => s.slice(1, -1));
  assert.ok(commands.length >= 8, 'it spells out its git commands');
  // The "Never" line names them; every command it tells Claude to run avoids them.
  const run = commands.filter((c) => !/^git (reset|push|clean|stash|restore)$/.test(c) && !/^git checkout -- <file>$/.test(c));
  for (const c of run) {
    assert.doesNotMatch(c, /\b(reset|push|stash|clean)\b|--force|\s-f\b/, c);
  }
  assert.ok(commands.some((c) => c.startsWith('git merge --no-ff')), 'it merges');
  assert.ok(commands.includes('git merge --abort'), 'it can stop a merge');
  assert.ok(commands.some((c) => c.startsWith('git revert -m 1')), 'going back is a revert');
});
