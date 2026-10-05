# The fleet: several computers, one way of working

Most people who work with Claude Code a lot end up with more than one computer: a desk computer
that is on all day, a small one that runs long jobs while you are away, a laptop for the road. The
fleet lets the sessions on all of them work as one team. It is optional: with one computer you
don't need it.

It is one **private git repo of your own**, on your GitHub account, with a copy in every
computer's Hub at `50-AI/fleet-ops`. The sessions read it to see what is waiting and write to it
to hand work on. No code lives in it, only the notes that let the computers work together. You
never build it by hand: the commands below create it, join each computer to it, and keep it in sync.

`fleet` here is short for `node <Hub>/50-AI/workspace/fleet/bin/fleet.js`.

## What is in the repo

- **machines/**: one file per computer, with its name, its role, its Hub folder and its code zone.
- **heartbeats/**: when each computer last synced, and a few counts (never the titles of private work).
- **board/**: the work orders, one file each. The folder is the status: backlog, doing, done, archive.
- **comms/**: one notes file per computer. Only that computer writes in it.
- **handoffs/**: notes that pass a piece of work from one computer to another: open, taken, done.
- **CLAUDE.md** and **README.md**: the rules every session follows in the repo, and the loop in plain words.

## The three roles

| Role | What it does |
|---|---|
| **command** | Plans the work, reviews it and merges it. Usually the computer that is on the most; its office is the one your phone opens. |
| **builder** | Works on branches, often while you are away. It never merges. |
| **mobile** | The laptop on the go: drafts, notes and branches. |

## Setting it up

On your **first computer** (it needs the GitHub command line, `gh`, signed in: `gh auth login`):

```
fleet init
```

It asks before it creates anything: "Create a private repo <you>/fleet-ops on your GitHub account?"
Only a typed `yes` creates it (or `--create-repo`, when you have already decided). It is always
created **private**, and an existing repo that is public is refused. Then it fills the repo with the
starting files, clones it into your Hub and registers this computer. Running it again changes nothing.

On **each other computer**:

```
fleet join <you>/fleet-ops --role builder
```

Then, on each computer, the daily sync:

```
fleet schedule
```

That is a Task Scheduler task on Windows ("WilsonWorks Fleet Sync") and a LaunchAgent on macOS,
every day at 08:30 (`--at 07:00` to change it). On Linux it prints the crontab line to add.

The office reads the fleet by itself: its **Fleet** tab shows every computer, the board, the
handoffs and the latest notes, and every registered computer joins the office's floor without
editing `workspace.config.json`.

## Using it

| You want to | Say |
|---|---|
| send this computer's notes and get the others' | `fleet sync` |
| see every computer and what is waiting here | `fleet status` |
| leave a note for the others | `fleet post "Picked up the tip buttons."` |
| hand work to another computer | `fleet handoff --to MINI "Finish the tip buttons" --body "what is done, what is next, how to check it" --repo demo-app --branch feature/tips` |
| see and take what was handed to you | `fleet pickup`, then `fleet pickup <id>`; when finished, `fleet done <id> --note "..."` |
| put work on the board | `fleet board --add "Add tip buttons" --for MINI` |
| take it, finish it, archive it | `fleet claim <id>`, `fleet finish <id> --branch <b>`, `fleet archive <id>` |

Every command takes `--dry-run` (show what it would do, change nothing) and `--hub <your Hub>`.

## The two values that differ per computer

Every computer's Hub has the same zones with the same names. Only two things may differ: where the
Hub is, and its code zone (`20-Coding/Projects`, or `20-Coding/Active`). Each computer records both
in its `machines/` file, and nothing in the fleet writes either one down as a fixed path.

## How a session on one computer hands work to another

1. It pushes its branch, so the other computer can fetch it.
2. It runs `fleet handoff --to <NAME> "<title>" --body-file note.md --repo <repo> --branch <branch>`,
   with a note in three parts: what is done, what is next, how to check it.
3. On the other computer, a session runs `fleet pickup`, reads the note, takes it with
   `fleet pickup <id>`, does the work, and closes it with `fleet done <id>`.
4. A different session checks the work before it is merged. Nobody grades their own work.

## How the sync keeps computers from stepping on each other

Each computer writes only its own files: its machine file, its heartbeat, its comms file, and the
work orders and handoffs that carry its name. The sync:

1. writes the heartbeat first;
2. stages only this computer's own files. If anything else changed, it stops, names the files in
   `.sync/DIRTY` (never shared) and exits with 3, committing nothing;
3. commits, then pulls with a rebase. If another computer changed the same file, it aborts the
   rebase at once, notes it in `.sync/CONFLICT` and exits with 4. The copy is left exactly as it was;
4. pushes, and if GitHub refuses because another computer just pushed, pulls and pushes once more;
5. records how it went in `.sync/last.json` and in the next heartbeat.

Exit codes for every command: 0 done, 1 failed, 2 refused, 3 and 4 as above.

## Removing it

```
fleet remove
```

It refuses while this computer has anything not yet on GitHub (run `fleet sync` first). Then it
turns off the daily sync, marks the computer as left, syncs, and moves this computer's copy to
`90-Archive/_DumpQueue/fleet-ops-<date>/` for you to delete. It never deletes anything itself. The
repo on GitHub stays private, and it is yours: keep it for your other computers, or delete it on
github.com once no computer uses it.

## Safe by design

- The repo is private, always. The tools never make it public and refuse one that is.
- No secrets, client data or file contents go in it: work orders and handoffs name paths, never what
  is in them. The heartbeat carries counts, never titles.
- Commits use your own git identity; a computer without one commits as `<NAME> fleet`.
- No GitHub Actions workflow, ever: the fleet repo only holds notes.
