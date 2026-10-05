// walkthrough-3.js — Walkthrough 3, "Fleet ops" (about 4 min): the private fleet-ops repo; the
// board; one comms file per computer; a handoff written on DESK and picked up on MINI; a builder
// on MINI and a gate on DESK (nobody grades their own work); the daily sync. A caption on every frame.

import { chapter, term } from './helpers';

export default {
  id: 'Walkthrough3-FleetOps',
  out: 'walkthrough-3-fleet-ops.mp4',
  width: 1920,
  height: 1080,
  scenes: [
    {
      scene: 'title', chapter: 'Walkthrough 3 of 3',
      props: { kicker: 'Walkthrough 3 of 3', title: 'Fleet ops', sub: 'Several computers, one team' },
      lines: [
        'Fleet ops lets sessions on different computers work as one team.',
        'It runs on a private repo: a shared folder on GitHub that keeps every version.',
      ],
    },

    chapter(1, 'The fleet repo', 'Part one: the fleet repo.'),
    {
      scene: 'repo', hl: ['repo', 'private', 'copies', 'sync'],
      lines: [
        'The installer creates the repo on your own GitHub account.',
        'It asks first. The repo is private, and it stays private.',
        'Every computer keeps its own copy, inside its Hub.',
        'Each one pulls to catch up, and pushes to share.',
      ],
    },
    term('fleetInit', 'On the first computer, one command sets it all up.'),
    {
      scene: 'tree', hl: ['machines', 'heartbeats', ['board', 'comms', 'handoffs']],
      lines: [
        'Inside, each computer has a file with its name and its role.',
        'A heartbeat file says when each one last checked in.',
        'And then the board, the comms files and the handoffs.',
      ],
    },

    chapter(2, 'The board', 'Part two: the board.'),
    {
      scene: 'board', hl: [null, 'doing', 'doing'],
      lines: [
        'The board holds work orders, one file each.',
        "A work order's folder is its status: backlog, doing or done.",
        'Moving a card means moving its file, saved as a commit you can look back at.',
      ],
    },

    chapter(3, 'Comms', 'Part three: comms.'),
    {
      scene: 'comms', hl: ['all', 'DESK', 'MINI', 'all'],
      lines: [
        'Each computer has its own comms file, like a logbook.',
        "DESK writes only in DESK's file.",
        "MINI writes only in MINI's.",
        'So two computers never edit the same file at once.',
      ],
    },

    chapter(4, 'A handoff', 'Part four: a handoff.'),
    {
      scene: 'handoff', hl: ['plan', 'open', 'taken', 'done'],
      lines: [
        'On DESK, Alex plans the frost dates feature.',
        'DESK writes a handoff addressed to MINI, and pushes it.',
        "MINI's next sync pulls it, takes it, and starts building.",
        'When the work is ready, MINI marks it done, and says so in its comms.',
      ],
    },
    term('handoff', 'Here is DESK writing that handoff.'),
    term('take', 'And here is MINI taking it.'),

    chapter(5, 'Builder and gate', 'Part five: a builder and a gate.'),
    {
      scene: 'shot',
      props: {
        shot: 'floor-all',
        keys: [{ at: 0, box: 'desk:Vega', pad: 40 }, { at: 'c1', box: 'desk:John-1-Gate', pad: 40 }, { at: 'c2', box: ['desk:Vega', 'desk:John-1-Gate'], pad: 40 }],
        labels: [
          { box: 'desk:Vega', text: 'builder · MINI', from: 0.6, to: 'c1', color: '#15803D' },
          { box: 'desk:John-1-Gate', text: 'gate · DESK', from: 'c1+0.8', to: 'c2', color: '#7C3AED' },
        ],
        marks: [{ from: 'c2+0.8', to: 'c2+9', box: 'desk:Vega' }, { from: 'c2+0.8', to: 'c2+9', box: 'desk:John-1-Gate' }],
      },
      lines: [
        'On MINI, a builder session does the work on its own branch.',
        'On DESK, a gate session checks that work before anything merges.',
        'Nobody grades their own work.',
      ],
    },
    {
      scene: 'board', props: { start: 'doing' }, hl: ['done'],
      lines: ['Only DESK merges. Then the order moves to done.'],
    },

    chapter(6, 'The daily sync', 'Part six: the daily sync.'),
    {
      scene: 'sync', hl: ['clock', 'steps', 'stop', 'os'],
      lines: [
        'Once a day, each computer syncs on its own.',
        'It pulls, writes its heartbeat, and pushes.',
        'It commits only its own files. If anything else changed, it stops and says what.',
        'It runs by itself, on Windows and on a Mac.',
      ],
    },
    term('sync', "This is MINI's daily sync."),

    {
      scene: 'offer', chapter: 'WilsonWorks Workspace', hl: ['all', 'all', 'free', 'paid'],
      lines: [
        'A shared board, a comms file each, handoffs, and a gate.',
        "That's how several computers work as one team.",
        'Set it up yourself from github.com/wilson-works/workspace.',
        'Or have WilsonWorks set it up for you. Get in touch.',
      ],
    },
  ],
};
