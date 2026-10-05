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

/** NAV.md, as Alex's map reads: what you say, and the folder Claude opens. */
export const NAV = [
  { say: 'the garden planner', path: '20-Coding/Projects/garden-planner' },
  { say: 'the bakery website', path: '20-Coding/Projects/bakery-site' },
  { say: 'new photos to sort', path: '30-Media/_Ingest' },
  { say: 'my agents', path: '50-AI/agents' },
  { say: 'anything new', path: '00-Inbox' },
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

/** Work orders on Alex's board. */
export const ORDERS = [
  { id: 'GP-03', title: 'Watering reminders', col: 'done' },
  { id: 'GP-04', title: 'Frost dates on the calendar', col: 'backlog', moves: true },
  { id: 'GP-05', title: 'Seed spacing guide', col: 'backlog' },
  { id: 'BS-02', title: 'Menu photos', col: 'doing' },
  { id: 'BS-03', title: 'About page', col: 'doing' },
  { id: 'BS-01', title: 'Opening hours', col: 'done' },
];

/** What each computer has said in its own comms file. */
export const COMMS = {
  DESK: ['09:02 Planned GP-04 frost dates.', '09:04 Handoff H-007 to MINI.', '15:40 Gate passed GP-04. Merged.'],
  MINI: ['09:15 Took H-007. Building GP-04.', '11:30 Tests pass on gp-04-frost-dates.', '11:31 Ready for the gate.'],
  LAPTOP: ['08:10 Drafted the About page.', '08:12 Pushed bs-03-about-page.', '18:05 Back on DESK tomorrow.'],
};

export const REPO_URL = WORLD.repo;
