---
id: FS-07
title: "Capstone: build your own agent"
minutes: 90
---
An agent is a helper built for one job you do over and over, with your rules, your facts and a memory of what it learned. In this lesson you build one with two helpers: **Louise** researches how the job is done well, and **the CTO org** builds the agent from your own words, with John checking every file. You approve everything. Its office appears in the Agents wing by itself.

Good first jobs at a firm: the client document-request follow-up, a month-end checklist runner, a new-client welcome pack, a weekly status summary for your manager, a one-page research brief. Pick something that is mostly routine and that a person still checks at the end.

## What you'll get

- **A book on Louise's shelves**: how the job is done well, with a source for every fact.
- **The agent's own folder** in your Hub, `50-AI/agents/<key>/`, made by `new-agent`: its `agent.json` (who it is and how its office looks), its rules, its facts, its memory and a small page. It is its own git repository, so every change is saved with a note of why.
- **An office in the Agents wing**, with its name on the door.
- **Its rules, facts and routines, built by the CTO org** from your interview and Louise's book, reviewed by John, approved by you.
- **A practice run** on invented data, and one fix from what it showed.

## Before you start

Louise should be **In the office**, and you should have done FS-06 (the org and Python). In a chat on your Hub, paste:

```
Run node 50-AI/workspace/agents/bin/agent.js list and tell me whether Louise is installed and running.
```

## Do this

**1. Choose the job.** Paste:

```
Help me choose the first job to hand to an agent of my own. Here is the work I repeat every week or month: <your list, or "help me make the list">. For each, tell me how often it comes up, how much of it an agent could do, and what a person must still check. Recommend one, and ask me to confirm.
```

**2. Find out how it's done well, with Louise.** Paste:

```
Louise, research how <the job> is done well at an accounting firm: the usual steps, how good work is checked, and the common mistakes. A source for every fact.
```

A full run takes a while. Carry on with steps 3 and 4, and come back for step 5. When she has shelved it, ask: `Louise, what do we have on <the job>?`

**3. Make the agent.** Pick a short key with dashes, like `doc-followup`, a name, and a few words for its job. Paste:

```
Make me an agent with node 50-AI/workspace/agents/bin/new-agent.js <key> --name "<Name>" --title "<what it does, in a few words>". Run it with --dry-run first, show me what it will make, and wait for my yes. When it's made, list its folder and tell me in plain words what each file is for.
```

Open **Agents** in the office. Its office is there already, with its name on the door.

**4. Give it a history of its own.** Paste:

```
In 50-AI/agents/<key>, make a git repository: git init, a .gitignore with the lines dashboard/.pid, dashboard/dashboard.log and .claude/comms.db, my name for git in that folder if git has none, then commit everything with the message "Made by new-agent". Show me each command before you run it.
```

**5. Put it in your own words.** Paste this whole prompt. Claude asks one thing at a time, so all you do is answer.

```
Interview me about my <key> agent. Read 50-AI/agents/<key>/ first, so you know what new-agent made, and read Louise's book on this job, so your questions build on it. Ask one question at a time, keep each one short, and wait for my answer. If I'm unsure, offer two or three options. Cover these, in order:

1. The job: what recurring work it is, how often it comes up, and what a finished piece of it looks like.
2. Its voice: how it should sound, to me and in anything it drafts.
3. What it owns: the tasks it is responsible for, from start to finish.
4. Its fences: what it must never do. Start from these and ask me what to add: it never sends an email or message to anyone without a person's yes; it never moves money; it never deletes anything; it never puts client names or details anywhere outside the firm's systems; and it follows the firm's rules on client information.
5. How it checks its own work before handing it to me.
6. Its facts: what it needs to know about my work (standard wording, where my files are in my Hub, which firm procedure applies), and where each fact comes from.
7. Its routines: the two or three jobs it repeats. For each, the steps and what "done" looks like. Use what Louise found where it fits, and say which parts came from her.
8. A practice task: a realistic sample job with invented details (use Harbor Lane Coffee or client code C01), never a real client's.

Then write my answers, in my words, to 50-AI/agents/<key>/BRIEF.md. Show it to me in full, change what I ask, and save it after my yes. Commit it in the agent's repository with the message "My brief".
```

**6. The CTO org builds it.** Put the org in the agent's folder. Paste:

```
Put the CTO org into my agent's folder with node 50-AI/workspace/bin/install.js org --into "50-AI/agents/<key>". Show me the plan first. After my yes, run it with --apply. Then set .claude/agents/org.config.json in that folder so the frontend department owns dashboard/** and the backend department owns rules/**, brains/**, memory/**, routines/**, CLAUDE.md and subagent.md. Show me the change before you save it, and commit both with the message "The build team".
```

Then open the agent's folder in a new window (VS Code: File, Open Folder, `Hub/50-AI/agents/<key>`; the Claude app: a new session on that folder), start a chat there, and paste:

```
Use the cto-james agent. Direction: build my agent <Name> in this folder from BRIEF.md (my own words) and Louise's book on this job in <my Hub>/50-AI/research/ (how it is done well, with sources). This is an accounting firm's helper, not software: keep the layout new-agent made. Fill in CLAUDE.md (every {{CLAUDE: ...}} note in it, and a "My routines" list), its rules in rules/ (its voice, what it owns, its fences, how it checks its work, and this lookup order for facts: its own facts first, then files I point it to, and if a fact is in neither, it says "not verified" instead of guessing), its facts in brains/ (each followed by where it came from: "from me, in BRIEF.md" or Louise's book with its source), and one routine per job in routines/<routine>.md with numbered steps and a "Done when" list. Route the work through Tim, and have John review every file against BRIEF.md before anything is final. Then show me every file in full and wait. Save only after my yes, and commit each approved change with a message saying what changed and why. End with James's three-line report.
```

**7. Practice.** Open a new chat on your **Hub**, so the agent loads. Paste:

```
Use my <key> agent on the practice task in 50-AI/agents/<key>/BRIEF.md. Let it work the way it would on a real day. When it's finished, show me what it produced, and list anything it guessed, skipped or marked "not verified".
```

**8. Make one fix.** Look at the result the way a demanding reviewer would. What would you change first? Paste:

```
From that practice run, the one thing I want changed is: <what went wrong or felt off>. Make one fix so it doesn't happen again, in whichever file in 50-AI/agents/<key> is the real cause: its rules, a routine, or its facts. Show me the change and save it after my yes. Note what you changed and why in its memory, and commit it in the agent's repository with a message saying why.
```

## What you should see

- Louise at work, then a new book on her shelves.
- `new-agent` showing its plan, then the agent's office in the **Agents** wing straight away. Its door opens its page.
- Claude asking questions one at a time, then showing you `BRIEF.md` before saving it.
- On the Floor and in the Universe, helpers coming and going while the org builds, and every file shown to you before it is saved.
- A practice result that follows your routines, stays inside its fences, and marks anything it couldn't check as "not verified".
- `git log` in the agent's folder telling its story: made, your brief, the build team, the build, the fix.

## If something's off

- **A chat doesn't know Louise or your agent by name.** Open a new chat on your Hub: a chat reads its agents when it starts.
- **No office in the Agents wing.** Ask Claude: "Check 50-AI/agents/<key>/agent.json exists and is valid JSON." Then reload the office page.
- **The chat in the agent's folder can't find James.** Check the org went in (step 6): `.claude/agents/cto-james.md` should be in the agent's folder. Then open a new chat in that window.
- **An edit is blocked by the path guard.** The department that owns that file isn't the one writing it. Ask Claude to compare `.claude/agents/org.config.json` with step 6.
- **It guessed instead of saying "not verified".** Make the lookup order stricter in its rules, and add the missing fact, with where it came from.
- **It did something it should never do, or came close.** Stop the chat. Add that action to its fences in plain words, ask Claude to put the fence at the top of its rules, and tell the office manager.

## Done when

- [ ] Louise has a book on how the job is done well.
- [ ] `new-agent` made your agent, its office is in the Agents wing, and its folder is a git repository.
- [ ] `BRIEF.md` holds your own words, and the org built the agent from it, all approved by you.
- [ ] You ran a practice task on invented data and made one fix from it, committed with why.

## What next

- **Keep teaching it.** Each time it gets something wrong, make one fix: a fence, a step in a routine, or a fact. A few weeks of small fixes teach it your work, and its git history remembers why.
- **Ask Louise along the way,** whenever it needs to know something it doesn't.
- **Put its work on your board.** Give its repeating jobs their own cards, and blocks on your calendar.
- **Share what works.** If your agent saves you real time, tell the office manager: a colleague may want one like it.
