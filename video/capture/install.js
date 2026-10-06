#!/usr/bin/env node
'use strict';

/**
 * install.js — install the three sandbox computers the way a person would, then give them an invented
 * working week with the product's own command lines, keeping what each command printed.
 *
 *   node capture/install.js --sandboxes <dir> --source <workspace git repo> --ref <branch> --gh <folder>
 *                           [--ids v4,v5,v6] [--only install|content|live]
 *
 *   --source  the workspace repository the bootstrap clones (WW_SOURCE), --ref its branch (WW_REF)
 *   --gh      a folder holding a stand-in gh.cmd and gh.js, copied into the first sandbox's fake-github/
 *
 * Contract:
 *   install  For DESK, then MINI, then LAPTOP: makes the fake home, then runs install.ps1 (the
 *            Windows bootstrap) with that home, WW_HUB=<sandbox>/Hub, and --yes, the computer's name,
 *            role and office port, --no-start, and --fleet create --create-repo (DESK) or --fleet join
 *            alex-example/fleet-ops. MINI's Hub is made first with hub init --code-zone 20-Coding/Active,
 *            the second of the two values that may differ per computer. DESK is then installed a second
 *            time. Then each office's settings get what "set up my WorkSpace" would add: the three
 *            computers, the DESK office's address for the other two, and a tailscale_cli that does not
 *            exist, so no office in a sandbox ever asks this computer's Tailscale for its name.
 *            A computer whose Hub is already installed is left as it is.
 *   content  Projects (hub new-project); on DESK the two WilsonWorks agents, Louise then Bryn, installed
 *            by their catalog keys (install-agent louise, install-agent bryn), so each is cloned from
 *            its GitHub source the way anyone gets it, each on a sandbox port (demo-world.json); then
 *            new-agent's plan for an agent of Alex's own (--dry-run: nothing is made, so it never has
 *            an office); two plain-English rows in DESK's .hub/nav.json and hub nav, after the agents,
 *            so the map lists them; the fleet's board, comms posts, a handoff from DESK to MINI that
 *            MINI picks up, and syncs.
 *   live     With the offices up (capture/stage.js up): every computer syncs, then DESK's fleet status,
 *            so the status shows each office answering.
 *   Every command's display line and full output go to <sandbox>/capture-log/<step>.json, which
 *   capture/terminal.js turns into the terminal scenes. Agent dashboards it starts are left running:
 *   capture/stage.js down stops them, by their own pid files.
 *   Exit 0 done, 1 failed, 2 refused.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { WORLD, RIG, baseFrom, idsFrom, sandboxes } = require('./sandbox');

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const say = (m) => process.stdout.write(`${m}\n`);

class Stop extends Error { constructor(code, msg) { super(msg); this.code = code; } }

const DESK_OFFICE = WORLD.computers.find((c) => c.hub).office_port;
const FLEET_REPO = WORLD.fleet_repo;

/** Run one program in a computer's sandbox; keep what it printed under a step name. */
function run(sb, step, display, program, args, opts) {
  const o = opts || {};
  const r = spawnSync(program, args, {
    cwd: o.cwd || sb.hub, env: Object.assign({}, sb.env, o.env || {}), encoding: 'utf8',
    timeout: o.timeout || 300000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out = `${r.stdout || ''}${r.stderr ? `\n${r.stderr}` : ''}`.replace(/\r\n/g, '\n').replace(/\s+$/, '');
  fs.mkdirSync(path.join(sb.root, 'capture-log'), { recursive: true });
  fs.writeFileSync(path.join(sb.root, 'capture-log', `${step}.json`), JSON.stringify({ step, display, code: r.status, out }, null, 2), 'utf8');
  say(`${sb.name} ${step}: exit ${r.status}${r.error ? ` (${r.error.message})` : ''}; ${out.split('\n').filter(Boolean).pop() || ''}`);
  if (r.status !== 0 && !o.mayFail) throw new Stop(1, `${sb.name} ${step} failed (exit ${r.status}). Its output is in ${path.join(sb.root, 'capture-log', `${step}.json`)}.`);
  return { code: r.status, out };
}

const node = (sb, step, display, script, args, opts) => run(sb, step, display, process.execPath, [script].concat(args), opts);
const tool = (sb, rel) => path.join(sb.workspace, ...rel.split('/'));

/**
 * A command line as a person types it: an argument with a space or a quote goes in quotes. What is
 * shown leaves out only --hub <sandbox Hub>: every command runs in that Hub, where the tools find it
 * by themselves.
 */
const shown = (prog, args) => [prog].concat(args.map((a) => (/[\s"]/.test(a) ? JSON.stringify(a) : a))).join(' ');

/** Each of our agents, installed on DESK by its key (capture/terminal.js shows these same commands). */
const INSTALL_AGENT = (a) => [a.key, '--port', String(a.port), '--yes'];
const INSTALL_SHOWN = 'node 50-AI\\workspace\\agents\\bin\\install-agent.js';

/** Build your own, in Alex's own words: new-agent's plan only (capture/terminal.js shows this same command). */
const NEW_AGENT = [WORLD.new_agent.key, '--name', WORLD.new_agent.name, '--title', WORLD.new_agent.title, '--dry-run'];
const NEW_AGENT_SHOWN = 'node 50-AI\\workspace\\agents\\bin\\new-agent.js';

/** The handoff DESK writes to MINI (capture/terminal.js shows this same command). */
const HANDOFF = ['handoff', '--to', 'MINI', 'Build GP-04 frost dates',
  '--body', 'The plan is in work order GP-04. Next: the frost date lookup and its tests. Check: the calendar shows the first and last frost for the garden.',
  '--repo', 'garden-planner', '--branch', 'gp-04-frost-dates'];

/* ------------------------------------------------------------------ install */

function prepare(all, gh) {
  for (const sb of all) {
    for (const d of [sb.home, path.join(sb.home, 'AppData', 'Roaming'), path.join(sb.home, 'AppData', 'Local'), sb.claude, sb.tmp, sb.downloads]) {
      fs.mkdirSync(d, { recursive: true });
    }
  }
  const dest = path.join(all[0].github, 'fake-gh');
  fs.mkdirSync(dest, { recursive: true });
  for (const f of ['gh.cmd', 'gh.js']) {
    const from = path.join(gh, f);
    if (!fs.existsSync(from)) throw new Stop(2, `--gh ${gh} has no ${f}.`);
    if (!fs.existsSync(path.join(dest, f))) fs.copyFileSync(from, path.join(dest, f));
  }
}

function installArgs(c) {
  const a = ['--yes', '--machine', c.name, '--role', c.role, '--owner', WORLD.person, '--office-port', String(c.office_port), '--no-start'];
  return a.concat(c.hub ? ['--fleet', 'create', '--create-repo'] : ['--fleet', 'join', '--fleet-repo', FLEET_REPO]);
}

function bootstrap(sb, step, source, ref) {
  const args = installArgs(sb.computer);
  return run(sb, step, `powershell -ExecutionPolicy Bypass -File install.ps1 ${args.join(' ')}`,
    'powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(source, 'install.ps1')].concat(args),
    { cwd: sb.home, env: { WW_HUB: sb.hub, WW_SOURCE: source, WW_REF: ref }, timeout: 600000 });
}

/** What "set up my WorkSpace" would add: the other computers, the office's address, and no Tailscale. */
function configure(sb) {
  const cfg = JSON.parse(fs.readFileSync(sb.config, 'utf8').replace(/^\uFEFF/, ''));
  cfg._video = 'machines, hub_url and tailscale_cli were added by video/capture/install.js, as "set up my WorkSpace" would.';
  cfg.machines = WORLD.computers.map((c) => ({ name: c.name, computer: c.name, hub: !!c.hub, callsigns: c.callsigns }));
  if (!sb.computer.hub) cfg.hub_url = `http://127.0.0.1:${DESK_OFFICE}`;
  cfg.tailscale_cli = path.join(sb.root, 'no-tailscale', 'tailscale.exe');
  fs.writeFileSync(sb.config, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

function install(all, source, ref) {
  for (const sb of all) {
    if (fs.existsSync(path.join(sb.hub, '.hub', 'installed.json'))) { say(`= ${sb.name}: already installed`); continue; }
    if (sb.computer.code_zone !== '20-Coding/Projects') {
      node(sb, 'hub-init', `hub init --code-zone ${sb.computer.code_zone}`, path.join(RIG, 'hub', 'bin', 'hub.js'),
        ['init', '--root', sb.hub, '--machine', sb.name, '--role', sb.computer.role, '--owner', WORLD.person, '--code-zone', sb.computer.code_zone, '--yes'],
        { cwd: sb.home });
    }
    bootstrap(sb, 'install-1', source, ref);
    if (sb.computer.hub) bootstrap(sb, 'install-2', source, ref);
    configure(sb);
  }
}

/* ------------------------------------------------------------------ content */

const hub = (sb, step, args, opts) => node(sb, step, shown('hub', args), tool(sb, 'hub/bin/hub.js'), args.concat(['--root', sb.hub]), opts);
const fleet = (sb, step, args, opts) => node(sb, step, shown('fleet', args), tool(sb, 'fleet/bin/fleet.js'), args.concat(['--hub', sb.hub]), opts);

/** The work-order id whose file name carries this title's words, from the computer's own clone. */
function orderId(sb, words) {
  const slug = words.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  for (const col of ['backlog', 'doing', 'done', 'archive']) {
    const dir = path.join(sb.fleet, 'board', col);
    let names = [];
    try { names = fs.readdirSync(dir); } catch (_) { continue; }
    const hit = names.find((n) => n.toLowerCase().includes(slug));
    if (hit) return hit.replace(/\.md$/, '');
  }
  throw new Stop(1, `${sb.name}: no work order "${words}" on the board.`);
}

function handoffId(sb, words) {
  const slug = words.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  for (const st of ['open', 'taken', 'done']) {
    let names = [];
    try { names = fs.readdirSync(path.join(sb.fleet, 'handoffs', st)); } catch (_) { continue; }
    const hit = names.find((n) => n.toLowerCase().includes(slug));
    if (hit) return hit.replace(/\.md$/, '');
  }
  throw new Stop(1, `${sb.name}: no handoff "${words}".`);
}

function content(all) {
  const [desk, mini, laptop] = all;

  // Projects, in each computer's own code zone.
  for (const [sb, repos] of [[desk, ['garden-planner', 'bakery-site']], [mini, ['garden-planner', 'bakery-site']], [laptop, ['bakery-site']]]) {
    for (const r of repos) {
      if (fs.existsSync(path.join(sb.hub, ...sb.computer.code_zone.split('/'), r))) continue;
      hub(sb, `new-project-${r}`, ['new-project', r]);
    }
  }
  // Our agents on DESK, by their keys: each is cloned from its GitHub source (agents/catalog.json),
  // checked, copied in with the skills it needs, and started. Louise first, then Bryn.
  for (const a of WORLD.agents) {
    if (fs.existsSync(path.join(desk.agents, a.key, 'agent.json'))) continue;
    const args = INSTALL_AGENT(a);
    node(desk, `install-agent-${a.key}`, shown(INSTALL_SHOWN, args), tool(desk, 'agents/bin/install-agent.js'), args.concat(['--hub', desk.hub]));
  }
  // Build your own: the plan new-agent shows for Alex's own agent. A dry run: nothing is written.
  node(desk, 'new-agent', shown(NEW_AGENT_SHOWN, NEW_AGENT),
    tool(desk, 'agents/bin/new-agent.js'), NEW_AGENT.concat(['--hub', desk.hub]));

  // Two rows in plain English, the way a person adds their own (hub/templates/nav.json says how).
  const navFile = path.join(desk.hub, '.hub', 'nav.json');
  const nav = JSON.parse(fs.readFileSync(navFile, 'utf8').replace(/^\uFEFF/, ''));
  const mine = [
    { say: ['the garden planner', 'the vegetable app'], path: '20-Coding/Projects/garden-planner/' },
    { say: ['the bakery website', 'the bakery'], path: '20-Coding/Projects/bakery-site/' },
  ];
  for (const row of mine) if (!nav.rows.some((x) => x.path === row.path)) nav.rows.push(row);
  fs.writeFileSync(navFile, JSON.stringify(nav, null, 2) + '\n', 'utf8');
  node(desk, 'nav', 'node 50-AI\\workspace\\hub\\bin\\hub.js nav', tool(desk, 'hub/bin/hub.js'), ['nav', '--root', desk.hub]);

  // The fleet: the board, notes, a handoff from DESK to MINI, and the syncs that carry them.
  if (fs.existsSync(path.join(desk.root, 'capture-log', 'handoff.json'))) { say('= the fleet already has its week'); return; }
  const orders = [
    ['GP-03 Watering reminders', 'DESK'], ['GP-04 Frost dates on the calendar', 'MINI'], ['GP-05 Seed spacing guide', null],
    ['BS-02 Menu photos', 'MINI'], ['BS-03 About page', 'LAPTOP'],
  ];
  orders.forEach(([title, who], i) => fleet(desk, `board-add-${i}`, ['board', '--add', title].concat(who ? ['--for', who] : [])));
  const gp03 = orderId(desk, 'GP-03');
  fleet(desk, 'claim-gp03', ['claim', gp03]);
  fleet(desk, 'finish-gp03', ['finish', gp03, '--branch', 'gp-03-watering']);
  fleet(desk, 'post-desk', ['post', 'Planned GP-04: frost dates on the calendar.']);
  fleet(desk, 'handoff', HANDOFF);

  fleet(mini, 'sync-1', ['sync']);
  fleet(mini, 'pickup-list', ['pickup']);
  const ho = handoffId(mini, 'build-gp-04');
  fleet(mini, 'pickup', ['pickup', ho]);
  fleet(mini, 'claim-gp04', ['claim', orderId(mini, 'GP-04')]);
  fleet(mini, 'claim-bs02', ['claim', orderId(mini, 'BS-02')]);
  fleet(mini, 'post-mini', ['post', 'Took the frost dates handoff. Building GP-04 on gp-04-frost-dates.']);
  fleet(mini, 'sync-2', ['sync']);

  fleet(laptop, 'sync-1', ['sync']);
  fleet(laptop, 'claim-bs03', ['claim', orderId(laptop, 'BS-03')]);
  fleet(laptop, 'post-laptop', ['post', 'Drafted the About page and pushed bs-03-about-page.']);
  fleet(laptop, 'sync-2', ['sync']);

  fleet(mini, 'post-mini-2', ['post', 'GP-04: the calendar tests pass. Ready for the gate on DESK.']);
  fleet(mini, 'daily-sync', ['sync']);
  fleet(desk, 'sync-1', ['sync']);
  fleet(desk, 'status', ['status']);
}

function live(all) {
  // The others first, so DESK's sync brings in their fresh heartbeats before it reports.
  for (const sb of all.slice(1).concat(all[0])) fleet(sb, 'sync-live', ['sync']);
  fleet(all[0], 'status-live', ['status']);
}

/* -------------------------------------------------------------------- main */

module.exports = { shown, INSTALL_AGENT, INSTALL_SHOWN, NEW_AGENT, NEW_AGENT_SHOWN, HANDOFF };

if (require.main === module) {
  try {
    const base = baseFrom(argv);
    const all = sandboxes(base, idsFrom(argv));
    const only = arg('--only');
    if (!only || only === 'install') {
      const source = arg('--source');
      const ref = arg('--ref');
      const gh = arg('--gh');
      if (!source || !ref || !gh) throw new Stop(2, 'Usage: node capture/install.js --sandboxes <dir> --source <workspace repo> --ref <branch> --gh <folder with gh.cmd and gh.js>');
      prepare(all, path.resolve(gh));
      install(all, path.resolve(source), ref);
    }
    if (!only || only === 'content') content(all);
    if (only === 'live') live(all);
    say('done');
    process.exit(0);
  } catch (e) {
    say(`${e.code === 2 ? 'REFUSED' : 'FAILED'}: ${e.message}`);
    process.exit(e.code === 2 ? 2 : 1);
  }
}
