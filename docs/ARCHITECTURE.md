# How the WilsonWorks Workspace fits together

The Workspace is four things that install as one:

1. **The Hub**: one folder per computer that holds all your work, in numbered zones, with rules
   Claude follows to find its way around (`hub/`).
2. **The starter skills**: a dozen skills from the free [claude_skills](https://github.com/wilson-works/claude_skills)
   pack, pulled at a pinned commit (`skills/starter.json`).
3. **The office**: the virtual office every Claude Code session shows up in, with the course, the
   CTO org and the Agents' wing (the rest of this repo).
4. **The fleet** (optional): your own private `fleet-ops` repo that lets sessions on several
   computers share a board, talk, and hand work to each other (`fleet/`).

Specialist agents plug into all four: each one lives in the Hub, gets an office in the Agents' wing,
and can be handed work through the fleet (`agents/`).

## Why one repo, with the skills pack kept apart

- The office, the Hub template, the agent contract and the fleet template change together: a new
  Hub rule usually means a new line in the constitution template, the guide and the course. One repo
  keeps them in step and gives one version number to support.
- The skills pack is its own public repo with its own release rhythm and its own users. The
  installer pulls it at a **pinned commit** (`skills/starter.json` `ref`), never a copy kept in this
  repo, so nothing drifts. A commit id is used rather than a tag because a tag can be moved and a
  commit cannot; moving the pin is a one-line change here, reviewed like any other.
- Your Hub, your agents and your fleet repo are yours and are never inside this repo. The installer
  writes them; it does not track them.

## What lands on a computer

```
<Hub>/                          your Hub: any drive or folder; found at run time, never hardcoded
  .hub/hub.json                 the marker: this computer's name and role, its code zone, where the office lives
  .hub/nav.json                 the plain-English lookup rows NAV.md is built from (yours to edit)
  .hub/installed.json           what the installer put where, so a second run and a removal know
  .claude/settings.json         the office's hooks: every session opened on the Hub shows on the floor
  .claude/skills/<name>/        the starter skills (or ~/.claude/skills, if you chose that)
  .claude/agents/<key>.md       each specialist agent, so any session can call it
  CLAUDE.md                     the constitution (hub/templates/CLAUDE.hub.md, filled in)
  NAV.md                        generated: plain English to path, the zone tree, the projects
  00-Inbox/ ... 90-Archive/     the zones, each with a short README.md
  20-Coding/Projects/<repo>/    your code projects, each with its own CLAUDE.md
  50-AI/workspace/              this repo: the office, the course, the CTO org, the installer
  50-AI/claude_skills/          the skills pack, checked out at the pinned commit
  50-AI/agents/<key>/           one folder per specialist agent; its agent.json gives it an office
  50-AI/fleet-ops/              your private fleet repo (only with more than one computer)
```

The office keeps its own state (notes, questions, the event log) outside the Hub, in the place
`src/server/home.js` names, or in `office.home` from `workspace.config.json`.

## The two values that differ per computer

Every computer's Hub has the same zones with the same names. Exactly two things can differ:

| | Where it is recorded | How a script finds it |
|---|---|---|
| The Hub root | `.hub/hub.json` exists there | `hub/lib/root.js` `resolveHubRoot()`: `HUB_ROOT`, else walk up from the current folder, else the usual places (every drive's `\Hub` on Windows, `~/Hub` and `/Volumes/*/Hub` on macOS, `~/Hub` on Linux) |
| The code zone | `code_zone` in `.hub/hub.json` | `codeZone(root)`: the recorded value, else `20-Coding/Projects`, else `20-Coding/Active` |

No script may hardcode either one. If neither is found, the script stops and says where it looked.

## Contracts

### `.hub/hub.json`

```json
{ "format": 1, "machine": "DESK", "role": "command", "code_zone": "20-Coding/Projects",
  "workspace": "50-AI/workspace", "owner": "Alex", "created": "2026-10-05" }
```

`role` is one of `command` (plans, reviews and merges; usually the office hub), `builder` (works
branches while you are away; never merges) or `mobile` (on the go: drafts and pushes branches).

### Command-line output

Every tool that changes something prints its plan the same way, one line per item:

| Mark | Meaning |
|---|---|
| `+` | will be added |
| `~` | will be changed |
| `=` | already there, nothing to do |
| `!` | yours is different; kept as it is (the tool says how to replace it) |
| `-` | will be removed |

`--dry-run` prints the plan and writes nothing. Exit codes: `0` done (or plan shown), `1` failed,
`2` refused (bad arguments, or something it will not do). Nothing that belongs to you is
overwritten without a yes; with `--yes`, the answer to "replace your file?" is always no.

### `agent.json` (one per specialist agent, in `50-AI/agents/<key>/`)

The same shape as an entry in `config/agents.json`, plus how to start it:

```json
{
  "key": "iris", "name": "Iris", "title": "The Research Desk",
  "line": "Reads everything on a topic and hands back one page with the sources.",
  "status": "live",
  "door": { "local": "http://127.0.0.1:7601/", "phone": null },
  "probe": { "port": 7601, "path": "/health" },
  "start": "node dashboard/server.js",
  "autostart": true,
  "match": ["iris", "research desk"],
  "brand": { "bg": "#0B1020", "panel": "#16213E", "ink": "#E6EDF7", "accent": "#38BDF8", "accent2": "#818CF8",
             "font": "Inter, system-ui, sans-serif", "mark": "mark.svg" },
  "art": "art.svg",
  "jokes": ["I read the footnotes so you do not have to."]
}
```

- `machine` is left out: the agent runs on the computer it is installed on.
- `probe` must never point at a page that hands out a login or token. `{port, path}` is checked on
  this computer; `{url}` (an `https://*.ts.net` address) is checked from any computer.
- `mark` and `art` are files in the agent's own folder (`.svg` or `.png`); the office serves them.
- The office finds every `agent.json` by itself. Nobody edits `config/agents.json` to add one.

### The fleet repo

One private repo per person, cloned at `<Hub>/50-AI/fleet-ops` on every computer:

```
fleet.json                      the marker: format, created
machines/<NAME>.json            one per computer: name, role, computer, os, hub_root, code_zone, office_hub, joined
heartbeats/<NAME>.json          that computer's last sync
board/backlog|doing|done|archive/<id>.md    one file per work order; its folder is its status
comms/<NAME>.md                 one append-only file per computer
handoffs/open|taken|done/<id>.md            one file per handoff, addressed to a computer
templates/                      work order, handoff and comms entry
```

A computer writes only its own files: its machine file, its heartbeat, its comms file, the work
orders it filed or claimed, and the handoffs it wrote or took. The sync commits only those. If
anything else has changed, it stops and says what, instead of committing it. That is what keeps
several computers from ever editing the same file at once.

## Who changes what

| Folder | What it is |
|---|---|
| `hub/` | the Hub template, its generator (`hub/bin/hub.js`) and the root resolver (`hub/lib/root.js`) |
| `skills/` | the pinned starter set |
| `agents/` | the agent contract, `new-agent`, `install-agent`, the scaffold and a demo package |
| `fleet/` | the fleet repo template and `fleet/bin/fleet.js` |
| `src/`, `bin/`, `config/`, `public/`, `dist/` | the office |
| `org/`, `permissions/` | the CTO org and the permission setup |
| `guides/`, `projects/`, `prompts/` | the guides, the course and the prompt library |
| `video/` | the source of the promos and walkthroughs (renders are not kept in git) |
| `install.js`, `install.ps1`, `install.sh` | the one installer and its bootstrap for a fresh computer |
