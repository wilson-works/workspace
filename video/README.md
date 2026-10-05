# The promos and walkthroughs

The WilsonWorks Workspace videos, made with [Remotion](https://www.remotion.dev) from screenshots of
sandbox offices and drawn diagrams. Everything on screen is invented: the person Alex, the computers
DESK, MINI and LAPTOP, the projects `garden-planner` and `bakery-site`, the agents Iris (The Research
Desk) and Quill (The Content Desk), and the tailnet `example-tailnet.ts.net` (`demo-world.json`).

| Composition | What it shows | Length | Size |
|---|---|---|---|
| `PromoWorkspace-16x9`, `PromoWorkspace-9x16` | The Hub, the starter skills, the office floor, the phone, the Agents' wing, and the offer | about 50 s | 1920x1080, 1080x1920 |
| `PromoAgents-16x9`, `PromoAgents-9x16` | Specialist agents: an office of their own, a door into the dashboard, knock for a joke, install ours or build your own | about 43 s | 1920x1080, 1080x1920 |
| `Walkthrough1-WhatItIs` | The Hub's zones and NAV.md, the starter skills, sessions starting from VS Code and the desktop app, the course, the Agents' wing | about 4.5 min | 1920x1080 |
| `Walkthrough2-SeveralComputers` | DESK, MINI and LAPTOP: their roles, their Hubs (the two values that differ), one office floor, agent doors on any computer, the phone over Tailscale | about 2.7 min | 1920x1080 |
| `Walkthrough3-FleetOps` | The private fleet-ops repo, the board, one comms file per computer, a handoff from DESK to MINI, a builder and a gate, the daily sync | about 3.2 min | 1920x1080 |

All 30 fps. `node tools/captions.js --scenes` prints the exact timings.

## Set up

Node 20 or newer. In this folder:

```
npm install
npx remotion browser ensure
```

This installs Remotion, React and `puppeteer-core` into `video/node_modules` (not committed), and
Remotion's own headless Chrome, which both the renders and the screenshots use. To keep the npm
cache off your system drive, set `npm_config_cache` to a folder of your choice first.

`npm run studio` opens Remotion Studio to watch any composition.

## Render

```
node tools/render.js --out <folder>                      all seven, full size
node tools/render.js --out <folder> --video Walkthrough1-WhatItIs
node tools/render.js --out out/drafts --draft --scale 0.5   a quick look
```

Each video is written as the file its script names (`workspace-promo-16x9.mp4`,
`agents-promo-9x16.mp4`, `walkthrough-2-several-computers.mp4` and so on). Renders never go into
git; `out/` is ignored. A full render is refused while any terminal transcript or the starter-skills
list is still a placeholder (`src/data/terminal.json`, `src/data/skills.json`, each marked `draft`):
a placeholder never reaches a published video, and a draft render carries a red DRAFT mark on every
terminal.

## Look at every frame

```
node tools/contact-sheets.js --renders <folder> --out <folder>   3x3 frames, one second apart, per video
node tools/stills.js --scenes                                     one frame per caption line, no render needed
node tools/contact-sheets.js --images out/stills/<video> --out <folder>
node tools/captions.js                                            every caption line, with its time
```

Remotion's bundled ffmpeg pulls the frames; it has no tile filter, so the sheets are laid out by the
same headless Chrome. `tools/captions.js` also flags any phrase the release scan refuses.

## Where the screenshots come from

`public/shots/` holds the screenshots and `public/shots/manifest.json` the boxes the camera zooms
into (each desk by callsign, each agent's office and door, the panels). They are committed, because
they are invented data. They are taken from this repository's own office, run in sandboxes:

```
node capture/stage.js up    --sandboxes <scratch folder>
node capture/shoot.js       --sandboxes <scratch folder>
node capture/stage.js down  --sandboxes <scratch folder>
```

- **The sandboxes.** `ws-fresh-v1` (DESK), `ws-fresh-v2` (MINI) and `ws-fresh-v3` (LAPTOP) under the
  folder you name. Each has a fake home: `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`,
  `CLAUDE_CONFIG_DIR` and `WORKSPACE_HOME` all point inside it, and `COMPUTERNAME` is the invented
  name, so nothing reads the real computer, its Claude folder or a real office.
- **The day.** `capture/seed.js` writes Claude Code transcript metadata (a generated title, tool
  names with their one-line summaries, a model id, folders and branches), the hook event stream, the
  callsign book, two owner questions, a delivered note and course progress, in the shapes the office
  reads. No prompt, file or message text exists anywhere.
- **The office.** `capture/stage.js` starts the DESK office from this repo's server on port 4461 (the
  DESK's settings are the repo root's `workspace.config.json`, written only if you have none; a file
  of your own is refused, never replaced), Iris's and Quill's stand-in dashboards on 7660 and 7661, and
  the MINI and LAPTOP forwarders, which post their floors to the DESK office every 15 seconds the way a
  second computer does over the tailnet. It never uses port 4316, the office's default. `down` stops
  exactly the programs it started, by their recorded process ids.
- **The shots.** `capture/shoot.js` drives Remotion's headless Chrome with its own throwaway profile,
  re-seeds the day so every desk is live, and refuses to keep a shot whose page shows this computer's
  name, user name or the sandbox folder.
- **Terminal scenes** show real output from a sandbox run, with the sandbox folder written as Alex's
  own (`C:\Users\alex`), recorded in `src/data/terminal.json`.

## How the source is laid out

| | |
|---|---|
| `src/brand.jsx` | The WilsonWorks colours (`--ww-accent #7C3AED`, the purple orb), Inter and JetBrains Mono, and the caption band's size per format |
| `src/scripts/` | One caption script per video: its scenes, and every caption line |
| `src/Video.jsx` | Plays a script: scenes crossfade, the caption band sits over everything |
| `src/components/Caption.jsx` | The fixed caption band: same place in every frame, big, rises in from below, stays for the whole line |
| `src/components/Shot.jsx` | A screenshot in a browser, phone or card frame, with a camera that moves between named parts |
| `src/components/Cursor.jsx` | The pointer, tap and glow from the `create-onboarding-video` skill: the pointer fades in at the centre and glides straight to every tap |
| `src/components/AppWindow.jsx` | VS Code and the desktop app, drawn as simple stylised windows |
| `src/diagrams/` | The drawn diagrams: zones, NAV.md, the three computers, the mesh, the fleet repo, the board, comms, a handoff, the daily sync |
| `src/data/` | The Hub's zones and rules in plain words, the starter skills, the terminal transcripts |
| `capture/` | The sandbox stage, the seeder and the screenshot script |
| `tools/` | Render, stills, contact sheets, captions |

## Licence

The source here is MIT, like the rest of the repository. Remotion itself is free for individuals and
small teams; larger companies need a Remotion company licence (see remotion.dev/license).
