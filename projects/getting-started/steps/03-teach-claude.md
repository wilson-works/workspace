---
id: GS-03
title: Teach Claude about you
minutes: 15
---
Every new chat starts fresh. Claude doesn't remember yesterday's conversation. A file called `CLAUDE.md` fixes most of that: Claude reads it at the start of every chat, so you only have to explain yourself once.

## What you'll get

- A personal `CLAUDE.md` that tells Claude who you are, how you like answers, and your house rules.
- Optional: a `CLAUDE.md` for one project folder.
- A quick test that shows Claude is using it.

## Where CLAUDE.md files live

| File | Where it is | Who reads it |
|---|---|---|
| Your personal one | `~/.claude/CLAUDE.md` | Every chat on this computer |
| A project's one | `CLAUDE.md` in the project's top folder | Only chats opened in that folder |

The `~` means your home folder (on Windows, something like `C:\Users\yourname`). When both exist, Claude reads both. Put things about you in the personal one, and things about one project in that project's file.

Keep them short. Claude reads every line in every chat, so one page of clear rules works better than ten pages of vague ones.

## Do this

**1. Let Claude interview you.** In any chat, paste this:

```
I want you to write my personal CLAUDE.md, the file you read at the start of every chat. Interview me first. Ask one question at a time and wait for my answer. Cover: who I am and what I do, what I'll mostly use you for, how I like answers (length, tone, lists or paragraphs), words or habits that annoy me, house rules you must always follow, and things you must never do without asking me. Then write a draft in short, plain bullet points, under 40 lines. If ~/.claude/CLAUDE.md already exists, show me what's in it first and merge into it instead of replacing it. Show me the draft and wait. Save it only after I say yes. When it's saved, tell me how to test it.
```

**2. Answer with specifics.** Good house rules are concrete. Some examples:

- Ask before deleting or moving any file.
- Explain what a command does before you run it.
- Keep answers under ten lines unless I ask for more.
- Use plain English, and explain any technical word the first time.

**3. Review the draft.** Cut anything vague. "Be helpful" changes nothing; "Give me the answer first, then the reasons" changes a lot. When it reads like you, say yes.

**4. Test it.** Close the chat and open a new one, so it starts by reading the new file. Paste:

```
Without looking anything up, tell me in three bullets what you know about me and how I like you to work.
```

**5. Add a project CLAUDE.md (optional).** Open a chat in a folder you work in often, such as a code project or a writing folder, and paste:

```
Write a CLAUDE.md for this folder. Look around the folder first so you understand what's in it, then ask me up to five questions about it, one at a time. Cover what this folder is for, any rules that apply only here, and what you should check before calling work finished. Keep it under 30 lines. Show me the draft, and save it only after I say yes.
```

**6. Add code house rules (optional).** If you'll use Claude for code, WorkSpace ships a set of workflow rules in `permissions/CLAUDE.workflow.md`. In a chat in the WorkSpace folder, paste:

```
Read permissions/CLAUDE.workflow.md. Explain each rule in one plain sentence, and tell me which ones you'd add to my personal CLAUDE.md and why. Don't change anything yet. When I've picked, add the ones I chose, show me the result, and save it after I say yes. Then mark GS-03 done with node bin/work.js mark getting-started GS-03 done.
```

## What you should see

- Claude asking you questions one at a time, then showing you a draft before saving anything.
- In the new chat, Claude describing you and your preferences without being told.

## If something's off

- **The new chat doesn't seem to know you.** The file may be in the wrong place, or the chat started before you saved. Ask Claude: "Show me the full path of my personal CLAUDE.md and its first five lines." Then open another new chat.
- **Claude ignores a rule.** Make the rule more specific and move it near the top. "Ask before deleting files" works better than "be careful".
- **The file got long.** Ask Claude: "Shorten my CLAUDE.md to the rules that change how you behave. Show me before you save."
- **Your two files disagree.** Ask Claude to read both and point out where they conflict. Then keep one rule and delete the other.

## Done when

- [ ] `~/.claude/CLAUDE.md` exists, and you approved what's in it.
- [ ] A new chat described you and your preferences correctly.
- [ ] (Optional) One project folder has its own `CLAUDE.md`.

When you've finished, tap **Mark done** at the top of this lesson, or ask Claude to run `node bin/work.js mark getting-started GS-03 done`.
