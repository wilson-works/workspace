# 4. Make it yours: every setting

The quickest way to change anything here is to ask Claude in a chat opened on the WorkSpace folder.
`prompts/README.md` has a prompt for each change. This guide says what each setting does, so you
know what to ask for.

## Your settings: `workspace.config.json`

Written by "set up my WorkSpace", from the template `workspace.config.example.json`. It stays on your
computer (it is in `.gitignore`). Changes show on the page within seconds, except `machines`, which
needs `node bin/office-start.js --restart`.

| Setting | What it does | Example |
|---|---|---|
| `use` | `personal` or `company`. The setup interview asks fewer questions for personal use. | `"company"` |
| `owner.name` | What sessions call you: "Sam answered your question", "A note from Sam". It also fills "(Update with user name)" in the CTO's file when you install the org. | `"Sam"` |
| `brand.office_name` | The name in the bar, the browser tab, the Home Screen icon and the phone buzz. | `"The Workshop"` |
| `brand.company` | Shown next to the office name. | `"Example Co."` |
| `brand.colors` | The orb's two colours, light then dark. They also tint the course's "Next up" card. | `["#34D399", "#047857"]` |
| `brand.logo` | An .svg or .png that replaces the orb in the bar and the browser tab. Keep it in `brand/` (not committed). | `"brand/logo.svg"` |
| `machines` | Your computers: short `name`, the computer's own name in `computer`, one `hub`, optional `callsigns` pool. [Guide 2](02-tailscale.md). | |
| `hub_url` | The hub's tailnet address. | `"https://desk.tail1234.ts.net"` |
| `code_roots` | Folders that hold your code repos. A session inside one sits in that repo's room on the floor, and the office reads each repo's org messages. | `["C:\\Users\\sam\\code"]` |
| `work_folders` | Extra folders whose project folders show on the Work page. Good for private work you want outside this repo. | `["D:\\Work\\projects"]` |
| `privacy.private_work` | Folders (or words in folder names) whose sessions never show a title, task or summary on the office or the phone. | `["clients", "C:\\Users\\sam\\tax"]` |
| `privacy.never_read` | Folders the office never reads, which `install.js permissions` turns into deny rules for every session. | `["C:\\Users\\other-person"]` |
| `tailscale_cli` | Where the Tailscale command is, if it is not in the usual place. | |

## The logo and the Home Screen icons

`brand.logo` changes the bar and the browser tab at once. The Home Screen icons (`public/icon-*.png`)
are pictures made from `public/favicon.svg`. To make them from your own mark: put your SVG at
`public/favicon.svg`, install the renderer outside this folder
(`npm install --no-save @resvg/resvg-js@2` in any empty folder), then run
`node tools/render-icons.mjs --resvg <that folder>` and `npm run build`. The prompt library has
this as one prompt.

## The office's own config files: `config/`

These are part of the WorkSpace and tracked by git, so a change here is yours to keep or share.

| File | What it holds |
|---|---|
| `config/org-people.json` | The org roster the office uses to name sessions, the gate (the last check before code reaches main), and run lanes. A session launched with `WORKSPACE_SEAT=cto-james` shows as "James-1-<what it is doing>". Add every agent you create here. |
| `config/agents.json` | The Agents' wing: an office per specialist, in its colours, with a door into its dashboard (`door.local` on its machine, `door.phone` once published on your tailnet), and a probe that tells the office whether it is running (a port on its own machine, or its tailnet address so every machine and the phone can tell). The door stands open while it works and shows zzz while it rests; right-click to knock and it answers with one of its `jokes`; `art` puts a full figure inside the door. A bubble by its door counts the questions its sessions have asked you, and "Talk to" opens its busiest desk. Ships with one placeholder office for the specialist you build in lesson GS-09. |
| `config/callsigns.json` | The session-name pools (trees, stars, rivers). Add a pool and name it on a machine. |
| `config/avatars.json` | `retired`: emblems never handed out again (see them all at `#/avatars` on the office). `family_frames`: the frame for each model family, so you can tell Opus from Sonnet at a glance. |
| `config/plain-names.json` | Brand names that look like code (iPhone, YouTube) but are plain English, so owner questions using them are not refused. Add your products. |
| `config/thresholds.json` | Timings: when a desk counts as idle or stale, how often the page refreshes, how long a waiter waits, the idle nudge text. |

## The Work page: your own projects

A project is a folder in `projects/` (or in a `work_folders` folder) with a `PROJECT.md` and a
`steps/` folder of numbered Markdown files. `projects/README.md` has the format. Use `kind: course`
for a set of lessons and `kind: project` for work orders. Your own project folders are kept out of
git by `.gitignore`; only the two that ship are tracked.

Mark progress on the page, or `node bin/work.js mark <project> <step-id> <todo|doing|done>`.
Progress is kept in the office's own folder, never written into the project.

## The page itself

The page is React, in `src/ui/`. `office.css` holds the whole look (colours are variables at the
top, light and dark). After a change: `npm install` once, then `npm run build`, and reload the page.
`dist/` is committed so your other computers get the change by pulling.

## Keeping up to date

`git pull` in the WorkSpace folder brings the newest version. Your `workspace.config.json`, `brand/`
and your own projects are never touched by a pull. If you changed tracked files (like
`config/org-people.json`), git merges them or tells you where it could not.
