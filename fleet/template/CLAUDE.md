# Rules for any Claude Code session in this fleet repo

This repo is how my computers share work (README.md has the loop). These rules hold on every
computer. The Hub's own `CLAUDE.md` outranks this file wherever the two differ.

`fleet` is short for `node <Hub>/50-AI/workspace/fleet/bin/fleet.js`, where `<Hub>` is this
computer's Hub folder.

## Before you read anything here

1. Pull first: `fleet sync`. Never plan from a stale board.
2. Know which computer you are on and its role: `fleet status` says it on its first line.

## Writing

3. Write only your own files: this computer's file in `machines/`, its heartbeat, its comms file,
   the work orders it filed or claimed, and the handoffs it wrote or took. Never edit another
   computer's comms file.
4. One file per work order and one file per handoff. The folder a file sits in is its status; move
   the file to change it (the fleet commands do this for you).
5. Commit and push right after writing. The fleet commands (`post`, `handoff`, `pickup`, `done`,
   `board --add`, `claim`, `finish`, `archive`) do both. By hand: stage each path by name
   (`git add <path>`); never `git add -A`, `git add .` or `git commit -a`.
6. On a rebase conflict: `git rebase --abort`, write one line about it in your comms file, and stop
   touching that file. A person sorts it out. Never force a push.
7. No secrets, passwords or tokens. No client data. No file contents: name the path or the repo,
   never paste what is in it.

## Who does what

8. A builder never merges. It pushes a branch and says in the work order where it is.
9. Nobody grades their own work. A different session checks it, ideally on another computer or
   another model. The builder runs only quick checks; the full test suite runs once, at merge time,
   on the command computer.
10. Open every session on the computer's Hub folder. Reach this repo, or a code repo, by its path.
    Never stop to ask for another folder or a terminal to be opened.
11. A question for the owner goes to the office, in plain English, with what you would do:
    `node <Hub>/50-AI/workspace/bin/ask-owner.js "the question?" --recommend "what I would do"`.
    A technical question is not an owner question: decide it, or ask another session.

## Handing work to another computer

- **Writing one.** `fleet handoff --to <NAME> "<what to do, in a few words>" --body-file note.md`
  (or `--body "..."`), plus `--repo <code repo> --branch <branch>` when it is about code. Write the
  note in three short parts: what is done, what is next, how to check it. Push the branch first:
  the other computer can only pick up what is on GitHub.
- **Picking one up.** `fleet pickup` lists the handoffs waiting for this computer. Read the one you
  take in full, then take it with `fleet pickup <id>`; it moves to `handoffs/taken/` with your name
  on it. When the work is finished, `fleet done <id> --note "what happened"`.
- A handoff addressed to another computer is not yours. Leave it, unless the owner says otherwise
  (`--any`).
- Before you end a session with work unfinished, write a handoff or a comms note. The next session
  starts from what you wrote, not from memory.

## The two values that differ per computer

Every computer's Hub has the same zones with the same names. Exactly two things can differ: where
the Hub is, and the code zone inside it (`20-Coding/Projects`, or `20-Coding/Active` on some
computers). Each computer's `machines/<NAME>.json` records both (`hub_root`, `code_zone`). Never
write either into a work order, a handoff or a script as a fixed path: name the repo and say "the
code zone", and let each computer find its own.
