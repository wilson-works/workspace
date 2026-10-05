---
id: GS-09
title: "Capstone: your first specialist"
minutes: 60
---
The org is a general team. A specialist is an agent built for one job you do over and over, with your facts and your rules. In this lesson you make one with `new-agent`, fill it in through an interview, practice with it, improve it once, and give it its own project on the Work page. Its office in the Agents wing appears by itself.

Pick a job you repeat every week or every month. Some ideas:

- **Bookkeeping**: sorting receipts, matching payments, a monthly summary.
- **Content and social posts**: drafting posts from your notes, in your voice.
- **Client onboarding**: welcome messages, checklists, collecting what you need from a new client.
- **Research briefs**: a one-page summary of a topic, with sources.
- **Sales follow-up**: who to contact next, with a draft message for each.
- **Scheduling**: planning your week and preparing for meetings.

## What you'll get

- **The agent's own folder** in your Hub, `50-AI/agents/<key>/`, made by `new-agent`: its `agent.json` (who it is, and how its office looks), its rules, its facts, its memory, and a small dashboard.
- **An office in the Agents wing**, in its colours, with its name on the door and a door into its dashboard. Nobody edits a list for this: the office finds the agent's `agent.json` by itself.
- **Its rules and facts, filled in from an interview**: what it owns, what it never does (its fences, such as never sending money or emails without a person saying yes), how it checks its own work, and the facts it works from, each with where it came from. If a fact isn't there, it says "not verified" instead of guessing.
- **Two or three skills** for the jobs it repeats, each with clear steps and a "Done when" list.
- **A practice run** on a realistic sample task, and one fix based on what the practice showed.
- **Its own project** on the Work page, with its next three real jobs.

The `key` is a short lowercase name with dashes, like `client-onboarding`. It is the agent's folder name and how your chats call it.

## Do this

**1. Make the agent.** Open a new chat on your Hub (VS Code or the desktop app) and paste this, with your own key, name and title:

```
Make me a specialist agent with node 50-AI/workspace/agents/bin/new-agent.js <key> --name <Name> --title "<what it does, in a few words>". Show me what it will make before it makes it, and wait for my yes. When it's made, list its folder, and tell me in plain words what each file is for.
```

Then open the office and go to the **Agents** tab. Your agent's office is there already, with its name on the door.

**2. Run the interview.** In the same chat, paste this whole prompt. It's long on purpose. Claude asks you one thing at a time, so all you do is answer.

```
Now fill in my <key> agent. First read everything new-agent made in 50-AI/agents/<key>/, so you know where its rules, facts, memory and skills go. Then interview me. Ask one question at a time, keep each question short, and wait for my answer before the next one. If I'm unsure, offer two or three options. Cover these, in order:

1. The job: what recurring work it is, how often it comes up, and what a finished piece of it looks like.
2. Its voice: how it should sound.
3. What it owns: the tasks it's responsible for, from start to finish.
4. Its fences: what it must never do. Start from these two and ask me what to add: it never sends money, emails or messages to anyone without a person saying yes, and it never deletes anything.
5. How it checks its own work before handing it to me.
6. Its facts: what it needs to know about me and my work, such as my services, prices, standard wording and where my files are in my Hub, and where each fact comes from.
7. Its workflows: the two or three jobs it repeats. For each one, the steps and what "done" looks like.
8. A practice task: a realistic sample job with made-up details, not a real customer's.
9. Its look: two colours for its office, and whether I have a logo for it.

When the interview is done, write it all into the files new-agent made, without saving anything yet: its rules (voice, what it owns, its fences, how it checks its work, and this lookup order for facts: its own facts first, then files I point it to, and if a fact is in neither, it says "not verified" instead of guessing), its facts (each one followed by where it came from, like "(from me, in the interview on <date>)"), one skill per workflow with numbered steps and a "Done when" list, and its colours (and logo, if I have one) in its agent.json. Show me every file in full and wait. If I ask for changes, make them and show me again. Save only after I say yes.
```

**3. Review and approve.** Read every file Claude shows you. Look hardest at the fences and at the lookup order for facts. Ask for changes until it's right, then say yes. Reload the Agents tab: its office now wears its colours.

**4. Practice.** Open a new chat on your Hub, so the new agent and its skills load. Paste:

```
Use my <key> agent on the practice task from our interview. Let it work the way it would on a real day. When it's finished, show me what it produced, and list anything it guessed, skipped or marked "not verified".
```

**5. Make one fix.** Look at the result the way a demanding manager would. What would you change first? Then paste:

```
From that practice run, the one thing I want changed is: <what went wrong or felt off>. Make one fix so it doesn't happen again, in whichever file is the real cause: its rules, one of its skills, or its facts. Show me the change, and save it after I say yes. Note what you changed and why in its memory.
```

**6. Give it work on the Work page.** In a chat on your Hub, paste:

```
Create a new Work project for my <key> agent at 50-AI/workspace/projects/<key>/, following the format in 50-AI/workspace/projects/README.md: a PROJECT.md with kind: project and order: 3, and three orders in steps/ for real work I want my specialist to do next, each with the sections Why, What to do, Done when (as a checklist) and Who. Ask me what the three jobs are, one at a time, before you write them. Show me every file before saving. When they're saved, run node 50-AI/workspace/bin/work.js list and tell me what the Work page shows. Then mark GS-09 done with node 50-AI/workspace/bin/work.js mark getting-started GS-09 done.
```

Your new project stays on your computer. The Workspace's git setup leaves your own projects out, so they're never pushed by accident.

## What you should see

- `new-agent` showing you its plan, then the agent's folder in `50-AI/agents/<key>/`.
- Its office in the **Agents** tab straight away, with its name on the door, and its colours once you've approved the interview. Its door opens into its dashboard.
- Claude asking questions one at a time, then showing you every file before saving any of them.
- A practice result that follows your steps, stays inside its fences, and marks anything it couldn't check as "not verified".
- A new project on the Work page with three of your real orders in To do.

## If something's off

- **No office in the Agents tab.** Ask Claude: "Check 50-AI/agents/<key>/agent.json exists and is valid JSON." Then reload the office page.
- **A new chat can't find the agent.** Open another new chat on your Hub: a chat reads its agents when it starts. Ask Claude: "List the agents you can use."
- **It guessed instead of saying "not verified".** Make the lookup order stricter in its rules, and add the missing fact to its facts, with where it came from.
- **It did something it should never do, or came close.** Stop it. Add that action to its fences in plain words, and ask Claude to put the fence at the top of its rules.
- **The new project isn't on the Work page.** Ask Claude to run `node 50-AI/workspace/bin/work.js list` and compare the project's files with the format in `projects/README.md`.

## Done when

- [ ] `new-agent` made your agent, and its office is in the Agents tab.
- [ ] Its rules, facts and two or three skills are filled in from the interview, all approved by you.
- [ ] You ran a practice task and made one fix from it.
- [ ] `projects/<key>/` is on the Work page with three real orders.

## What next

- **Keep improving your specialist.** Each time it gets something wrong, make one fix: a fence, a step in a skill, or a fact. A few weeks of small fixes teach it your work.
- **Give it a teammate.** Make a second specialist for the next job on your list, or a reviewer that checks the first one's work before it reaches you. `guides/08-agents.md` also shows how to install an agent someone gave you.
- **Let it run longer.** Turn on walkaway mode (GS-04) in the folder where it works, hand it a few orders from its project, and let it work while you're away. When you're back, check the Work page and the Questions tab.
- **Get to know your Hub.** GS-10 shows you its zones and its map, and starts your first project in the right place.

When you've finished, tap **Mark done** at the top of this lesson, or ask Claude to run `node 50-AI/workspace/bin/work.js mark getting-started GS-09 done`.
