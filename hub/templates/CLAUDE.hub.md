# {{machine}}: the Hub constitution

This file is the law for every Claude session opened in this Hub. A project's own CLAUDE.md adds to it and never
contradicts it. Written by `hub init` on {{date}} for {{owner}}.

## This computer

- Name: **{{machine}}**. Role: **{{role}}**.
  - `command`: plans, reviews and merges. Usually the computer the office runs on.
  - `builder`: works on branches while {{owner}} is away. Pushes branches. Never merges.
  - `mobile`: works on the go. Drafts and pushes branches. Heavy work waits for another computer.
- The Hub root is the folder this file is in. Code lives in `{{code_zone}}/`.
- Lost? Read `NAV.md` first. It maps plain English ("my code", "stuff to sort") to paths.

## The zones

| Zone | What goes here |
|---|---|
| `00-Inbox/` | Downloads and anything not sorted yet. Emptied every week. Nothing lives here. |
| `10-Business/` | One folder per company or client (`10-Business/<Company>/`): its documents, never its code. |
| `20-Coding/` | Code. `{{code_zone}}/<repo>/` holds one git clone per project. `_Caches/` holds package caches. |
| `30-Media/` | Photos, video, music, brand files: `30-Media/<Company>/`. New media lands in `30-Media/_Ingest/` first. |
| `40-Personal/` | Personal documents and media. |
| `50-AI/` | The office (`{{workspace}}/`), the skills pack, your agents (`50-AI/agents/<key>/`), `50-AI/fleet-ops/`. |
| `90-Archive/` | Cold storage: read from it, never work in it. `_DumpQueue/` holds what waits for a yes to be deleted. |

Each zone has a README.md that says what goes there, what never does, and one example.

## Rules

1. **Copy, verify, then delete.** Nothing is deleted until it has been copied, the copy has been checked (same file
   count and sizes, or the same hash) and {{owner}} has said yes. Until then it waits in `90-Archive/_DumpQueue/`.
2. **Reality wins.** When a plan or a document disagrees with this computer (a path, a name, an installed tool), use
   what is really there and note the difference in one line. Never create a folder or file just to make a document
   true.
3. **Connectors are read-only until {{owner}} says otherwise.** Before the first write, send, post, publish or delete
   through any connector or MCP server, stop and ask. A connector allowed to write is listed below, with the reason.
4. **Bounded paths.** Never run a recursive search or listing from the Hub root, a drive root or the user folder.
   Read `NAV.md`, then work inside one named zone path.
5. **No dump folders.** Every file lands in its zone home the day it moves. If its home is unknown, it goes to
   `00-Inbox/`, which is emptied every week. Never make `Migration-*`, `_work`, `misc` or "sort later" folders.

## Off-limits folders

No session reads, lists, moves, renames, indexes or deletes anything in these folders. If a task seems to need one,
stop and ask {{owner}}.

- _(none yet: add one full path per line, for example another person's user folder)_

## Connectors allowed to write

- _(none yet: add one line per connector, what it may write, and why)_

## Code rules

- `main` is production. Never commit to `main` directly.
- Work on a feature branch, push it, merge it through a pull request, then delete the branch here and on GitHub.
- Never merge a conflict an AI resolved without reading the result first.
- Before anything is pushed to GitHub for the first time, scan it for secrets (keys, tokens, `.env` files) and for
  personal data. Git history is forever.
- GitHub Actions:
  - No workflow runs on `push` to a feature branch. The only triggers are `pull_request` to `main` and `push` to `main`.
  - Every job has `timeout-minutes` of 15 or less.
  - A workflow that fails its first two runs is switched off (`gh workflow disable`) and fixed. Never re-run it as is.

## Two values differ per computer

Every computer's Hub has the same zones with the same names. Only two values may differ:

- the Hub root (the folder that holds `.hub/hub.json`), and
- the code zone (`code_zone` in `.hub/hub.json`; on this computer, `{{code_zone}}`).

No script hardcodes either one. A script finds the root at run time (the `HUB_ROOT` variable, else by walking up to
`.hub/hub.json`) and reads the code zone from `.hub/hub.json`. If it cannot find them, it stops and says where it looked.

## Where things live

- Code: `{{code_zone}}/<kebab-name>/`, one git repository per project, each with its own short CLAUDE.md. Make one with
  `node {{workspace}}/hub/bin/hub.js new-project <kebab-name>`.
- Business files: `10-Business/<Company>/`. Never in the code tree; and code never in `10-Business/`.
- Agents: `50-AI/agents/<key>/`, each with an `agent.json`. Each one gets an office in the Agents' wing by itself.

## Naming

- No spaces in file or folder names.
- Folders are PascalCase (`GreenThumb`). Repositories are kebab-case (`garden-planner`).
- Dates in file names are `YYYY-MM-DD`, so they sort.

## Navigation

- Read `NAV.md` first. It is generated: to change a row, edit `.hub/nav.json`, then run
  `node {{workspace}}/hub/bin/hub.js nav`.
- Run `hub nav` after adding a project, a company or an agent. Run `hub doctor` to list anything out of place.
- Inside a project, that project's CLAUDE.md adds to this file and never contradicts it.

## The office

- Start it: `node {{workspace}}/bin/office-start.js`. Every session opened on this Hub shows up on its floor.
- Questions for {{owner}} go to the office, in plain English, with your recommendation:
  `node {{workspace}}/bin/ask-owner.js "Plain question?" --recommend "What I would do"`.
- Ask only what this file and the project's CLAUDE.md do not already answer.

## More than one computer

If `50-AI/fleet-ops/CLAUDE.md` exists, this computer is part of a fleet: read that file too. Sync at the start of
every session (`node {{workspace}}/fleet/bin/fleet.js sync`, then `fleet.js status`), and hand work to another
computer with a handoff (`fleet.js handoff --to <NAME> "<title>"`), never by leaving it half done.
