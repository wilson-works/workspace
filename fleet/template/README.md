# fleet-ops: how my computers share work

This repo is private. Every computer I work on keeps a copy of it in its Hub, at
`<Hub>/50-AI/fleet-ops`. Claude Code sessions on any of those computers read it to see what is
waiting, write to it to hand work on, and sync it every day and after every write. No code lives
here: only the notes that let the computers work together. The WilsonWorks Workspace set it up
(`fleet init` on the first computer, `fleet join` on each of the others).

`fleet` below is short for `node <Hub>/50-AI/workspace/fleet/bin/fleet.js`.

## What is in it

| Folder | What it holds |
|---|---|
| `machines/` | One file per computer: its name, its role, where its Hub is. |
| `heartbeats/` | One file per computer: when it last synced, and a few counts. Never the titles of private work. |
| `board/` | The work orders, one file each. The folder is the status: `backlog`, `doing`, `done`, `archive`. |
| `comms/` | One file per computer, newest note at the bottom. Only that computer writes in it. |
| `handoffs/` | Notes that pass a piece of work to another computer: `open`, `taken`, `done`. |
| `templates/` | The shape of a work order, a handoff and a comms note. |

## The three roles

- **command**: plans the work, reviews it and merges it. Usually the computer that is on the most.
  Its office is the one your phone opens.
- **builder**: works on branches, often while you are away. It never merges.
- **mobile**: the laptop on the go. It drafts, takes notes and pushes branches.

## The loop

1. The command computer puts a work order on the board:
   `fleet board --add "Add tip buttons to the checkout" --for MINI`.
2. The builder takes it (`fleet claim <id>`), works on a branch in the code repo, pushes the branch,
   writes the branch and how to check it into the order, and moves it on (`fleet finish <id>`).
3. A different session checks the work, ideally on another computer or another model. The command
   computer merges it through a pull request, then archives the order (`fleet archive <id>`).
4. When one computer wants another to carry on with something, it sends a handoff:
   `fleet handoff --to MINI "Finish the tip buttons" --body "What is done, what is next, how to check it."`
   The other computer lists what is waiting with `fleet pickup`, takes one with `fleet pickup <id>`,
   and closes it with `fleet done <id>`.
5. Each computer keeps notes in its own comms file (`fleet post "Picked up the tip buttons."`), so
   the others can read what happened while they were off.

## The daily sync

`fleet sync` runs once a day (`fleet schedule` sets that up) and after every fleet command. It:

1. writes this computer's heartbeat;
2. commits only this computer's own files. If anything else changed, it stops and names it,
   instead of committing it;
3. pulls what the other computers pushed. If two computers changed the same file, it backs out
   cleanly and says so. It never leaves this copy half-merged;
4. pushes.

`fleet status` shows every computer, when it last synced, and what is waiting for this one.
