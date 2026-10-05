---
id: GS-07
title: Meet your team
minutes: 30
---
WorkSpace ships with a team called the CTO org: 18 Claude agents, each with a name and a job.

- **James**, the CTO, decides how to approach the work.
- **Tim**, his executive assistant, routes the work to the right department.
- **Five department heads** each run one part of a codebase: Cindy (backend, the logic behind the scenes), Gavin (frontend, what people see), Diana (database), Rachel (QA, which means testing) and Josh (APIs, the connections between programs).
- **Two juniors under each head**: Marcus and Priya, Ava and Kai, Leo and Nora, Owen and Maya, Felix and Zara.
- **John**, the Chief Engineer, reviews every change before it's kept.

In this lesson you give the team its first real job, on a tiny practice app.

## What you'll get

- Your own copy of the Demo app, a tip splitter, in your code folder.
- The org installed in that copy.
- Order DA-01 done by the team and reviewed by John, while you watch them on the floor.

## Do this

**1. Copy the practice app.** In a chat in the WorkSpace folder, paste this. Replace `<your code folder>` with one of the code folders you gave in GS-02, so the office gives the app its own room on the floor:

```
Copy the folder projects/demo-app/starter from this WorkSpace folder to <your code folder>/tip-splitter. Then make tip-splitter a new git repository and commit everything in it with the message "Starter from WorkSpace". Don't change the original starter folder. When you're done, tell me the full path of the new folder.
```

Git is the tool that keeps a history of every change to your code. A folder it tracks is called a repository, or repo.

**2. Try the app.** Open `index.html` in the new folder with your browser (double-click it). Try it with one person, then with four. If something looks wrong with four people, hold that thought: it's order DA-02.

**3. Install the org into it.** Back in the WorkSpace chat, paste this, with the full path from step 1:

```
Run node bin/install.js org --into "<full path of tip-splitter>" without --apply, and explain in plain words what it would add. Ask me, and only after I say yes, run it again with --apply. When it's done, commit the new files in tip-splitter with the message "Add the CTO org".
```

It adds the 18 agents, a comms bus (a small message board the agents use to talk to each other, run with `python .claude/comms/comms.py`), a path guard (a hook that keeps each department to its own files), and `.claude/agents/org.config.json`, which says which files each department owns. The comms bus and the path guard are written in Python, so Python 3 needs to be installed.

**4. Open the app's folder.** In VS Code, choose File, then Open Folder, and pick `tip-splitter`. Start a new Claude chat there.

**5. Tell the org who owns what.** This app runs in the browser with no server or database, so the split is short. Paste:

```
Read .claude/agents/org.config.json, which WorkSpace added to this folder. This is a small browser app with no server, database or API. Set the file ownership so index.html, style.css and app.js belong to the frontend department (Gavin), and anything under tests/ belongs to QA (Rachel). Leave the other departments in the file with nothing to own here. Show me the change, save it after I say yes, and commit it.
```

**6. Give James his first order.** Order DA-01 is on the Work page under Demo app. Paste this, with your WorkSpace folder's full path:

```
Give order DA-01 to James, the CTO agent. The order is in <your WorkSpace folder>/projects/demo-app/steps/01-tip-buttons.md, so read it first. Run it the way the org works: James decides the approach, Tim routes it to the right department head, the head hands the work to one of their juniors, and John reviews the change before it's committed. Use the comms bus for their messages. Before you start, run node bin/work.js mark demo-app DA-01 doing from the WorkSpace folder. When John approves and the change is committed, run node bin/work.js mark demo-app DA-01 done there too, and give me a short summary of who did what.
```

**7. Watch the floor.** Switch to the office. As the work moves along, James, Tim, Gavin and one of his juniors (Ava or Kai) show up, walking in and out of your session's desk as its helpers. A session run by someone in the org is named after them, like James-1-Planning.

**8. Read their messages.** While they work, paste:

```
Show me the latest messages on the org's comms bus in plain words: who said what to whom.
```

**9. Try the app again.** When DA-01 is done, reload `index.html`. The tip buttons should be there.

## What you should see

- DA-01 moving from To do to Doing to Done on the Work page.
- James, Tim, Gavin and a junior appearing on the floor as they take their turns.
- John's review. If he sends the work back for a fix, that's normal. Checking is his job.
- Tip buttons and a tip line in the app.

## If something's off

- **"git" isn't recognized.** Git isn't installed. Ask Claude: "Check whether git is installed and, if not, tell me how to install it on this computer." Then start again at step 1.
- **The comms bus or the path guard fails with a Python error.** Both need Python 3. Ask Claude to check with python --version and to help you install Python if it's missing.
- **The path guard blocked an edit.** A department tried to change a file it doesn't own. Check the ownership from step 5. This means the guard is working.
- **DA-01 isn't on the Work page.** Ask Claude, in the WorkSpace folder, to run node bin/work.js list and show you what it finds.
- **Nobody new showed up on the floor.** The work may have been done without helpers. Ask: "Run DA-01 through the org with each person working as their own helper, so I can see them on the office floor."

## Done when

- [ ] `tip-splitter` is in your code folder as its own git repository, with the org installed.
- [ ] DA-01 is marked Done on the Work page.
- [ ] You saw James, Tim, a department head and a junior on the floor.
- [ ] John reviewed the change before it was committed.

When you've finished, tap **Mark done** at the top of this lesson, or ask Claude to run `node bin/work.js mark getting-started GS-07 done`.
