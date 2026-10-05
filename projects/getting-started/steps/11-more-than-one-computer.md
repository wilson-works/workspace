---
id: GS-11
title: More than one computer (optional)
minutes: 45
---
If you use more than one computer, a **fleet** lets them share work. Your computers keep one private repo on your GitHub account, `fleet-ops`, with a board of work orders, a message file per computer, and handoffs: notes that hand a job from a session on one computer to a session on another. In this lesson you join two computers into one fleet and hand a job from one to the other.

This lesson is optional. Skip it if you use one computer. You can come back to it any time.

## What you'll get

- Your own private `fleet-ops` repo on GitHub, with a copy in each computer's Hub at `50-AI/fleet-ops`.
- Two computers registered in it, each with its name and role.
- A daily sync on each computer, so news travels even when you forget.
- A handoff written on one computer and picked up on the other.

## Before you start

- A second computer with the Workspace installed (`guides/01-install.md`).
- A GitHub account, and GitHub's command line `gh` on both computers: install it from https://cli.github.com, then run `gh auth login` once on each and follow its questions.
- Pick a short name and a role for each computer. The one that is on the most is `command` (for example DESK). A computer that runs long jobs while you're away is `builder` (MINI). One you carry is `mobile` (LAPTOP).

## Do this

**1. Start the fleet on your first computer.** In a chat on its Hub, paste:

```
Set up my fleet on this computer. Run node 50-AI/workspace/install.js --fleet create --create-repo --dry-run and explain the plan in plain words. If it looks right, ask me, and after my yes run it again without --dry-run. When it's done, tell me the name of my fleet repo on GitHub and confirm it is private.
```

Say yes when it offers the daily sync.

**2. Join from your second computer.** On the second computer, in a chat on its Hub, paste (with your own GitHub name, and that computer's name and role):

```
Join this computer to my fleet. Run node 50-AI/workspace/install.js --fleet join --fleet-repo <my GitHub name>/fleet-ops --machine <LAPTOP> --role <mobile> --dry-run and explain the plan. After my yes, run it without --dry-run, and say yes to the daily sync.
```

**3. Check both are there.** On either computer, paste:

```
Sync the fleet, then list the computers in 50-AI/fleet-ops/machines/ with each one's role and where its Hub is. Tell me when each one last synced, from heartbeats/.
```

**4. Hand a job over.** On the first computer, in any chat where you've done some work, paste:

```
Write a handoff for <LAPTOP> with the handoff skill: what we did in this session, what is left, which folders and branch, and how <LAPTOP> can tell it's finished. Save it in the fleet repo as a new file in handoffs/open/, addressed to <LAPTOP>, then sync the fleet and tell me the file's name.
```

**5. Pick it up.** On the second computer, open a new chat on its Hub and paste:

```
Sync the fleet, then read the handoffs in 50-AI/fleet-ops/handoffs/open/ addressed to this computer. Take the oldest one: move it to handoffs/taken/, sync, and tell me in three lines what it asks for. Wait for my go before you start.
```

When the work is done, ask it to move the handoff to `handoffs/done/` and sync.

## What you should see

- A private repo called `fleet-ops` on your GitHub account.
- Both computers listed in `machines/`, each with a recent heartbeat.
- The handoff file appearing in `handoffs/open/` on the second computer after a sync, then moving to `taken/` and `done/`.
- On the office, with Tailscale set up (GS-05), both computers' sessions on one floor.

## If something's off

- **"gh: not logged in".** Run `gh auth login` on that computer, then try the step again.
- **The second computer can't find the repo.** Check you typed your GitHub name and `fleet-ops` exactly, and that `gh` on that computer is signed in to the same account.
- **The handoff doesn't show up.** Both computers must sync: the first to send it, the second to receive it. Ask each one to sync the fleet and show what came in.
- **The sync stopped and listed some files.** A computer only ever writes its own files. Ask Claude to explain each file it listed and put back any change that isn't this computer's.

## Done when

- [ ] Your private `fleet-ops` repo exists, and both computers are in it.
- [ ] The daily sync is set up on both.
- [ ] A handoff written on one computer was picked up on the other.

`guides/07-several-computers.md` has the rest: the board, a builder and a gate, and how to take the fleet out.

When you've finished, tap **Mark done** at the top of this lesson, or ask Claude to run `node 50-AI/workspace/bin/work.js mark getting-started GS-11 done`.
