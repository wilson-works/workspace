# The firm prompt library

Prompts for accounting questions and admin help. Copy one, change the parts in `<angle brackets>`, and
paste it into a Claude Code chat opened on your **Hub** folder. Prompts that change something ask
Claude to show you first.

Keep client details out of prompts where you can: a client code, or the file in `00-Inbox`, is
enough. Follow the firm's rules on client information. The examples use an invented company,
Harbor Lane Coffee.

**Contents:** [Research and rules](#research-and-rules) · [Writing](#writing) ·
[Your day and week](#your-day-and-week) · [Boards and tasks](#boards-and-tasks) ·
[Documents and spreadsheets](#documents-and-spreadsheets) · [Month-end and checklists](#month-end-and-checklists) ·
[Tony](#tony) · [Build your own agent](#build-your-own-agent)

---

## Research and rules

**Research a question, with a source for every fact** (Louise)

```
Louise, research <the accounting or tax question>. Give me a source for every fact, say how current
each source is, and mark anything you could not verify as "not verified". End with a short answer in
plain words.
```

**What do we already have on it?**

```
Louise, what do we have on <topic>? List the books on your shelves that cover it, with the date of
each.
```

**Explain a rule in plain words**

```
Explain <the rule, form or term> in plain words, for someone who knows bookkeeping but not this
topic. Then give one worked example with made-up numbers, and name your source.
```

**Compare two options**

```
Compare <option A> and <option B> for <the situation, no client names>. A short table: what each
means, when each applies, and what to watch for. Name a source for each row, and tell me what a person
should decide.
```

## Writing

**Draft a client email**

```
Draft a short, friendly email to a client asking for <what you need, e.g. their October bank
statements> by <date>. From me, in plain words, no jargon, under 120 words. Leave <CLIENT NAME> as a
blank for me to fill in. Give me two versions: one warm, one brief.
```

**Make my email clearer**

```
Here is a draft email: <paste it>. Make it clearer and shorter without changing what it asks for.
Show me the new version, and list what you changed.
```

**Turn an email thread into a checklist**

```
Read the email thread I saved as <file name> in 00-Inbox. List every request and promise in it as a
checklist: who asked, what for, and by when. Mark anything that is unclear.
```

**Meeting notes to tasks**

```
Here are my meeting notes: <paste them, or the file in 00-Inbox>. Turn them into a list of tasks:
each one short, with who owns it and a due date if one was said. Then a three-line summary of what
was decided.
```

## Your day and week

**Plan my day**

```
Here is what I need to get done today: <list>. Look at my calendar for today and propose a plan:
the most urgent first, a block for each task around my meetings, and a short break every two hours.
Show me the plan before you add anything.
```

**Build my week**

```
Here are my tasks for this week, with due dates and roughly how long each takes: <list>. Spread them
across my week around what is already on my calendar, deadlines first, and no more than <hours>
hours of focused work a day. Show me the week before you propose any blocks.
```

**Schedule these tasks around my calendar**

```
Add these tasks to my "<board>" board with how long each takes and its due date, then find each one a
time on my calendar: <task, how long, due date; one per line>. I'll accept or move them on the
Calendar page.
```

**What did I get done?**

```
What did I finish today? A short list for my end-of-day notes, and anything I started but didn't
finish.
```

## Boards and tasks

**Make a board**

```
Make me a board called "<name>" with the columns <column 1>, <column 2>, <column 3>, <column 4>.
Then add these cards to the first column: <one per line, with a due date if there is one>.
```

**A tax-season board**

```
Make me a "Tax season" board from the tax-season starter. Add a card for each of these client codes
in the first column: <codes>.
```

**A repeating task**

```
Add a task "<name>" to my <board> board, due <date>, repeating every <day, week or month>, taking
about <length>. Then find it a time on my calendar.
```

**Move a card along**

```
On my <board> board, move "<task>" to <column>.
```

**What's late?**

```
Look at my boards. List every card that is past its due date or due in the next three days, oldest
first, with the board it is on.
```

## Documents and spreadsheets

**Summarize a long PDF**

```
Read <file name> in 00-Inbox. Give me a one-paragraph summary, then the key points as a list with
the page each one is on. Mark anything you could not read clearly.
```

**Find something in a document**

```
In <file name> in 00-Inbox, find every mention of <the term or figure>. Quote each one with its page.
```

**Spreadsheet help**

```
I have a spreadsheet <file name> in 00-Inbox. Explain what each column holds, then <what you want:
a formula for X, a pivot by month, find duplicates, check totals>. Show me the formula and where to
put it, and explain it in one line.
```

**Check the totals**

```
In <file name> in 00-Inbox, add up <the column or rows> and compare with the total the file shows.
Show your working, and list any row that looks wrong.
```

**Organize a folder in my Hub**

```
Look at the files in <folder in my Hub>. Propose a tidy folder layout and new names that say what
each file is and its date. Show me the full plan, and move nothing until I say yes.
```

## Month-end and checklists

**A month-end checklist**

```
Make me a month-end close checklist for a small business with <what they have: a bank account, a
credit card, payroll, sales tax>. In order, each step one line, with what "done" looks like. Mark
which steps Tony can help with and which need a person.
```

**Turn a checklist into a board**

```
Take this checklist: <paste it, or name the file>. Make a board for it called "<name>" with the
columns To do, Waiting, Done, and put every step in To do as a card, in order.
```

**A procedure I can hand to a colleague**

```
Write up how I do <the task> as a short procedure a new colleague could follow: numbered steps, what
to check at each step, and what "done" looks like. Ask me questions one at a time until you have
enough.
```

## Tony

**Hand Tony a job**

```
Ask Tony to <the job, e.g. sort and code this week's bank lines for client C03>. Tell me what he
needs from me, and show me his work before anything is final.
```

**Where does a client's month stand?**

```
Ask Tony where <client code>'s <month> stands: what is coded, what is waiting on a person, and what
is left before the month can close.
```

Tony never moves live money, and a week goes to QuickBooks only after a person clicks **Confirm** in
Balnce.Pro.

## Build your own agent

The course's last lesson, **Build your own agent**, is the full version. These are the steps on their
own.

**Choose the job**

```
Help me choose the first job to hand to an agent of my own. Here is the work I repeat every week or
month: <list, or "help me make the list">. For each, tell me how often it comes up, how much of it an
agent could do, and what a person must still check. Recommend one.
```

**Find out how it's done well** (Louise)

```
Louise, research how <the job> is done well at an accounting firm: the usual steps, how good work is
checked, and the common mistakes. A source for every fact.
```

**Make the agent**

```
Make me an agent with node 50-AI/workspace/agents/bin/new-agent.js <key> --name "<Name>" --title
"<what it does, in a few words>". Run it with --dry-run first, show me what it will make, and wait
for my yes. Then show me its office in the Agents wing.
```

**Have the CTO org build it from your words**

```
Use the cto-james agent. Direction: build my agent <Name> in this folder from BRIEF.md (my own words)
and Louise's book on the job in <my Hub>/50-AI/research/. Fill in its rules, its facts (each with
where it came from) and its routines. Route it through Tim, have John review every file against
BRIEF.md, and show me every file before saving.
```

**Teach it from a mistake**

```
My <key> agent got this wrong: <what happened>. Find the cause in 50-AI/agents/<key> (its rules, a
routine, or its facts) and make one fix so it doesn't happen again. Show me the change, save it after
my yes, and note what changed and why in its memory.
```

**Give it a new routine**

```
Add a routine to my <key> agent: <the job>. Write it in 50-AI/agents/<key>/routines/<routine>.md with
numbered steps, what it checks, and a "Done when" list. Then do one practice run on a made-up example
and show me the result.
```
