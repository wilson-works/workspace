# 9. Updates that never break your own pieces

Your Workspace is yours: your name and colours, your agents, your session names, the changes you asked
Claude to make. An update brings the new things WilsonWorks has built without taking any of that away.
This guide says how updates arrive, where your pieces live, and what Claude does, step by step.

## How an update arrives

WilsonWorks builds each new feature on a **branch** of the public repository
(https://github.com/wilson-works/workspace), such as `feature/<name>`, and marks each release with a
**tag**, such as `v2.2.0`. When one is ready, you get a short prompt to paste into a chat on your Hub:

```
Update my Workspace with <the branch or tag>, following prompts/update-my-workspace.md.
```

Claude follows [that procedure](../prompts/update-my-workspace.md). It shows you what the update
changes before it changes anything, and it waits for your yes.

## Where your pieces live

Most of what is yours sits where an update cannot reach it, either outside the Workspace folder or in a
file git is told never to track. The rest is on a branch of your own.

| Your piece | Where it is | Why an update never touches it |
|---|---|---|
| Your settings: name, office name, colours, computers, private folders | `workspace.config.json` in the Workspace folder | It is listed in `.gitignore`, so git never tracks it: no update can change it. The installer writes it only when it is missing. |
| Your logo | `brand/` in the Workspace folder | Listed in `.gitignore`. |
| Your own Work projects | `projects/<yours>/` in the Workspace folder | `.gitignore` leaves out every project folder except the two that ship (`getting-started`, `demo-app`). |
| Your Hub: its zones, `CLAUDE.md`, `NAV.md`, `.hub/` | your Hub folder | Outside the Workspace folder, which is one folder inside `50-AI`. The installer keeps a `CLAUDE.md` of yours that differs from its template (`!`); `NAV.md` is rebuilt from what is on disk, which is its job. |
| Your agents | `<Hub>/50-AI/agents/<key>/` | Outside the Workspace folder. The installer shows them as `=`; installing an agent again keeps a folder of yours that differs unless you say `--force`. |
| What your agents keep | Louise's library in `<Hub>/50-AI/research`, Bryn's stone path in `<Hub>/50-AI/agent-data/bryn` | Outside the Workspace folder. |
| Your own skills | `<Hub>/.claude/skills/`, and `.claude/skills/` in your user folder | Outside the Workspace folder. A starter skill you changed is `!`, kept; one you never changed may move to the newer version the update pins (`~`). |
| Your Hub's Claude settings | `<Hub>/.claude/settings.json` | Outside the Workspace folder. The installer only adds the office's hooks, and backs the file up first. |
| The office's notes, questions, chat and course progress | the office's own folder (`office.home`: `%LOCALAPPDATA%\WorkSpace` on Windows, `~/Library/Application Support/WorkSpace` on a Mac) | Outside the Workspace folder. |
| Changes you made to the Workspace's own files, such as `config/org-people.json`, `config/callsigns.json`, `config/agents.json`, `config/plain-names.json`, `config/thresholds.json`, `src/ui/office.css` or the CTO org in `org/` | in the Workspace folder | Saved on your own branch, **`my-workspace`** (below). An update is merged into it. |

## Your branch: `my-workspace`

The setup (`SETUP.md`, step 2) makes a branch of your own in the Workspace folder called `my-workspace`.
A branch is a line of saved changes. Everything you change in the Workspace's own files is saved on
yours, with a note of what and why (a *commit*). An update is a second line of changes, from WilsonWorks;
Claude **merges** it into yours, which keeps both. Nothing is reset, forced or thrown away.

Set up before this guide existed? The first update makes `my-workspace` for you, from where you are,
with your changes in it.

## What Claude does during an update

1. **Checks the ground.** It makes sure you are on `my-workspace` and that every change you made is saved
   on it. A change that is not saved yet, it shows you and saves on your branch after your yes. It never
   puts anything aside or throws anything away.
2. **Notes where you are**, the commit your branch is at, so going back is one line.
3. **Fetches the update** from the public repository, without changing anything yet.
4. **Shows you what it changes**: its commits in plain words, the files it touches, and which of those
   you changed too.
5. **Merges it** into `my-workspace`, after your yes.
6. **Stops if two changes meet.** When you and the update changed the same lines of a file, git cannot
   choose, and neither does Claude on its own. It shows you both, proposes a version that keeps what you
   meant and adds what the update brings, and saves it after your yes. You can also say stop:
   `git merge --abort` puts everything back exactly as it was.
7. **Shows you the result**: what came in, and your own changes still there.
8. **Runs the installer again.** It adds whatever the update needs and changes nothing of yours without
   asking. Run once more, it says "Nothing changed."
9. **Checks it all still works**: restarts the office, opens it, and checks each agent's door answers.

## If you changed the page's look

The page you see is built from `src/ui/` into `dist/`, and both are in the repository. If you rebuilt the
page after changing its look and an update rebuilt it too, the two `dist/` folders always meet. Claude
takes the update's `dist/`, keeps your change in `src/ui/`, then builds the page again (`npm install`
once, then `npm run build`) and saves the new build on your branch.

## Going back

Claude tells you the update's merge commit when it finishes. To undo the whole update, in a chat on your
Hub:

```
Undo the last Workspace update: in 50-AI/workspace, run git revert -m 1 --no-edit <the merge commit>,
then run the installer and restart the office, and show me what changed.
```

That makes a new commit that takes the update back out and keeps everything else, including your history.
To take the update again later, revert that revert.

## The one-line installer and updates

Running the one-line installer again (`install.ps1` or `install.sh`) updates the Workspace folder only
with `git pull --ff-only`, and only when it has no unsaved changes. On `my-workspace` that pull stops
before it changes anything: git says there is no tracking information for the branch, the installer
says "Could not update it; going on with the copy you have.", and it runs on the copy you have. That is
expected, so leave the branch as it is (don't set the upstream git suggests). Updates come through the
prompt above.

## If something's off

- **"You are not on my-workspace."** Ask Claude: "Show me which branch my Workspace is on, and what is
  on it that is not on main." Then decide together; nothing is moved until you say.
- **The update stopped in the middle.** Ask Claude: "Show me git status in 50-AI/workspace, in plain
  words." Either finish the merge together, or `git merge --abort` to go back to before it.
- **The office does not start after an update.** `node bin/office-start.js` in the Workspace folder, and
  read what it prints and `office.log` in the office's own folder. Going back (above) always works.
- **An agent's door stays shut.** `node agents/bin/agent.js list` says why; `node agents/bin/agent.js start <key>`
  starts it.
