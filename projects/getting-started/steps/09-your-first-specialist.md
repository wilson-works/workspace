---
id: GS-09
title: "Capstone: your first specialist"
minutes: 90
---
The org is a general team. A specialist is an agent built for one job you do over and over, with your facts and your rules. In this lesson you build your first one with three helpers, in turn: **Bryn** helps you choose the job, **Louise** researches how that job is done well, and **the agent org** builds it from your own words. It lives in your Hub with a history of its own, and its office in the Agents wing appears by itself.

This is the same path as step 4 of `SETUP.md`. If you did it there, this lesson is here for your second agent.

## What you'll get

- **A stone on Bryn's stone path**: the job you chose for your agent, and why.
- **A book on Louise's shelves**: how that job is done well, with a source for every fact.
- **The agent's own folder** in your Hub, `50-AI/agents/<key>/`, made by `new-agent`: its `agent.json` (who it is, and how its office looks), its rules, its facts, its memory, and a small dashboard. It is its own git repository, so every change to it is saved with a note of why, and no Workspace update ever touches it.
- **An office in the Agents wing**, in your colours, with its name on the door and a door into its dashboard.
- **Its rules, facts and routines, built by the agent org** from your interview, Louise's book and Bryn's stone, reviewed by John, and approved by you.
- **A practice run** on a sample task, and one fix based on what it showed.
- **Its place in your Workspace**: its name on the office's roster, saved on your own branch, and its own project on the Work page.

## Before you start

Louise and Bryn need to be in your office. In a chat on your Hub, paste:

```
Run node 50-AI/workspace/agents/bin/agent.js list and tell me whether Louise and Bryn are installed and running. If one is missing, install it with node 50-AI/workspace/agents/bin/install-agent.js <louise or bryn>: show me the plan first and wait for my yes.
```

## Do this

**1. Choose the job, with Bryn.** Think of the work you repeat every week or every month. Some ideas: sorting receipts, drafting posts in your voice, welcoming new clients, one-page research briefs, sales follow-up, planning your week. In a chat on your Hub, paste:

```
Bryn, help me decide which job my first specialist agent should take off my hands. Here are the jobs I repeat: <your list, or "help me make the list">.
```

She frames the choice, brainstorms with you, and for a bigger call offers her five scouts (she says what that costs first). When you've chosen, say **"file it"**: the job goes on her stone path.

**2. Find out how it's done well, with Louise.** Paste:

```
Louise, research how <the job> is done well: the usual steps, how good work is checked, and the common mistakes.
```

It goes on her list and she starts. A full run can take a while; open her door in the Agents tab to watch each stage. When she has shelved it, ask: `Louise, what do we have on <the job>?`

**3. Make the agent.** Pick a short key with dashes, like `weekly-review`, a name, and a few words for its job. Paste:

```
Make me a specialist agent with node 50-AI/workspace/agents/bin/new-agent.js <key> --name "<Name>" --title "<what it does, in a few words>" --color <the darker of my office's two colours>. Run it with --dry-run first, show me what it will make, and wait for my yes. When it's made, list its folder and tell me in plain words what each file is for.
```

Open the office and go to the **Agents** tab. Its office is there already, with its name on the door.

**4. Give it a history of its own.** Paste:

```
In 50-AI/agents/<key>, make a git repository: git init, a .gitignore with the lines dashboard/.pid, dashboard/dashboard.log and .claude/comms.db, then commit everything with the message "Made by new-agent". Show me each command before you run it.
```

**5. Put it in your own words.** Paste this whole prompt. Claude asks one thing at a time, so all you do is answer.

```
Interview me about my <key> agent. Read 50-AI/agents/<key>/ first, so you know what new-agent made, and read Bryn's stone for this job and Louise's book on it, so your questions build on them. Ask one question at a time, keep each one short, and wait for my answer. If I'm unsure, offer two or three options. Cover these, in order:

1. The job: what recurring work it is, how often it comes up, and what a finished piece of it looks like.
2. Its voice: how it should sound.
3. What it owns: the tasks it's responsible for, from start to finish.
4. Its fences: what it must never do. Start from these two and ask me what to add: it never sends money, emails or messages to anyone without a person saying yes, and it never deletes anything.
5. How it checks its own work before handing it to me.
6. Its facts: what it needs to know about me and my work, such as my services, prices, standard wording and where my files are in my Hub, and where each fact comes from.
7. Its routines: the two or three jobs it repeats. For each one, the steps and what "done" looks like. Use what Louise found where it fits, and tell me which parts came from her.
8. A practice task: a realistic sample job with made-up details, not a real customer's.
9. Its look: two colours for its office (offer my office's colours first), and whether I have a logo for it.

Then write my answers, in my words, to 50-AI/agents/<key>/BRIEF.md. Show it to me in full, change what I ask, and save it after my yes. Commit it in the agent's repository with the message "My brief".
```

**6. The agent org builds it.** First put the org in the agent's folder. In the same chat, paste:

```
Put the CTO org into my agent's folder with node 50-AI/workspace/bin/install.js org --into "50-AI/agents/<key>". Show me the plan first. After my yes, run it with --apply. Then set .claude/agents/org.config.json in that folder so the frontend department owns dashboard/** and the backend department owns rules/**, brains/**, memory/**, routines/**, CLAUDE.md and subagent.md. Show me the change before you save it, and commit both with the message "The build team".
```

Then open the agent's folder in a new window (in VS Code: File, Open Folder, then `<your Hub>/50-AI/agents/<key>`; in the desktop app, a new session on that folder), start a chat there, and paste:

```
Use the cto-james agent. Direction: build my specialist agent <Name> in this folder from three things: BRIEF.md (my own words), Bryn's stone for this job in <your Hub>/50-AI/agent-data/bryn/ (why I chose it), and Louise's book on it in <your Hub>/50-AI/research/ (how the job is done well, with sources). Keep the layout new-agent made. Fill in CLAUDE.md (every {{CLAUDE: ...}} note in it, and a "My routines" list), its rules in rules/ (its voice, what it owns, its fences, how it checks its work, and this lookup order for facts: its own facts first, then files I point it to, and if a fact is in neither, it says "not verified" instead of guessing), its facts in brains/ (each one followed by where it came from: "from me, in BRIEF.md" or Louise's book with its source), one routine per job in routines/<routine>.md with numbered steps and a "Done when" list, and its colours (and logo, if I have one) in agent.json. Route the work through Tim, and have John review every file against BRIEF.md before anything is final. Then show me every file in full and wait. Save only after my yes, and commit each approved change with a message saying what changed and why. End with James's three-line report.
```

On the office you'll see your session at its desk with James, Tim, a department head and a junior walking in and out as helpers, then John reviewing.

**7. Practice.** Open a new chat on your **Hub**, so the agent loads. Paste:

```
Use my <key> agent on the practice task in 50-AI/agents/<key>/BRIEF.md. Let it work the way it would on a real day. When it's finished, show me what it produced, and list anything it guessed, skipped or marked "not verified".
```

**8. Make one fix.** Look at the result the way a demanding manager would. What would you change first? Paste:

```
From that practice run, the one thing I want changed is: <what went wrong or felt off>. Make one fix so it doesn't happen again, in whichever file in 50-AI/agents/<key> is the real cause: its rules, a routine, or its facts. Show me the change and save it after my yes. Note what you changed and why in its memory, and commit it in the agent's repository with a message saying why.
```

**9. Give it a place in your Workspace.** Paste:

```
Add my <key> agent to my Workspace: in 50-AI/workspace/config/org-people.json, add "<key>": "<Name>" to the roster, so the office names its sessions. Show me the change, save it after my yes, and commit it on my own branch, my-workspace, with the message "Add <Name> to my roster". Then create a Work project for it at 50-AI/workspace/projects/<key>/, following the format in 50-AI/workspace/projects/README.md: a PROJECT.md with kind: project and order: 3, and three orders in steps/ for real work I want it to do next, each with the sections Why, What to do, Done when (as a checklist) and Who. Ask me what the three jobs are, one at a time, and show me every file before saving. Then run node 50-AI/workspace/bin/work.js list and tell me what the Work page shows, and mark this lesson done with node 50-AI/workspace/bin/work.js mark getting-started GS-09 done.
```

Your Work project stays on your computer: the Workspace's git setup leaves your own projects out. The roster line is saved on your own branch, so a Workspace update keeps it (`guides/09-updates.md`).

## What you should see

- Bryn's trailhead working through your question, then a new stone on her stone path.
- Louise at her computer, then a new book on her shelves.
- `new-agent` showing its plan, then the agent's office in the **Agents** tab straight away, in your colour. Its door opens into its dashboard.
- Claude asking questions one at a time, then showing you `BRIEF.md` before saving it.
- Helpers walking in and out on the Floor while the org builds, and every file shown to you before it's saved.
- A practice result that follows your routines, stays inside its fences, and marks anything it couldn't check as "not verified".
- `git log` in the agent's folder telling its story: made, your brief, the build team, the build, the fix.
- A new project on the Work page with three of your real orders in To do.

## If something's off

- **Bryn or Louise doesn't answer to her name.** Open a new chat on your Hub: a chat reads its agents when it starts. Then check the "Before you start" prompt again.
- **Louise's run is taking a long time.** That's normal for a full run. Carry on with steps 3 and 4 while she works, and come back for step 5.
- **No office in the Agents tab.** Ask Claude: "Check 50-AI/agents/<key>/agent.json exists and is valid JSON." Then reload the office page.
- **The chat in the agent's folder can't find James.** Check the org went in (step 6): `.claude/agents/cto-james.md` should be in the agent's folder. Then open a new chat in that window.
- **An edit is blocked by the path guard.** The department that owns that file isn't the one writing it. Ask Claude to compare `.claude/agents/org.config.json` with what you set in step 6.
- **It guessed instead of saying "not verified".** Make the lookup order stricter in its rules, and add the missing fact to its facts, with where it came from.
- **It did something it should never do, or came close.** Stop it. Add that action to its fences in plain words, and ask Claude to put the fence at the top of its rules.

## Done when

- [ ] Bryn has a stone for the job, and Louise has a book on how it's done well.
- [ ] `new-agent` made your agent, its office is in the Agents tab, and its folder is a git repository.
- [ ] `BRIEF.md` holds your own words, and the org built the agent from it, all approved by you.
- [ ] You ran a practice task and made one fix from it, committed with why.
- [ ] Its name is on the roster on your branch, and `projects/<key>/` is on the Work page with three real orders.

## What next

- **Keep improving your specialist.** Each time it gets something wrong, make one fix: a fence, a step in a routine, or a fact. A few weeks of small fixes teach it your work, and its git history remembers why.
- **Ask Bryn and Louise along the way.** Bryn, when it's time to decide what your agent should do next; Louise, when it needs to know something it doesn't.
- **Let it run longer.** Turn on walkaway mode (GS-04) in the folder where it works, hand it a few orders from its project, and let it work while you're away. When you're back, check the Work page and the Questions tab.
- **Get to know your Hub.** GS-10 shows you its zones and its map, and starts your first project in the right place.

When you've finished, tap **Mark done** at the top of this lesson, or ask Claude to run `node 50-AI/workspace/bin/work.js mark getting-started GS-09 done`.
