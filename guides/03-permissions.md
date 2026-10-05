# 3. Permissions: let it work without babysitting

The permission setup that runs this office day to day. It has three layers. Install all of it with
one command, after reading the plan:

```
node bin/install.js permissions          # the plan; nothing changes
node bin/install.js permissions --apply  # do it (your settings are backed up first)
node bin/install.js permissions --remove # take it back out
```

## How Claude Code asks permission

Before Claude runs a command or edits a file, Claude Code checks your **permission rules** and its
**mode**:

- **Rules** live in settings files, in three lists: `allow` (go ahead), `ask` (always ask me) and
  `deny` (never). A rule names a tool and, for commands, a pattern: `Bash(git push --force*)`.
  `deny` always wins, in every mode.
- **Settings files**: your user settings `~/.claude/settings.json` apply to every project; a
  project's `.claude/settings.json` applies to that project (and is shared through git);
  `.claude/settings.local.json` is yours alone in that project.
- **Modes**: *default* asks before most commands; *accept edits* lets file edits through;
  *plan* only plans; **bypass permissions** lets everything through except your deny rules. In the VS
  Code extension, bypass has to be allowed once in VS Code's settings (search "Claude Code: Allow
  Dangerously Skip Permissions") and is then chosen per chat from the mode menu. In a terminal it is
  `claude --dangerously-skip-permissions`.
- **Hooks** are small programs Claude Code runs at set moments, such as just before a tool runs. A
  hook can say allow or deny for that one call.

## Layer 1: the deny list (never)

Added to your user settings, so it binds every chat in every mode, bypass included:

| Rule | Why |
|---|---|
| `Bash(rm -rf .git*)`, `Bash(rm -rf /)`, `Bash(rm -rf ~*)` | deleting a project's history, the whole disk, or your home folder |
| `Bash(git push --force*)`, `Bash(git push -f *)` | overwriting shared history; it cannot be undone |
| `Bash(git gc*)` | can lock a shared repo for a long time and drops recoverable work |
| `Bash(gh repo delete*)`, `Bash(gh repo archive*)` | deleting or freezing a GitHub repo |

Plus three rules (Read, Edit, Write) for each folder in `privacy.never_read` in your
`workspace.config.json`, such as another person's user folder on a shared computer.

## Layer 2: the ask list (always ask me)

| Rule | Why |
|---|---|
| `Bash(railway up*)`, `Bash(railway deploy*)`, `Bash(firebase deploy*)` | publishing to the live internet |
| `Bash(gh workflow enable*)`, `Bash(gh workflow run*)` | GitHub Actions minutes are a shared budget |

An ask rule prompts even in bypass mode. Keep this list short, so a prompt always means something.
Add your own deploy commands here (prompts/README.md has the prompt).

## Layer 3: walkaway mode (nobody is watching)

For a session you leave running, a stuck permission prompt wastes the whole night. Walkaway mode is
two hooks (`permissions/walkaway/`) that only switch on in a project you mark:

```
<project>/.claude/WALKAWAY        a file; its first line may be  until=2026-11-02T18:00
```

(or the environment variable `CLAUDE_WALKAWAY=1`). The `until=` line turns it off by itself at that
local time, so a forgotten marker cannot surprise you tomorrow. Delete the file to turn it off.

While it is on, **the permission hook answers every request itself**, so nothing waits on you:

- **Allowed**: everything outside the irreversible class below.
- **Refused**, with a reason the session reads and works around:
  - force pushes, `git clean -f`, `gh api` with DELETE/PUT/PATCH, deleting a remote branch,
    `git gc`;
  - recursive deletes of a drive, your home, a `.git` folder or one of your code folders;
  - deploys (`railway up`, `firebase deploy`, `vercel/netlify --prod`), GitHub repo
    create/delete/archive/rename, `gh workflow run/enable`, scheduled-task changes;
  - pushing or merging to `main`/`master` (that is a release; it waits for you). A repo whose job is
    to be pushed on main can be listed in `push_main_ok` in `walkaway.local.json`;
  - editing your user settings;
  - any connector (MCP) action that writes, sends, publishes, deletes or shares (reading is fine).
    Local tools named in `local_mcp`, such as the browser, are exempt;
  - paths in `off_limits`;
  - tools that exist only to wait for a person (asking a question, plan approval).

**The stop guard** keeps a walkaway session from going quiet: a turn may only end when the session
has left something to wake it (a scheduled wakeup or a background job), or has written
`.walkaway/EXIT` with one line saying its job is done. Otherwise it is told to take its next step.
After three blocks in a row it lets go and writes `.walkaway/STALL-ALARM`, because a guard that can
trap a session is worse than a stall.

Every decision is logged to `requests.jsonl` in the project (`stop-guard.jsonl` for the stop guard).

`walkaway.local.json` in your Claude folder (`~/.claude/`) is written from your
`workspace.config.json` the first time you apply: `off_limits` from `privacy.never_read`,
`extra_roots` (folders whose recursive delete is refused) from `code_roots`. It is yours to edit and
is never committed.

Check the hooks yourself with `python permissions/walkaway/selftest_hooks.py`: it feeds them sample
requests and prints one line per check.

## Putting it together: the everyday setup

What this office's own workflow uses:

1. **Layers 1 and 2** installed for every chat.
2. **Bypass mode** in chats where you are around and every change can be undone, typically code
   folders tracked by git. The deny list is your floor: everything on it stays blocked.
3. **Walkaway mode** in a project when you leave a session to work alone. It replaces your judgement
   with the irreversible-class rule, so nothing stalls and nothing unrecoverable happens.
4. **The office** so you can watch from your phone, answer questions, and send a note that wakes a
   session.
5. **The workflow rules** (`permissions/CLAUDE.workflow.md`) in your `~/.claude/CLAUDE.md`: questions
   go to the office in plain English, branches not main, copy before delete.

Without bypass or walkaway, Claude Code keeps asking about everyday commands. That is the safe
default, and answering a prompt with "don't ask again" for a command you trust also works.

## Honest limits

- A deny list blocks the patterns on it, not every way to do damage. A command spelled differently
  can get past a pattern. Keep backups of anything you cannot lose, and keep your work in git.
- Bypass mode means Claude acts without asking. Use it where a mistake costs a `git checkout`, not
  where it costs a client relationship.
- Hooks run on your computer with your permissions. Read them before you install them: they are
  short and commented (`permissions/walkaway/*.py`, `.claude/hooks/*.js`).
