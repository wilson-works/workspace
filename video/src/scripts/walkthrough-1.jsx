// walkthrough-1.js — Walkthrough 1, "What it is" (about 4 min): the Hub's zones and NAV.md, the
// starter skills, the office floor as sessions start from VS Code and from the desktop app, the
// course, and the Agents' wing. A caption on every frame.

import { chapter, term } from './helpers';

export default {
  id: 'Walkthrough1-WhatItIs',
  out: 'walkthrough-1-what-it-is.mp4',
  width: 1920,
  height: 1080,
  scenes: [
    {
      scene: 'title', chapter: 'Walkthrough 1 of 3',
      props: { kicker: 'Walkthrough 1 of 3', title: 'What it is', sub: 'The WilsonWorks Workspace' },
      lines: ['This is the WilsonWorks Workspace.', 'It gives your Claude Code sessions a home, a map and an office.'],
    },
    {
      scene: 'three', hl: ['all', 0, 1, 2],
      lines: [
        'It has three parts that install together.',
        'The Hub: one folder where all your work lives.',
        'The skills: ready-made instructions for common jobs.',
        'The office: a live view of every session at work.',
      ],
    },

    chapter(1, 'The Hub', 'Part one: the Hub.'),
    {
      scene: 'zones', hl: ['root', 'all', 0, 1, 2, [3, 4], 5, 6],
      lines: [
        'The Hub is one folder that holds all your work.',
        'Inside are seven numbered zones, the same on every computer.',
        '00-Inbox is where new things land. It is emptied every week.',
        '10-Business holds one folder for each company or client.',
        '20-Coding holds your code projects, one folder each.',
        '30-Media is photos and video. 40-Personal is just yours.',
        '50-AI holds the office, the skills and your agents.',
        '90-Archive is cold storage. Nothing is deleted without your yes.',
      ],
    },
    {
      scene: 'rules', hl: [null, 0, 1, 2, 3],
      lines: [
        "The Hub's CLAUDE.md is a short rule book Claude reads first.",
        'Copy, check, then delete. Nothing is lost by accident.',
        'If a plan and the computer disagree, the computer wins.',
        'Connected apps are read-only until you say otherwise.',
        'Code changes go on a branch, a separate copy, and come back for review.',
      ],
    },
    {
      scene: 'nav', hl: [null, 1, 'rule'],
      lines: [
        'NAV.md is a plain-English map of the Hub.',
        'Say "the bakery website", and Claude knows which folder that is.',
        'Claude follows the map. It never searches the whole Hub.',
      ],
    },
    term('nav', 'After you add things, one command rebuilds the map.'),
    {
      scene: 'project',
      lines: [
        "Each project also has its own CLAUDE.md, with that project's rules.",
        'Open a project, and Claude knows how it runs and how to test it.',
      ],
    },

    chapter(2, 'The starter skills', 'Part two: the starter skills.'),
    {
      scene: 'skills', hl: [null, null, 'pin'],
      lines: [
        'A skill is a set of instructions Claude loads for one kind of job.',
        'The installer adds a starter set from the free WilsonWorks skills pack.',
        'The pack is pinned to one version, so nothing changes under you.',
      ],
    },
    term('install', 'One install command sets up the Hub, the skills and the office.'),
    term('install2', 'Run it again and it changes nothing. It never replaces a file of yours.'),

    chapter(3, 'The office', 'Part three: the office.'),
    {
      scene: 'shot',
      props: { shot: 'floor-desk', keys: [{ at: 0, box: 'full' }, { at: 'c1+0.4', box: 'floor', pad: 6 }] },
      lines: ['The office is a web page that runs on your own computer.', 'Every Claude Code session shows up as a person at a desk.'],
    },
    {
      scene: 'launch', props: { app: 'editor', prompt: 'Plan the frost dates feature for the garden planner.', shot: 'floor-desk', target: 'desk:Cedar' },
      lines: ['Open the Hub in VS Code, and start a Claude Code chat.', 'A new desk appears on the floor within seconds.'],
    },
    {
      scene: 'launch', props: { app: 'desktop', prompt: 'Build the menu page for the bakery website.', shot: 'floor-desk', target: 'desk:Aspen' },
      lines: ['Or start a session from the Claude desktop app, with the Hub as its folder.', 'It shows up on the same floor.'],
    },
    {
      scene: 'shot',
      props: {
        shot: 'floor-desk',
        keys: [{ at: 0, box: 'desk:Cedar', pad: 30 }, { at: 'c2', box: 'floor', pad: 6 }],
        marks: [
          { from: 'c0+0.6', to: 'c1', box: { of: 'desk:Cedar', part: [0, 0.55, 1, 0.25] } },
          { from: 'c1+0.3', to: 'c2', box: { of: 'desk:Cedar', part: [0, 0.78, 1, 0.22] } },
          { from: 'c2+1', to: 'c2+5', box: 'room:Hub', radius: 26 },
        ],
      },
      lines: [
        'Each desk says what its session is doing right now.',
        'Helpers it sends off are listed underneath.',
        'Each project is a room. Quiet sessions wait at the side.',
      ],
    },
    {
      scene: 'shot',
      props: { shot: 'panel-cedar', keys: [{ at: 0, box: 'full' }, { at: 0.8, box: ['panel-head', 'now', 'helpers'], pad: 16 }, { at: 'c1', box: ['thread', 'composer'], pad: 16 }] },
      lines: ['Click a desk to see its recent steps.', 'Send it a note. It gets it at its very next step.'],
    },
    {
      scene: 'shot',
      props: { shot: 'questions', keys: [{ at: 0, box: 'qcard', pad: 24 }], marks: [{ from: 'c1+0.4', to: 'c1+9', box: 'q-actions' }] },
      lines: ['When a session needs you, it asks in plain English.', 'Answer in one tap: go with its advice, let the org decide, or answer yourself.'],
    },

    chapter(4, 'The course', 'Part four: the course.'),
    {
      scene: 'shot',
      props: { shot: 'work-course', keys: [{ at: 0, box: 'full' }, { at: 'c1', box: [28, 600, 1544, 240], pad: 10 }] },
      lines: ['The Work page holds Get started, an eleven-lesson course.', "Each lesson has the prompts to paste. Mark it done when you're done."],
    },

    chapter(5, "The Agents' wing", "Part five: the Agents' wing."),
    {
      scene: 'shot',
      props: { shot: 'agents', keys: [{ at: 0, box: ['office:louise', 'office:bryn'], pad: 30, free: true }, { at: 'c1', box: 'office:louise', pad: 16, free: true }], taps: [{ at: 'c1+2.2', box: 'door:louise' }] },
      lines: [
        'Specialist agents you build or install get an office here.',
        { text: 'Each in its own colours, with a door to its own dashboard.', s: 3.6 },
      ],
    },
    {
      scene: 'shot', props: { shot: 'louise-dashboard', address: "Louise's dashboard, on DESK", title: 'Louise', keys: [{ at: 0, box: 'full' }, { at: 'c2', box: 'scene', pad: 40, dur: 1.4 }] },
      lines: [
        { text: 'Each in its own colours, with a door to its own dashboard.', s: 3.4 },
        'On her page, ask Louise to look something up, or what you already have.',
        'Louise, our research librarian, is free: install-agent louise.',
      ],
    },
    {
      scene: 'shot', props: { shot: 'bryn-dashboard', address: "Bryn's dashboard, on DESK", title: 'Bryn', keys: [{ at: 0, box: 'full' }, { at: 'c1', box: 'scene', pad: 40, dur: 1.4 }] },
      lines: ['Bryn, our trail guide for decisions, is free too: install-agent bryn.', 'Walkthrough 2 shows a door opening from any computer, and your phone.'],
    },

    {
      scene: 'offer', chapter: 'WilsonWorks Workspace', hl: ['all', 'free', 'free', 'paid', 'all'],
      lines: [
        "That's the Workspace: a Hub, starter skills and an office.",
        "It's free to set up yourself, from github.com/wilson-works/workspace.",
        'Or open an empty Hub folder in Claude Code, and Claude sets it up with you.',
        'Or have WilsonWorks set it up for you, with agents built for your work.',
        'Next: one office across several computers.',
      ],
    },
  ],
};
