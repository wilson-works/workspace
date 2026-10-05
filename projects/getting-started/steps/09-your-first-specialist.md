---
id: GS-09
title: "Capstone: your first specialist"
minutes: 60
---
The org is a general team. A specialist is an agent built for one job you do over and over, with your facts and your rules. In this last lesson you build one for your own work, practice with it, improve it once, and give it its own project on the Work page.

Pick a job you repeat every week or every month. Some ideas:

- **Bookkeeping**: sorting receipts, matching payments, a monthly summary.
- **Content and social posts**: drafting posts from your notes, in your voice.
- **Client onboarding**: welcome messages, checklists, collecting what you need from a new client.
- **Research briefs**: a one-page summary of a topic, with sources.
- **Sales follow-up**: who to contact next, with a draft message for each.
- **Scheduling**: planning your week and preparing for meetings.

## What you'll get

- **An agent file** at `~/.claude/agents/<slug>.md`. It gives the agent a name and a voice. It says what the agent owns, what it never does (its fences, such as never sending money or emails without a person saying yes), and how it checks its own work. It also sets where the agent looks up facts: its own reference notes first, and if a fact isn't there, it says "not verified" instead of guessing.
- **Two or three skills** at `~/.claude/skills/<slug>-<workflow>/SKILL.md`. Each skill is one repeatable job, with clear steps and a "Done when" list.
- **Reference notes** at `~/.claude/notes/<slug>.md`: the facts about your work that the agent reads, each with where it came from.
- **A practice run** on a realistic sample task, and one fix based on what the practice showed.
- **A place in your office**: its name in the roster, and its own project on the Work page.

A slug is a short lowercase name with dashes, like `client-onboarding`. Files in `~/.claude` work in every folder on this computer.

## Do this

**1. Run the interview.** Open a new chat in the WorkSpace folder and paste this whole prompt. It's long on purpose. Claude asks you one thing at a time, so all you do is answer.

```
Help me build my first specialist: an agent for one job I do over and over. Interview me first. Ask one question at a time, keep each question short, and wait for my answer before the next one. If I'm unsure, offer two or three options. Cover these, in order:

1. The job: what recurring work it is, how often it comes up, and what a finished piece of it looks like.
2. A name and a voice: what to call it, and how it should sound.
3. What it owns: the tasks it's responsible for, from start to finish.
4. Its fences: what it must never do. Start from these two and ask me what to add: it never sends money, emails or messages to anyone without a person saying yes, and it never deletes anything.
5. How it checks its own work before handing it to me.
6. Its facts: what it needs to know about me and my work, such as my services, prices, standard wording and where my files are, and where each fact comes from.
7. Its workflows: the two or three jobs it repeats. For each one, the steps and what "done" looks like.
8. A practice task: a realistic sample job with made-up details, not a real customer's.

When the interview is done, pick a slug (a short lowercase name with dashes) and build all of this, without saving anything yet:

- An agent file at ~/.claude/agents/<slug>.md with its name, its voice, what it owns, its fences, how it checks its own work, and this lookup order for facts: its reference notes first, then files I point it to. If a fact isn't in either, it says "not verified" instead of guessing.
- Two or three skills at ~/.claude/skills/<slug>-<workflow>/SKILL.md, one repeatable job each, with numbered steps and a "Done when" list. The agent file names each skill and when to use it.
- A reference notes file at ~/.claude/notes/<slug>.md with the facts from the interview, each one followed by where it came from, like "(from me, in the interview on <date>)".

Show me every file in full and wait. If I ask for changes, make them and show me again. Save only after I say yes. When everything is saved, tell me the slug and how to start the practice run.
```

**2. Review and approve.** Read every file Claude shows you. Look hardest at the fences and at the lookup order for facts. Ask for changes until it's right, then say yes.

**3. Practice.** Open a new chat, so the new agent and skills load. Paste:

```
Use my <slug> agent on the practice task from our interview. Let it work the way it would on a real day. When it's finished, show me what it produced, and list anything it guessed, skipped or marked "not verified".
```

**4. Make one fix.** Look at the result the way a demanding manager would. What would you change first? Then paste:

```
From that practice run, the one thing I want changed is: <what went wrong or felt off>. Make one fix so it doesn't happen again, in whichever file is the real cause: the agent file, one of its skills, or its reference notes. Show me the change, and save it after I say yes.
```

**5. Give it a place in your office.** In a chat in the WorkSpace folder, paste:

```
Give my specialist a place in my office. First, add "<slug>": "<its name>" to the roster in config/org-people.json, and keep everything else in that file as it is. Next, give it its own office in the Agents' wing: in config/agents.json, replace the "your-specialist" placeholder with an entry for my specialist (key <slug>, its name, a short title, a one-line description of its job, status live, the machine it works on from workspace.config.json, match words from its name and folder, and brand colors that suit it; ask me if I have a logo for it, and if I do, copy it to public/agents/<slug>.svg or .png and set brand.mark to /agents/<file>). Then create a new Work project at projects/<slug>/ following the format in projects/README.md: a PROJECT.md with kind: project and order: 3, and three orders in steps/ for real work I want my specialist to do next, each with the sections Why, What to do, Done when (as a checklist) and Who. Ask me what the three jobs are, one at a time, before you write them. Show me every file before saving. When they're saved, restart the office, run node bin/work.js list, and tell me what the Work page shows. Then mark GS-09 done with node bin/work.js mark getting-started GS-09 done.
```

Your new project stays on your computer. WorkSpace's git setup leaves your own projects out, so they're never pushed by accident.

## What you should see

- Claude asking questions one at a time, then showing you every file before saving any of them.
- A practice result that follows your steps, stays inside its fences, and marks anything it couldn't check as "not verified".
- Your specialist's name in `config/org-people.json`.
- Its own office in the **Agents** tab, in its colors, with its name on the door. If it gets a dashboard of its own one day, add its address to its entry in `config/agents.json` and the door opens into it.
- A new project on the Work page with three of your real orders in To do.

## If something's off

- **A new chat can't find the agent.** Check the file is in `~/.claude/agents/` and ends in `.md`, then open another new chat. Ask Claude: "List the agents you can use."
- **It guessed instead of saying "not verified".** Make the lookup order stricter in the agent file, and add the missing fact to its reference notes, with where it came from.
- **It did something it should never do, or came close.** Stop it. Add that action to its fences in plain words, and ask Claude to put the fence near the top of the agent file.
- **The new project isn't on the Work page.** Ask Claude to run node bin/work.js list and compare the project's files with the format in projects/README.md.
- **The office doesn't show its name.** Restart the office after any change to `config/org-people.json`.

## Done when

- [ ] Your specialist has an agent file, two or three skills and a reference notes file, all approved by you.
- [ ] You ran a practice task and made one fix from it.
- [ ] Its name is in the roster in `config/org-people.json`, and it has an office in the Agents tab.
- [ ] `projects/<slug>/` is on the Work page with three real orders.

## What next

You've finished the course. Some ways to keep going:

- **Keep improving your specialist.** Each time it gets something wrong, make one fix: a fence, a step in a skill, or a fact in its notes. A few weeks of small fixes teach it your work.
- **Give it a teammate.** Build a second specialist for the next job on your list, or a reviewer that checks the first one's work before it reaches you.
- **Let it run longer.** Turn on walkaway mode (GS-04) in the folder where it works, hand it a few orders from its project, and let it work while you're away. When you're back, check the Work page and the Questions tab.

When you've finished, tap **Mark done** at the top of this lesson, or ask Claude to run `node bin/work.js mark getting-started GS-09 done`.
