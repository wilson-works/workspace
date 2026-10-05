# 6. Your Hub

The Hub is one folder on each of your computers that holds all your work: your code, your business
documents, your media, your AI tools. It is split into numbered **zones**, and it carries a short set
of rules, so Claude always knows where things go and never has to guess or go looking.

The installer made yours. This guide explains what is in it and how to keep it tidy.

## The zones

Every Hub has the same zones, with the same names and numbers, on every computer.

| Zone | What goes in it | For example |
|---|---|---|
| `00-Inbox` | The landing place for downloads and anything not yet sorted. Emptied every week. Nothing lives here. | a PDF you just downloaded |
| `10-Business` | One folder per company or client: its documents, never its code. | `10-Business/ExampleCo/Contracts` |
| `20-Coding` | `Projects/` holds one full copy (a git clone) of each code project. `_Caches/` holds package caches. | `20-Coding/Projects/my-app` |
| `30-Media` | The media library: `<Company>/Events`, `Shoots`, `Brand`, `Posts`. New media comes in through `_Ingest/`. | `30-Media/ExampleCo/Brand/logo.svg` |
| `40-Personal` | Your personal documents and media. | `40-Personal/Health` |
| `50-AI` | The Workspace (`workspace/`), the skills pack (`claude_skills/`), your agents (`agents/`), the fleet repo (`fleet-ops/`). | `50-AI/agents/research-desk` |
| `90-Archive` | Cold storage. `_DumpQueue/` holds what is waiting for your yes before it is deleted. | last year's finished projects |

Next to the zones sit three things the Hub itself uses:

| | |
|---|---|
| `CLAUDE.md` | The Hub's **constitution**: the rules every session opened on the Hub reads first. |
| `NAV.md` | The **map**: plain English on one side, the folder on the other. |
| `.hub/` | This computer's marker (`hub.json`), the map's rows (`nav.json`) and the installer's record (`installed.json`). |

## The rules

Your Hub's `CLAUDE.md` gives every session the same few rules. They are written for Claude, but they
are worth knowing yourself.

1. **Copy, verify, then delete.** Nothing is deleted until it has been copied to where it belongs,
   the copy has been checked, and you have said yes. Anything waiting for that yes sits in
   `90-Archive/_DumpQueue`.
2. **Reality wins.** If a plan or a document says one thing and the computer shows another (a path,
   a name, an installed tool), Claude goes by the computer and notes the difference in one line. It
   never makes up a folder to match a document.
3. **Connectors are read-only until you say otherwise.** A newly connected service (your calendar,
   your email, a design tool) is used to read, not to write, send, publish or delete, until you
   allow writing for that one service, and the reason is written down.
4. **Never crawl the Hub.** A session never searches the whole Hub at once: on a full Hub that takes
   minutes and stalls everything else. It reads `NAV.md`, then searches inside one zone or one
   project.
5. **Code goes through branches.** `main` is the version people use. Work happens on a branch, comes
   back through a pull request, and the branch is deleted after it merges. Nothing is committed to
   `main` directly. Before a folder goes to GitHub for the first time, it is checked for passwords,
   keys and private details. No automated GitHub workflow runs on every push (they burn your free
   minutes fast); checks run on pull requests and on `main` only.

And two habits that keep it tidy:

- **No "sort it later" folders.** Every file goes to its real zone the day it arrives. If its home is
  truly unknown, it goes to `00-Inbox`, and the inbox is emptied every week.
- **Names without spaces.** `PascalCase` for folders (`ExampleCo`), `kebab-case` for code projects
  (`my-app`), and dates written `YYYY-MM-DD` at the start of a file name (`2026-10-05-notes.md`).

## The map: NAV.md

`NAV.md` answers "where does this go?" in plain English. It has three parts:

- a table: **"You say"** on the left ("my invoices", "the logo", "the app"), **"It lives in"** on
  the right (the folder);
- the zone tree, two levels deep, as it is on disk;
- your code projects, one line each.

The table's rows are kept in `.hub/nav.json`, which is yours to edit. The rest is read from the disk.
Rebuild the map after you add a zone folder or a project, or change a row. In a chat on your Hub:

```
Regenerate my NAV.md with node 50-AI/workspace/hub/bin/hub.js nav --root . and tell me what changed.
```

To add a row, ask in plain words:

```
Add a row to my Hub's map: when I say "receipts", it means 10-Business/ExampleCo/Receipts. Put it in
.hub/nav.json, regenerate NAV.md, and show me the new line.
```

## Where projects live

- Every code project is a full git clone in the **code zone**, `20-Coding/Projects/<project>`. Never
  beside it, never somewhere else on the computer.
- A project's business files (its contracts, its invoices, its marketing) live in
  `10-Business/<Company>`, never in the code folder.
- Each project has its own `CLAUDE.md`: what the project is, how to run it and check it, and its own
  rules. Keep it short: a page a new session can read in a minute. The `claude-md-doctor` skill
  keeps it that way.

Start a project with the Hub's own tool, so it lands in the right place with its `CLAUDE.md`:

```
Start a new project in my Hub called <my-project> with node 50-AI/workspace/hub/bin/hub.js new-project
<my-project>. Show me the plan, wait for my yes, then regenerate NAV.md.
```

To find your way inside a project, ask for a map of it: the `systems-map` skill draws its parts and
what depends on what.

## The two things that differ from one computer to the next

Every computer's Hub has the same zones. Exactly two things may differ:

| | Example: the desktop | Example: the laptop |
|---|---|---|
| **The Hub root** (where the Hub folder is) | `F:\Hub` (a second drive) | `C:\Users\alex\Hub` or `/Users/alex/Hub` |
| **The code zone** | `20-Coding/Projects` | `20-Coding/Active` (a small computer that keeps only the projects it is working on) |

Both are written in that computer's `.hub/hub.json`. No script, skill or agent ever writes either
one into itself. They find them each time they run: first `HUB_ROOT` if you set it, then by walking
up from the folder they are in, then by looking in the usual places (every drive's `\Hub` on Windows;
`~/Hub` and each disk's `Hub` on a Mac). If they find nothing, they stop and say where they looked,
rather than carrying on in the wrong place.

So the Hub can live on any drive, and you can move it: move the folder, then run the installer again
from `<new place>/50-AI/workspace` so the office's connection points at the new place.

## Keeping it tidy

The `file-organizer` skill sorts a messy folder into the zones. It always shows the plan first and
never deletes:

```
Use the file-organizer skill on my Downloads folder. Sort what is there into my Hub's zones,
following NAV.md. Show me the whole plan first and move nothing until I say yes.
```

Once a week, ask a session to empty `00-Inbox` the same way.

## If something's off

- **A session searched the whole Hub and everything slowed down.** Remind it of rule 4: "Read NAV.md
  first, then search only inside the zone you need." If it keeps happening, ask Claude to make the
  rule more prominent in your `CLAUDE.md`, using the `claude-md-doctor` skill.
- **"No Hub found".** The folder has no `.hub/hub.json`. Run the installer again, or set `HUB_ROOT`
  to your Hub folder.
- **NAV.md is out of date.** Regenerate it (above). It is rebuilt from the disk, so it can't drift
  for long.
- **A project ended up in the wrong place.** Ask Claude to move it into the code zone, copy first,
  check the copy, and only then remove the old one, after your yes.
