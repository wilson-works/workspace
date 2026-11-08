# Staff FAQ

Short answers to the questions staff ask most. The [manual](manual.md) has the longer version of
each page, and [best practices](best-practices.md) say how to get good work out of AI.

**Contents:** [Privacy and client data](#privacy-and-client-data) · [Asking questions](#asking-questions) ·
[Tony and the books](#tony-and-the-books) · [Work and calendar](#work-and-calendar) ·
[Agents](#agents) · [Usage and help](#usage-and-help)

---

## Privacy and client data

**Is my client data safe?**
The office and your agents run on your own computer, and the office page opens at an address on that
computer (127.0.0.1). What you type into a chat is sent to Claude to answer it, under the
firm's Claude account. Follow the firm's rules on which client information may be used with AI, and
keep client files where the firm keeps them.

**What can Claude see on my computer?**
With the Hub fence on (guide 11 installs it), a chat opened on your Hub reads and changes files only
inside your `Hub` folder. Your Documents, Desktop, Downloads and other folders stay private.

**Why did Claude say `Outside the Hub: ...`?**
That is the fence working. It refused to read or change a file outside your Hub. Copy the file you
need into `Hub/00-Inbox` yourself, then ask again.

**Is the fence perfect?**
It has two layers: Claude Code's own setting that blocks files outside the Hub, and a check on every
command. The check reads the command; a program that works out its own path while it runs could get
past that second layer. So the fence is a strong guard, not a reason to keep client files in your Hub
longer than the task needs.

**Can other staff see my office or my chats?**
No. Your office runs on your computer and shows only your own chats and agents.

**Should I put client names in a task or a board?**
Use a client code or a short label instead of a full name where you can. Follow the firm's rules on
naming clients.

## Asking questions

**How do I ask an accounting or tax question and get a source?**
Ask Louise. In a chat on your Hub: "Louise, research <your question>. Give me a source for every
fact." She keeps what she finds on her shelves, so you can find it again later with "Louise, what do
we have on <topic>?"

**What if the answer is wrong?**
It can be. AI can sound sure and still be wrong, especially on numbers, dates and recent rule changes.
Check the source it gives, check every number against the original document, and ask a person when it
matters. If it states something without a source, ask "Where does that come from?"

**Why does it sometimes say "not verified"?**
That is good behaviour. It means it could not find a source for that fact, and it is telling you
instead of guessing.

**What is the CBFC Academy door for?**
It opens the CBFC Academy on your computer: the firm library, Ask CBFC and Planning. For the firm's own
procedures, start there.

**Do I need to know how to code?**
No. You type what you want in plain words. Prompts in the [firm prompt library](../../prompts/firm.md)
are ready to copy: change the parts in `<angle brackets>` and send.

**Why open a new chat for each task?**
A chat remembers everything said in it. A fresh chat for a new task keeps old details from mixing in,
and keeps answers sharper.

## Tony and the books

**How do I hand something to Tony?**
In a chat on your Hub: "Ask Tony to <the job>." His own page opens from his door in the Agents wing.

**Can Tony pay a bill or send an invoice?**
No. Tony never sends an invoice, pays a bill, charges a card, runs payroll or moves funds. Live money
is always a person's.

**When does a week of books go to QuickBooks?**
Only after a person clicks **Confirm** in Balnce.Pro. A chat message is never the Confirm.

**Tony says his full training is private. What does that mean?**
His basic setup works on its own. His full playbooks are a private package for people the firm gives
access to (guide 11, step 9). Ask the office manager if your work needs it.

## Work and calendar

**How do I make a board?**
On the Work page, make a new board and name its columns, or ask in a chat: "Make me a board called
<name> with the columns <A>, <B>, <C>." The [manual](manual.md#work) has examples for month-end and
tax season.

**How do I get a task onto my calendar?**
Tap the task's card, then **Find me a time**. The office proposes a time in office hours before it is
due, around your meetings. It is only on your calendar once you **Accept** it. Or choose a day and
time yourself and press **Pick this time**.

**How do I connect my Google calendar?**
Calendar, then **Calendars**. Paste your Google calendar's **Secret address in iCal format** (Google
Calendar, Settings, the calendar, Integrate calendar) into its box and press **Connect all**. The
[manual](manual.md#calendar) has the steps.

**Will the office change my Google calendar?**
No. It only reads it. It never adds, changes or deletes anything in Google. Blocks you accept live on
your office's own calendar.

**My work account shows no secret address.**
Your administrator has turned that kind of sharing off. Ask the office manager.

**Can a task come back every week?**
Yes: make it a repeating task and choose its days.

## Agents

**Who is in my Agents wing?**
Your assistant, Tony (the accountant), Louise (the research librarian) and the CBFC Academy door. An
agent you build yourself gets its own office there too.

**Can I build my own agent?**
Yes. The last lesson of the **Start at the firm** course walks you through it: pick a job you repeat,
have Louise research how it is done well, make the agent, and have the CTO org build it from your own
words. Nothing goes live without your yes.

**What is the CTO org?**
A team of agents (James plans, Tim routes the work, John checks every change before it is final). At a
firm they are most useful for building and improving your own agents and tools. The course's sixth
lesson introduces them.

**An agent did something I didn't like. What do I do?**
Tell it what was wrong and ask it to make one fix so it doesn't happen again. Agents keep their rules
and lessons in plain files you can read. If it did something it must never do, stop the chat and tell
the office manager.

## Usage and help

**Does this cost money?**
The Workspace itself does not. Every chat uses the firm's Claude plan and counts against its usage.
Sign in with the account the firm gave you, never a personal card.

**How do I use less?**
One task per chat, short clear asks, and close chats you are finished with. A long research run with
Louise uses more than a quick question, so save those for questions that need sources.

**Who do I ask for help?**
The office manager. Send a screenshot of what you see. The table at the end of
[guide 11](../11-team-install.md) covers the common install problems.
