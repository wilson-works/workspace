---
id: FS-06
title: Meet the CTO org
minutes: 30
---
The CTO org is a team of 18 agents. **James** plans and decides, **Tim** routes the work to the right department, the department heads and their juniors do it, and **John** checks every change before it is final. They were built as a software team, but what they really do is plan work, split it up and check it. At a firm, their best use is building and improving your own tools and agents. In this lesson you put them in a folder and give them a job that isn't software.

## What you'll get

- The org in a folder of your own, `50-AI/team`.
- A plan from James for something in your work, checked by John.
- A feel for who does what, so the next lesson (your own agent) makes sense.

## Before you start

The team's message board and its department guard use **Python 3**, which the staff install does not add. In a chat on your Hub, paste:

```
Check whether Python 3 is installed on this computer (python --version, or python3 on a Mac). Tell me the version, or tell me it is missing. Install nothing.
```

If it is missing, install it from https://www.python.org/downloads (on Windows, from python.org, not the Microsoft Store shortcut; tick **Add python.exe to PATH**), then open a new chat. Ask the office manager if you can't install programs.

## Do this

**1. Make the folder and put the team in it.** In a chat on your Hub, paste:

```
Make the folder 50-AI/team in my Hub and make it a git repository. Then put the CTO org into it with node 50-AI/workspace/bin/install.js org --into "50-AI/team". Show me the plan first. After my yes, run it again with --apply. Then set .claude/agents/org.config.json in that folder so the backend department owns notes/**, and show me the change before you save it.
```

**2. Open a chat in the team's folder.** In VS Code: File, Open Folder, then `Hub/50-AI/team` (in a new window). In the Claude app: a new session on that folder. The team loads in a chat opened there.

**3. Give James a job that isn't software.** Pick something in your work that could run more smoothly: the month-end close, how documents come in at tax season, how you follow up on missing items. Paste:

```
Use the cto-james agent. Direction: plan how I could make <the process> smoother, for an accounting firm's staff, with no client details. Write the plan to notes/plan.md: the steps today as I describe them, what slows them down, three changes ranked by effort, and which of them an agent could help with. Ask me about the process one question at a time first. Route the writing through Tim, have John review the plan before it is final, and show me the file before saving. End with James's three-line report.
```

**4. Read it as the boss.** You are the CEO in this team. Is the plan realistic? Ask James to change anything you disagree with.

## What you should see

- The org's files in `50-AI/team/.claude/`.
- James asking you about the process, then a plan in `notes/plan.md`.
- On the office's **Floor** and **Universe**, your chat with helpers coming and going while the team works, then John reviewing.

## If something's off

- **The chat can't find cto-james.** Check the chat is open on `50-AI/team`, and `.claude/agents/cto-james.md` exists there. Open a new chat.
- **An edit is refused by the path guard.** The file is outside what the department owns. Ask Claude to compare `.claude/agents/org.config.json` with step 1.
- **It talks about code.** Remind it: "This is not software. Plan the process, in plain words."

## Done when

- [ ] The org is in `50-AI/team`.
- [ ] James wrote a plan for one of your processes, and John reviewed it.
- [ ] You changed at least one thing in the plan as the boss.
