---
id: GS-01
title: Welcome to your office
minutes: 10
---
Your office is a page in your browser that shows every Claude Code chat running on your computer. Each chat is a person at a desk. In this lesson you find yourself on the floor and pass your first note.

A word you'll see a lot: a **session** is one Claude Code chat. Every new chat you open is a new session.

Tap the **Doing** button at the top of this lesson, so the Work page shows you've started.

## What you'll get

- The office open in your browser.
- Your own session on the **Floor**, with an avatar (a small picture) and a line saying what it's doing right now.
- Every chat on this computer, in any folder, reporting to the office.
- A note you typed in the office, delivered into a session.

## Do this

**1. Open a chat in the WorkSpace folder.** In VS Code, choose File, then Open Folder, and pick the folder you cloned WorkSpace into. Open the Claude Code panel and start a new chat.

**2. Start the office.** Paste this into the chat:

```
Start my WorkSpace office by running node bin/office-start.js from this folder. Tell me whether it started and what address to open in my browser.
```

Claude asks before it runs a command. Say yes. (GS-04 shows you how to cut down on these questions.)

**3. Open the office.** Go to [http://127.0.0.1:4316](http://127.0.0.1:4316) in your browser. The number 127.0.0.1 always means "this computer", so the page isn't on the internet.

**4. Find yourself on the Floor.** The **Floor** tab shows one person per running session. Look for the one whose line matches what you last asked Claude to do. Its name is a short one the office picked for it (on your first computer, the name of a tree).

**5. Let every chat report to the office.** Chats opened in the WorkSpace folder already show up. To make chats in your other folders show up too, and to let notes wake a chat that's waiting, install the office hooks. Hooks are small scripts Claude Code runs at set moments, such as right before it uses a tool. Paste this:

```
Run node bin/install.js hooks and explain in plain words what it would change. Don't change anything yet. If it looks safe, ask me, and only after I say yes, run node bin/install.js hooks --apply. When it's done, tell me where the backup of my old settings is, and tell me to close this chat and open a new one.
```

Then close the chat, open a new one in the WorkSpace folder, and find yourself on the floor again.

**6. Open your panel.** Click your person. The panel shows what the session has been doing, its helpers, and a box to send it a note.

Helpers (Claude Code calls them subagents) are extra Claude workers a session sends off to do a side job. On the floor they walk in, work, and walk out.

**7. Give your session some work.** This is your first real prompt. It takes a minute or two, which gives you time to send a note while it works:

```
Give me a tour of this WorkSpace folder. Go through the top-level folders one at a time and tell me in plain words what each one is for. Send a helper to look at the bin folder, so I can watch one walk in and out on the office floor. When you're done, tell me the three folders a beginner will use most.
```

**8. Send a note.** While Claude is still working, type this in the note box on your panel and send it:

```
Note from the office: when you finish the tour, end your answer with the words "note received".
```

**9. Watch it arrive.** A note is handed to the session the next time it uses a tool, so it lands in the middle of the task. If the session had already finished and was waiting for you, the note wakes it up.

## What you should see

- Your person on the floor, with its one-line description changing as Claude works.
- A helper appearing beside your desk while it looks at the bin folder, then leaving.
- In the chat, Claude picking up your note and ending its answer with "note received".

## If something's off

- **The page won't open.** The office isn't running. Ask Claude to run node bin/office-start.js again and show you any error it prints.
- **Your person isn't on the floor.** Check the chat is open in the WorkSpace folder, or that the hooks are installed (step 5). A chat that was already open before the hooks went in doesn't have them, so start a new one.
- **The note never arrives.** Check you sent it to the right person. If the session is idle and doesn't wake, type anything in its chat. The note is handed over along with your message.
- **No helper appeared.** Claude doesn't always use one. Ask it: "Use a helper for the next part, so I can see it on the floor."

## Done when

- [ ] The office is open at http://127.0.0.1:4316.
- [ ] The office hooks are installed, and you found your own session on the Floor.
- [ ] You opened your session's panel and sent it a note, and Claude responded to it in the chat.
- [ ] You saw a helper walk in and out.

When you've finished, tap **Mark done** at the top of this lesson, or ask Claude to run `node bin/work.js mark getting-started GS-01 done`.
