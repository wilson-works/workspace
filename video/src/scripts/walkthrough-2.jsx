// walkthrough-2.js — Walkthrough 2, "Several computers" (about 4 min): one fleet across a desktop
// (DESK, command), a mini PC (MINI, builder) and a laptop (LAPTOP, mobile); each computer's own Hub
// and the two values that differ; one office floor for all three; agent doors on any computer; the
// phone over Tailscale. A caption on every frame.

import { chapter, term } from './helpers';

export default {
  id: 'Walkthrough2-SeveralComputers',
  out: 'walkthrough-2-several-computers.mp4',
  width: 1920,
  height: 1080,
  scenes: [
    {
      scene: 'title', chapter: 'Walkthrough 2 of 3',
      props: { kicker: 'Walkthrough 2 of 3', title: 'Several computers', sub: 'One office for all of them' },
      lines: ['One person, three computers, one office.', 'Here is how the Workspace runs across all of them.'],
    },

    chapter(1, 'Three computers', 'Part one: three computers, three roles.'),
    {
      scene: 'computers', hl: [0, 1, 2, 'all'],
      lines: [
        'Alex has a desktop called DESK. It plans, reviews and merges finished work.',
        'A mini PC called MINI builds on branches, separate copies of the code, while Alex is away.',
        'A laptop called LAPTOP is for working on the go.',
        'Each one has a role, so they never trip over each other.',
      ],
    },
    {
      scene: 'hubs', hl: [null, 'root', 'code', 'json'],
      lines: [
        'Each computer has its own Hub, with the same seven zones.',
        'Only two things can differ. One: where the Hub is.',
        'Two: the name of its code folder.',
        'Scripts look both up every time. Nothing is hard-coded.',
      ],
    },
    term('fleetJoin', 'Adding a computer is one install: its name, and its role.'),

    chapter(2, 'One office', 'Part two: one office floor.'),
    {
      scene: 'mesh', hl: ['office', 'tailnet', 'feeds', 'private'],
      lines: [
        'DESK runs the office. The other two send it their floor.',
        'They connect over Tailscale, a private network for your own devices.',
        'Every 15 seconds, each one sends what its sessions are doing.',
        'Never what is in them: no prompts, no files, no messages.',
      ],
    },
    {
      scene: 'shot',
      props: {
        shot: 'floor-all',
        keys: [{ at: 0, box: 'full' }, { at: 'c1', box: 'machines', pad: 40 }, { at: 'c1+2.8', box: 'full' }],
        marks: [{ from: 'c0+0.8', to: 'c1', box: 'machines', radius: 22 }],
        taps: [{ at: 'c1+1.6', box: { of: 'machines', part: [0.55, 0, 0.22, 1] } }],
        swaps: [{ at: 'c1+2.1', shot: 'floor-mini' }],
      },
      lines: ['So one floor shows every session on every computer.', 'Pick a computer to see just its sessions.'],
    },
    {
      scene: 'shot',
      props: { shot: 'panel-vega-note', keys: [{ at: 0, box: 'full' }, { at: 0.8, box: ['panel-head', 'now', 'helpers'], pad: 16 }, { at: 'c0+2.4', box: 'composer', pad: 30 }] },
      lines: ['A note you write on DESK reaches a session on MINI.', 'MINI collects it at its next check-in, and hands it over.'],
    },

    chapter(3, 'Agents anywhere', 'Part three: agent doors on any computer.'),
    {
      scene: 'shot',
      props: {
        shot: 'agents',
        keys: [{ at: 0, box: ['office:iris', 'office:quill'], pad: 30, free: true }, { at: 'c2', box: 'office:iris', pad: 70, free: true }],
        labels: [{ box: 'door:iris', text: `opens at desk.example-tailnet.ts.net`, from: 'c2+0.8', to: 'c2+20', below: true, size: 26 }],
      },
      lines: [
        'An agent can run on any of the computers.',
        'Its office still shows on the one floor.',
        'Publish its dashboard on your tailnet, and its door opens from anywhere.',
      ],
    },

    chapter(4, 'Your phone', 'Part four: your phone.'),
    {
      scene: 'mesh', props: { phone: true }, hl: ['phone'],
      lines: ['Your phone joins the same private network.'],
    },
    {
      scene: 'phone', props: { shot: 'phone-floor', address: 'desk.example-tailnet.ts.net' },
      lines: ["Open the office at your desktop's private address.", "Every computer's sessions, wherever you are."],
    },
    {
      scene: 'phone', props: { shot: 'phone-questions', address: 'desk.example-tailnet.ts.net' },
      lines: ['When a session asks you something, your phone buzzes.', 'Answer in one tap, from anywhere.'],
    },
    {
      scene: 'phone', props: { shot: 'phone-agents', address: 'desk.example-tailnet.ts.net' },
      lines: ["The Agents' wing comes with you too."],
    },
    {
      scene: 'mesh', props: { phone: true }, hl: ['private'],
      lines: ['None of it is on the public internet. It stays on your own devices.'],
    },

    {
      scene: 'offer', chapter: 'WilsonWorks Workspace', hl: ['all', 'free', 'all'],
      lines: [
        'One office, every computer, and your phone.',
        'Set it up yourself from github.com/wilson-works/workspace, or have WilsonWorks do it.',
        'Next: how sessions on different computers work together.',
      ],
    },
  ],
};
