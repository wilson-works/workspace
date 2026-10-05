# The starter skills

A **skill** is a saved set of instructions Claude follows for one job. You start one by typing its
name after a slash, like `/handoff`, or by asking for the job in plain words.

The installer (`install.js`) gives every new Hub twelve skills from the free
[claude_skills](https://github.com/wilson-works/claude_skills) pack. They are the ones a person
needs in the first weeks: keeping notes and handing work on, keeping the Hub tidy and its rules
short, finding your way around a project, and planning, doing and checking work.

| Skill | Why it is in the starter set |
|---|---|
| `handoff` | Closes a session into a note the next session, or another computer, picks up: how work moves between sessions and machines. |
| `file-organizer` | Sorts Downloads and `00-Inbox` into the Hub's zones. It shows the plan first and never deletes. |
| `claude-md-doctor` | Keeps the Hub's `CLAUDE.md` and each project's short and checkable, so every session follows them. |
| `systems-map` | Maps a project's parts and what depends on what: how Claude finds its way around inside a codebase. |
| `backlog` | One place for the work you have not done yet. |
| `work-orders` | Works through that backlog, one order at a time, with helpers. |
| `quick-design` | A short plan before a change, so the change is the one you meant. |
| `scope-check` | Checks the work matched the plan: the question a gate asks before anything merges. |
| `smoke-check` | A two-minute "is it still working?" before you merge. |
| `notetaker` | Notes every future session can find, so you stop explaining the same thing twice. |
| `quick-research` | Answers a question with sources, in one sitting. |
| `prompt-coach` | Teaches you to ask Claude for things well, with your own prompts as the examples. |

The list, with the same reasons, is `starter.json` in this folder. The installer reads it.

## Where they go

| | |
|---|---|
| The pack | `<Hub>/50-AI/claude_skills`: a clone of the pack, checked out at the pinned commit. All of its skills are there to read. |
| The starter skills | `<Hub>/.claude/skills/<name>/`, so every session opened on your Hub has them. With `--skills-scope user` they go in `~/.claude/skills/` instead, for every session on this computer in any folder. |
| The record | `<Hub>/.hub/installed.json` keeps a fingerprint (a content hash) of each skill as it was copied. |

## Pinned, not copied

This repo never keeps its own copy of the skills, so nothing here can drift from the pack. The
installer clones the pack and takes each skill from one exact commit: `ref` in `starter.json`.

It is a **commit, not a tag**. A tag is a name that can be moved later to point at different files;
a commit id names exactly one set of files, forever. So everyone who installs this version of the
Workspace gets the same skills, byte for byte.

## Your changes are safe

Change a starter skill as much as you like. The installer compares each one with its fingerprint:

- the same as the pack's: `=`, nothing to do;
- the same as what it copied, and the pin has moved: `~`, updated to the new commit;
- different from both: `!`, **yours is kept**. It is never replaced, and `install.js --remove`
  never takes it out. To go back to the pack's copy, move yours out of the folder and run the
  installer again.

## More skills

The pack has over a hundred more. To add one, ask Claude in a chat on your Hub:

```
Copy the <name> skill from 50-AI/claude_skills/skills/<name> into .claude/skills/<name>, then tell me
in two sentences what it does and how to start it.
```

## Moving the pin

To take a newer version of the pack, change `ref` in `starter.json` to the new commit id (the full
40 characters), check each starter skill still exists at that commit, and run the installer: each
skill you have not changed moves to the new commit (`~`); each one you changed is kept (`!`).
