# The promos and walkthroughs

The WilsonWorks Workspace videos, made with [Remotion](https://www.remotion.dev) from screenshots of
sandbox offices and drawn diagrams. Everything on screen is invented: the person Alex, the computers
DESK, MINI and LAPTOP, the projects `garden-planner` and `bakery-site`, the agents Iris (The Research
Desk) and Quill (The Content Desk), and the tailnet `example-tailnet.ts.net` (`demo-world.json`).

| Composition | What it shows | Length | Size |
|---|---|---|---|
| `PromoWorkspace-16x9`, `PromoWorkspace-9x16` | The Hub, the starter skills, the office floor, the phone, the Agents' wing, and the offer | about 50 s | 1920x1080, 1080x1920 |
| `PromoAgents-16x9`, `PromoAgents-9x16` | Specialist agents: an office of their own, a door into the dashboard, knock for a joke, install ours or build your own | about 48 s | 1920x1080, 1080x1920 |
| `Walkthrough1-WhatItIs` | The Hub's zones and NAV.md, the starter skills, sessions starting from VS Code and the desktop app, the course, the Agents' wing | about 4.6 min | 1920x1080 |
| `Walkthrough2-SeveralComputers` | DESK, MINI and LAPTOP: their roles, their Hubs (the two values that differ), one office floor, agent doors on any computer, the phone over Tailscale | about 2.7 min | 1920x1080 |
| `Walkthrough3-FleetOps` | The private fleet-ops repo, the board, one comms file per computer, a handoff from DESK to MINI, a builder and a gate, the daily sync, `fleet status` and the office's Fleet tab | about 3.6 min | 1920x1080 |

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
list is marked `draft` (`src/data/terminal.json`, `src/data/skills.json`): a placeholder never
reaches a published video, and a draft render carries a red DRAFT mark on every such terminal.

## Look at every frame

```
node tools/contact-sheets.js --renders <folder> --out <folder>   3x3 frames, one second apart, per video
node tools/stills.js --scenes                                     one frame per caption line, no render needed
node tools/contact-sheets.js --images <folder of stills> --out <folder>   any stills, nine to a sheet
node tools/captions.js                                            every caption line, with its time
```

Remotion's bundled ffmpeg pulls the frames; it has no tile filter, so the sheets are laid out by the
same headless Chrome. `tools/captions.js` also flags any phrase the release scan refuses.

## Where the screenshots come from

`public/shots/` holds the screenshots and `public/shots/manifest.json` the boxes the camera zooms
into (each desk by callsign, each agent's office and door, the Fleet tab's parts, the panels). They
are committed, because they are invented data. Three sandbox computers are installed the way a
person installs the Workspace, then filmed:

```
node capture/install.js  --sandboxes <scratch folder> --source <workspace repo> --ref <branch> --gh <stand-in gh folder>
node capture/stage.js up --sandboxes <scratch folder>
node capture/install.js  --sandboxes <scratch folder> --only live
node capture/shoot.js    --sandboxes <scratch folder>
node capture/stage.js down --sandboxes <scratch folder>
node capture/terminal.js --sandboxes <scratch folder>
```

- **The sandboxes.** `ws-fresh-v4` (DESK), `ws-fresh-v5` (MINI) and `ws-fresh-v6` (LAPTOP) under the
  folder you name (`--ids` picks others). Each is a whole computer: a fake home (`HOME`,
  `USERPROFILE`, `APPDATA`, `LOCALAPPDATA` and `CLAUDE_CONFIG_DIR` point inside it), its own `Hub`,
  its own temp folder, and `COMPUTERNAME` set to the invented name, with none of the office's
  overrides from your shell, so nothing reads the real computer, its Claude folder or a real office.
  The three share a stand-in GitHub: a fake `gh` first on the path, keeping bare repos in the DESK
  sandbox, so the fleet repo is made and cloned without a real account.
- **The installs.** `capture/install.js` runs the Windows bootstrap, `install.ps1`, on each computer
  with its name, role and office port, `--yes`, and `--fleet create --create-repo` on DESK or
  `--fleet join` on the others; DESK is installed twice, to film the second run changing nothing.
  MINI's Hub is made first with `hub init --code-zone 20-Coding/Active`, the second of the two values
  that differ per computer. The installs run with `--no-start`, and each office's settings get a
  `tailscale_cli` that does not exist: an office started in a sandbox would otherwise ask this
  computer's own Tailscale for its name, and print it. Then it gives the computers a week with the
  product's own commands: projects (`hub new-project`), two plain-English rows and `hub nav`, Iris
  made with `new-agent` and Quill installed with `install-agent`, the fleet board, comms posts, a
  handoff from DESK that MINI picks up, and syncs. Every command's output is kept in
  `<sandbox>/capture-log/`.
- **The day.** `capture/seed.js` writes Claude Code transcript metadata (a generated title, tool
  names with their one-line summaries, a model id, folders and branches), the hook event stream, the
  callsign book, two owner questions, a delivered note and course progress, in the shapes the office
  reads. No prompt, file or message text exists anywhere. It never writes the office's settings.
- **The offices.** `capture/stage.js up` seeds the day, starts the MINI and LAPTOP forwarders (which
  post their floors to the DESK office every 15 seconds, the way a second computer does over the
  tailnet), then starts each computer's own installed office with its `bin/office-start.js`, which
  also opens Iris's and Quill's dashboards. Offices use ports 4461 to 4463 and the dashboards 7660 and
  7661; nothing uses 4316, the office's default. `down` stops exactly the programs that left pid files.
- **The shots.** `capture/shoot.js` drives Remotion's headless Chrome with its own throwaway profile,
  re-seeds the day so every desk is live, and refuses to keep a shot whose page shows this computer's
  name, user name or the sandbox folder.
- **Terminal scenes.** `capture/terminal.js` writes `src/data/terminal.json` from the capture log:
  each line is one the command printed, in order, and a line of its own, `…`, marks where an excerpt
  leaves lines out. The sandbox folder is written as Alex's own (`C:\Users\alex`), and the file is
  refused if any line would still show the sandbox, this computer or a real path.

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
| `capture/` | The sandbox installs, the seeder, the stage, the screenshot script and the terminal transcripts |
| `tools/` | Render, stills, contact sheets, captions |

## Licence

The source here is MIT, like the rest of the repository. Remotion itself is free for individuals and
small teams; larger companies need a Remotion company licence (see remotion.dev/license).
