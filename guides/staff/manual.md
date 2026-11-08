# The staff manual: your office, page by page

For a firm's staff: bookkeepers, tax preparers and the people who run the office. You use Claude
mostly for accounting questions and admin help, not for writing software. This manual says what each
page of your office is for and how to use it on a normal day.

New here? Do the install first ([guide 11](../11-team-install.md)), then take the short course on the
Work page, **Start at the firm** (seven lessons). The [FAQ](faq.md) answers the common questions, the
[best practices](best-practices.md) say how to get good work out of AI, and the
[firm prompt library](../../prompts/firm.md) has prompts ready to copy.

**Contents:** [Two words first](#two-words-first) · [Today](#today) · [Work](#work) ·
[Calendar](#calendar) · [Agents](#agents) · [Universe](#universe) · [Floor](#floor) ·
[Your Hub and its fence](#your-hub-and-its-fence) · [When something is off](#when-something-is-off)

---

## Two words first

- **A chat** (also called a session) is one Claude Code conversation. You open it on your **Hub**
  folder, in VS Code or the Claude app, and type what you want in plain words.
- **Your office** is a page in your browser, at http://127.0.0.1:4316/ on your own computer. It shows
  your chats at work, your tasks, your calendar and your agents. Bookmark it.

The office runs on your computer. Nothing on it is shared with other staff.

## Today

Your start page. It answers "what am I doing today?"

- **Your assistant.** The office's executive assistant greets you and helps you plan the day. When you
  make your own assistant (guide 11, step 8), yours takes its place.
- **The morning plan.** The first time you open the office in a day, your assistant asks a few quick
  questions: what has to get done, what is already on your calendar, and what can wait. It then
  proposes a plan for the day. Press **Later** or **Skip today** if you don't want it.
- **Needs you.** When something is waiting on you (a question from a chat, a proposal to accept), your
  assistant says so at the top, one tap each.
- **Your day.** Today's calendar as a line, with now marked: where you are and what is next.
- **Happening now.** Who is working right now: your chats and agents.
- **Done.** The work you finished, so the end of the day has a list, not a feeling.

## Work

Your own work, organised your way. Work in a firm is not a production line: it is clients, deadlines,
follow-ups and the admin around them. The Work page holds it as boards.

### Boards

A board is a list of cards in columns, like sticky notes on a wall (it is often called a kanban).
You make as many boards as you like and name the columns yourself. Some examples:

- **Month-end:** To do · Waiting on client · In review · Done
- **Tax season:** Documents in · Preparing · Questions out · Ready to sign · Filed
- **Admin:** This week · Waiting · Done

Make one from the Work page, or ask in a chat:

```
Make me a board called "<name>" with the columns <column 1>, <column 2>, <column 3>. Then add these
cards to the first column: <one per line>.
```

### Cards (tasks)

Each card is one task. Give it a short name, and if it has one, a **due date**. Move a card to the
next column as it moves along. Keep client details out of the card title: a client code is enough
(see [best practices](best-practices.md)).

### Put a task on your calendar

A task with no time set aside tends not to happen. On a card, choose **Put it on my calendar**. The
office proposes a block of time for it on your Calendar, around what is already there. The block shows
as **proposed** until you **Accept** it (or **Decline** it, or move it).

To schedule a whole list at once, ask in a chat:

```
Here are my tasks for this week: <list, with due dates and how long each takes>. Propose a block on my
calendar for each one, around my meetings, with the most urgent first. Show me the plan before you add
anything.
```

### Repeating tasks

Some work comes back every week or month: bank reconciliations, a weekly report, payroll reminders.
Make it a **repeating** task and it comes back on its own, on the days you choose. Each time it comes
back, you can put it on the calendar the same way.

## Calendar

Your week, with your Google calendars in it, and the team's suggestions around them.

### Connect a Google calendar (read only)

1. In the office, open **Calendar**, then **Calendars**.
2. In Google Calendar, on a computer: **Settings**, pick the calendar under "Settings for my
   calendars", then **Integrate calendar**, and copy its **Secret address in iCal format**.
3. Paste it into the box for the right calendar (your firm calendar, or Personal) and press
   **Connect all**. Its events show within a minute.

The office only **reads** your Google calendar. It never adds, changes or deletes anything in Google.
The secret address stays on your computer, and the page never shows it again. If your work account
shows no secret address, your administrator has turned sharing off: ask the office manager.

### Your blocks and the team's proposals

- **Your blocks** are time you set aside yourself: add a **New block** on the Calendar page, or ask in
  a chat. A block can repeat on chosen days, and can remind you five minutes before it starts.
- **Proposals** are blocks your assistant suggests: from a task, from **Plan my day**, or from the
  morning plan. They show as **proposed**. Nothing is on your calendar until you **Accept** it.
- **Plan my day** asks your assistant to lay out a working day around what you already have.
- After a block ends, mark it **Done** or **Skip**. The week's score shows how the plan went, which is
  useful for planning the next week honestly.

## Agents

The Agents wing: one office per agent, each with a door that opens its own page.

- **Your assistant**: plans your day, answers questions about your work, and takes requests.
- **Tony, the accountant**: works the books with you (sorting and coding bank lines, closing the
  month). He never moves live money: he never sends an invoice, pays a bill, charges a card, runs
  payroll or moves funds. A week of books goes to QuickBooks only after a person clicks **Confirm** in
  Balnce.Pro; a chat message is never the Confirm. In a chat on your Hub, say "Ask Tony to ...".
- **Louise, the research librarian**: researches a question with a source for every fact, and keeps
  what she finds on shelves you can browse. In a chat on your Hub, say "Louise, research ...".
- **CBFC, the Academy**: a door that opens the CBFC Academy on this computer (the firm library, Ask
  CBFC and Planning). The Academy is installed on its own (guide 11, step 7).

Agents you build yourself get an office here too, by themselves. The course's last lesson, **Build
your own agent**, walks you through making one with Louise and the CTO org.

Each door has **Wake** and **Sleep**: Wake starts an agent's page, Sleep stops it.

## Universe

An org chart of the work: **you** at the top, **who did it** under you (your chats and agents, with
any helpers under them), and **where the work went** at the bottom (folders in your Hub, or "client
work"). Choose **Now**, **Last hour** or **Last 4 hours**. Tap a person to see their last steps in
plain words ("changed a file", "read a web page"). Tap a place to see who worked there. It never
shows a file's name or anything from a client's file.

## Floor

Each chat that is open on your computer, at its desk, with a line saying what it is doing right now.
Use it to see whether something is still working or waiting for you.

## Your Hub and its fence

Your **Hub** is one folder in your home folder (`Hub`) where all your AI work lives. It has numbered
areas (zones), such as `00-Inbox` for things that just arrived.

The **Hub fence** keeps Claude inside the Hub. A chat opened on your Hub reads and changes files only
inside it, so your Documents, Desktop, Downloads and the rest of your computer stay private.

- Always open Claude on the `Hub` folder itself.
- Need a file from elsewhere? Copy it into `Hub/00-Inbox` yourself, then ask Claude to use it.
- If Claude says `Outside the Hub: ...`, that is the fence working, not a fault.
- Client files belong where the firm keeps them. Follow the firm's rules on where client documents
  may be stored, and keep only what the task needs in your Hub.

## When something is off

- **The office page does not open.** Paste the install line from guide 11, step 5, again. It starts
  the office and changes nothing else.
- **A door says `Knocking…` for minutes.** Press its **Wake** button.
- **A chat can't find Tony or Louise by name.** Open a new chat on your Hub: a chat reads the agents
  when it starts.
- **Anything else.** Take a screenshot and send it to the office manager. The table at the end of
  [guide 11](../11-team-install.md) covers the usual install problems.
