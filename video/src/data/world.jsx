// world.js — what the diagrams draw: the invented world (demo-world.json) and the Hub's shape, in
// plain words. Nothing here is a real person, computer, path, business or agent.

import WORLD from '../../demo-world.json';
import SKILLS from './skills.json';

export { WORLD, SKILLS };

export const ROLE_WORD = { command: 'Command', builder: 'Builder', mobile: 'Mobile' };

/** The seven zones, the same on every computer, each with one plain line. */
export const ZONES = [
  { dir: '00-Inbox', line: 'New things land here. Emptied every week.' },
  { dir: '10-Business', line: 'One folder per company or client.' },
  { dir: '20-Coding', line: 'Your code projects, one folder each.' },
  { dir: '30-Media', line: 'Photos, video and brand files.' },
  { dir: '40-Personal', line: 'Just yours.' },
  { dir: '50-AI', line: 'The office, the skills and your agents.' },
  { dir: '90-Archive', line: 'Cold storage. Deleted only with your yes.' },
];

/** NAV.md, as Alex's map reads on DESK (rows from the installed sandbox's own NAV.md). */
export const NAV = [
  { say: 'the garden planner', path: '20-Coding/Projects/garden-planner/' },
  { say: 'the bakery website', path: '20-Coding/Projects/bakery-site/' },
  { say: 'stuff to sort', path: '00-Inbox/' },
  { say: 'new media', path: '30-Media/_Ingest/' },
  { say: 'Louise', path: '50-AI/agents/louise/' },
];

/** The constitution's core rules, as the Hub's CLAUDE.md states them, in plain words. */
export const RULES = [
  { head: 'Copy, check, then delete.', line: 'Nothing is removed until a copy is safe.' },
  { head: 'Reality wins.', line: 'If a plan and the computer disagree, go by the computer.' },
  { head: 'Connected apps are read-only.', line: 'Writing through one needs your yes first.' },
  { head: 'Code goes on a branch.', line: 'Changes come back for review before they join the main copy.' },
];

/** A project's own CLAUDE.md, for the garden planner. */
export const PROJECT_RULES = [
  'What this project is for',
  'How to run it, and how to test it',
  'Where its parts live',
  'Its own rules, on top of the Hub\'s',
];

/** The fleet repo, as every computer's copy holds it (docs/ARCHITECTURE.md, "The fleet repo"). */
export const FLEET_TREE = [
  { name: 'fleet.json', note: 'marks the folder as your fleet', depth: 0, file: true, key: 'marker' },
  { name: 'machines/', note: 'one file per computer: its name, role and Hub', depth: 0, key: 'machines' },
  { name: 'DESK.json  MINI.json  LAPTOP.json', depth: 1, file: true, key: 'machines' },
  { name: 'heartbeats/', note: 'when each computer last checked in', depth: 0, key: 'heartbeats' },
  { name: 'board/', note: 'work orders: backlog, doing, done', depth: 0, key: 'board' },
  { name: 'comms/', note: 'one file per computer, only it writes there', depth: 0, key: 'comms' },
  { name: 'handoffs/', note: 'work passed from one computer to another', depth: 0, key: 'handoffs' },
  { name: 'templates/', note: 'a blank work order, handoff and comms entry', depth: 0, key: 'templates' },
];

/** Work orders on Alex's board, as the sandbox fleet's board holds them. GP-04 moves: MINI claims it. */
export const ORDERS = [
  { id: 'GP-03', title: 'Watering reminders', col: 'done' },
  { id: 'GP-04', title: 'Frost dates on the calendar', col: 'backlog', moves: true, file: 'WO-20261005-gp-04-frost-dates-on-the-calendar.md' },
  { id: 'GP-05', title: 'Seed spacing guide', col: 'backlog' },
  { id: 'BS-02', title: 'Menu photos', col: 'doing' },
  { id: 'BS-03', title: 'About page', col: 'doing' },
];

/** What each computer wrote in its own comms file (the sandbox fleet's comms/, times in CDT). */
export const COMMS = {
  DESK: ['22:53 Joined the fleet as command.', '22:54 Planned GP-04: frost dates on the calendar.'],
  MINI: ['22:54 Joined the fleet as builder.', '22:55 Took the frost dates handoff. Building GP-04 on gp-04-frost-dates.', '22:55 GP-04: the calendar tests pass. Ready for the gate on DESK.'],
  LAPTOP: ['22:54 Joined the fleet as mobile.', '22:55 Drafted the About page and pushed bs-03-about-page.'],
};

/** The handoff DESK wrote to MINI, by its real id. */
export const HANDOFF_ID = 'HO-20261005-2254-DESK-build-gp-04-frost-dates';

export const REPO_URL = WORLD.repo;
