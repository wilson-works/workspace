# 7. Several computers working together (the fleet)

Optional. With one computer you can skip this guide.

[Guide 2](02-tailscale.md) puts every computer's sessions on one office floor. A **fleet** goes one
step further: your computers **share work**. A session on your desktop can file a job, a session on
your mini PC can do it overnight, and in the morning a note is waiting for you on your laptop.

They do it through one **private git repo** on your own GitHub account, called `fleet-ops`. Every
computer keeps a copy at `<Hub>/50-AI/fleet-ops`, and once a day each one sends its news and picks
up everyone else's. Nothing goes anywhere but your computers and your private repo.

## Roles

Each computer has one role. It says what the computer is for, so sessions on it know what they may do.

| Role | What it does | For example |
|---|---|---|
| `command` | Plans, reviews and merges. Usually also the office's hub. | **DESK**, the desktop that is on the most |
| `builder` | Works on branches while you are away. Never merges. | **MINI**, a small PC that runs long jobs |
| `mobile` | On the go: drafts, notes, and branches pushed for later. | **LAPTOP** |

## What is in the fleet repo

```
fleet.json                     says "this is a fleet repo"
machines/DESK.json             one file per computer: its name, role, operating system,
machines/MINI.json               where its Hub is and its code zone
heartbeats/DESK.json           when each computer last synced
board/backlog/                 work orders waiting: one file each
board/doing/                   ...being worked on
board/done/                    ...finished
board/archive/                 ...put away
comms/DESK.md                  one running message file per computer: it only ever grows
handoffs/open/                 notes from one computer to another, waiting to be picked up
handoffs/taken/                ...picked up, being worked on
handoffs/done/                 ...finished
templates/                     the shape of a work order, a handoff and a message
```

A work order's folder **is** its status: moving the file from `backlog/` to `doing/` claims it.

**The one rule that keeps it safe:** a computer only ever writes its own files: its machine file,
its heartbeat, its own comms file, the work orders it filed or claimed, and the handoffs it wrote or
took. The sync commits only those. If anything else has changed, it stops and tells you, instead of
committing it. So two computers can never edit the same file at the same time.

Each machine file also records that computer's two per-computer values (where its Hub is, and its
code zone; [guide 6](06-the-hub.md)), so a session on one computer can tell a session on another
exactly where something is on *that* computer.

## Set it up

You need a GitHub account, and GitHub's command line, `gh`, signed in on each computer:
install it from https://cli.github.com, then run `gh auth login` once and follow its questions.

**On your first computer**, run the installer with the fleet part. From
`<your Hub>/50-AI/workspace`:

```
node install.js --fleet create --create-repo
```

It asks before each step. It makes the **private** repo `fleet-ops` on your GitHub account, fills
it with the folders above, puts a copy in `50-AI/fleet-ops`, registers this computer, and offers the
daily sync. The repo stays private: the installer never makes it public.

(Already installed? Run the same line: everything else shows `=`, and only the fleet part runs. If
you'd rather make the repo yourself, leave out `--create-repo`.)

**On each other computer**, install the Workspace the usual way ([guide 1](01-install.md)) and
answer **yes** to "Do you use more than one computer for this?", or say it up front. On Windows:

```
$env:WW_ARGS = '--fleet join --fleet-repo <your GitHub name>/fleet-ops --machine MINI --role builder'
irm https://raw.githubusercontent.com/wilson-works/workspace/main/install.ps1 | iex
```

On a Mac:

```
curl -fsSL https://raw.githubusercontent.com/wilson-works/workspace/main/install.sh | sh -s -- --fleet join --fleet-repo <your GitHub name>/fleet-ops --machine LAPTOP --role mobile
```

It copies the fleet repo into that computer's Hub, registers the computer (its name, role, where its
Hub is, its code zone), starts its comms file, and offers the daily sync.

The fleet's own commands, if you ever want them by hand (from `<your Hub>/50-AI/workspace`):

```
node fleet/bin/fleet.js init [--create-repo]          the first computer
node fleet/bin/fleet.js join <you>/fleet-ops          each other computer (--machine, --role)
node fleet/bin/fleet.js schedule [--remove]           the daily sync, on or off
node fleet/bin/fleet.js sync                          sync now: send yours, get everyone else's
node fleet/bin/fleet.js status                        every computer, its last sync, handoffs waiting for this one
node fleet/bin/fleet.js handoff --to MINI "<title>"   hand work to another computer
node fleet/bin/fleet.js pickup [<id>]                 see the handoffs for this computer, or take one
node fleet/bin/fleet.js board [--add "<title>"]       the board, or a new work order on it
node fleet/bin/fleet.js post "<text>"                 a line in this computer's comms file
node fleet/bin/fleet.js remove                        leave the fleet (your repo stays private and yours)
```

Sessions do not need you to type these: "sync the fleet", "hand this to MINI" or "what is waiting for
this computer?" is enough, because the Hub's CLAUDE.md and the fleet's own CLAUDE.md name them.

## The daily sync

Once a day, each computer pulls the fleet repo, commits its own files, pushes, and writes its
heartbeat (the time it last synced). On Windows it is a task in Task Scheduler; on a Mac, a launch
agent. A computer that is asleep catches up the next time it wakes.

Want the news now, not tomorrow? Ask a session: *"Sync the fleet now and tell me what came in."*

## Handing work to another computer

A **handoff** is a note from a session on one computer to the next session on another: what was
done, what is left, where the files are, and how to tell it's finished. The `handoff` skill writes
it. On the computer handing work off:

```
Write a handoff for MINI with the handoff skill: what we did in this session, what is left, the
branch and folders, and how MINI can tell it's done. Save it in the fleet repo as a new file in
handoffs/open/, addressed to MINI, then sync the fleet.
```

On the computer picking it up:

```
Sync the fleet, then read the handoffs in 50-AI/fleet-ops/handoffs/open/ addressed to this computer.
Take the oldest one (move it to handoffs/taken/ and sync), tell me in three lines what it asks for,
and wait for my go.
```

When the work is finished, the session moves the handoff to `handoffs/done/` and syncs.

## A builder and a gate

The safest way to let a computer work while you are away is to split the job in two:

- **The builder** (often on a `builder` computer) takes a work order from `board/backlog/`, moves it
  to `doing/`, does the work on a branch, pushes the branch, and says it is ready. It never merges,
  and it never marks its own work done.
- **The gate** (a separate session, usually on your `command` computer) checks that work against
  the order: did it do what was asked and nothing more (`scope-check`), does it still run
  (`smoke-check`), do the tests pass. Only the gate moves the order to `done/`. Then you merge.

Nobody grades their own work. That one habit catches most mistakes before they reach `main`.

To file a work order from any computer:

```
File a work order on the fleet board: <what needs doing>. Use templates/ in the fleet repo, save it
in board/backlog/, and sync the fleet.
```

## Seeing it on the office

The office reads this computer's copy of the fleet repo, so every computer in the fleet is known to
it, with its role. With [guide 2](02-tailscale.md) set up, each computer's sessions show on one
floor, live; the fleet repo adds the shared board, messages and handoffs, which work even when a
computer is off.

## Taking it out

- On one computer: `node install.js --remove` (from `<your Hub>/50-AI/workspace`) turns off that
  computer's daily sync, along with the rest of what the installer added. Its copy of the fleet repo
  stays in `50-AI/fleet-ops`, and so does everything else of yours.
- Just the sync: `node fleet/bin/fleet.js schedule --remove`.
- The repo itself stays on your GitHub account, private. If you want it gone, delete it there
  yourself (on GitHub: the repo, Settings, then Delete this repository). The installer never deletes
  it and never makes it public.

## If something's off

- **"gh: command not found" or "not logged in".** Install `gh` from https://cli.github.com and run
  `gh auth login`, then run the installer again.
- **The sync stopped and named some files.** Another computer's files, or a file nobody should have
  changed, were edited on this computer. Read the list it printed; ask Claude to explain each one and
  put it back before you sync again.
- **A computer's heartbeat is old.** It is off, asleep, or its daily sync was removed. Wake it, or
  run the installer on it again.
- **Two computers chose the same name.** Each name must be unique: rename one in its own
  `machines/<NAME>.json` and its `.hub/hub.json`, then sync.
