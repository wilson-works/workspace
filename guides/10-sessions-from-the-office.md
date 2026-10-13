# 10. Sessions from the office: Claude at work while you are away from the keyboard

The office can start Claude Code sessions itself. You say what you want on the office page (on your
computer or your phone), pick a model and how hard it should think, and a session starts in the
background. No VS Code window, no terminal. It works on its own, you read its reply on the page,
and a note from you starts its next turn. A session can hand a piece of its work to a **helper**
session, and the helper's report comes back to it the same way. The **Team** tab shows who is
working for whom.

This is how we run our own office: one person, a phone, and a team of Claude sessions that pass work
down and report back up. It works on one computer, and on several (the last section).

## What you need

- The Workspace installed (guide 1) and the office running (`node bin/office-start.js`).
- **Claude Code signed in on this computer.** The office uses the Claude Code you already have: the
  one the VS Code extension carries, or `claude` on your PATH. Sessions bill the Claude account that is
  signed in on this computer, the same as your chats. To point it at one copy, set
  `WORKSPACE_CLAUDE_EXE` to its full path before you start the office.
- **The office's hooks on your Hub** (`node bin/install.js hooks --apply`, which the installer does for
  you). Sessions start in your Hub, so its `CLAUDE.md`, its rules and the office's hooks are theirs
  too. Without a Hub they start in your home folder.
- For the buzz on your phone: guide 2, section 6.

## Start one

1. Open the office and press **New session** (on a phone, the round **+** button).
2. Say what it should do, the way you would in a chat.
3. Pick, or take the defaults:
   - **Start from**: one tap for a common setup. *Build* (Opus, for code and real work), *Review*
     (Fable, reads and judges, changes nothing), *Research* (Sonnet), *Quick errand* (Haiku).
   - **Model** and **Effort**. The default is Opus on **medium**: right for most work, and kind to
     your usage. Pick a higher effort only when the job needs it.
   - **Hands**: *Careful* (it works on its own; Claude Code turns down anything risky), *Full* (nothing
     is asked; your hooks and deny rules still apply, see guide 3), or *Plan only* (it writes a plan
     and changes nothing).
   - **Buzz my phone when it replies**: on by default for sessions you start.
   - Under **More choices**: who sits in the chair (any agent of your org, guide 5), which project it
     works in (each repo in your code folders), the time cap per turn, and its name on the floor.
4. Press **Start**. It shows on the floor within seconds, with a small **office** tag on its desk.

Open its desk to see its card: the model, effort, hands and cap, where its turn stands, what it was
asked, and its conversation (your words and its final replies, read from its own session log when
you open it). **Stop this turn** stops it mid-turn; **Close** ends it (it keeps its conversation, and
**Reopen** brings it back). To carry on in a normal chat instead, run `/resume` in Claude Code on that
computer and pick it by name.

## Talk to it

Type in the box at the bottom of its card. A note to a session the office started **starts its next
turn within seconds**: it reads your note, works, and replies on the page. If it is mid-turn, it reads
the note at its next step.

When it needs a decision only you can make, it asks on the office (`bin/ask-owner.js`), with what it
would do. Your answer starts its next turn.

## Helpers: handing work down

Any session (one the office started, or a chat you opened yourself) can hand a self-contained piece
of work to a helper:

```
node <your Hub>/50-AI/workspace/bin/office-spawn.js "what to do, with everything they need" --name "Short name"
     [--model opus|sonnet|haiku|fable] [--effort low|medium|high|xhigh|max] [--hands careful|full|plan]
     [--cap 15|30|60|120|240] [--in <project>] [--as <agent>]
```

Sessions the office starts are told how to do this, so you rarely type it yourself. You can also
press **Hand work down** on any desk. The helper starts in the background, sits beside its lead on the
floor and under it on the Team chart, and when its turn ends **its report comes back to the lead as a
note**: a chat wakes up to it, and a session the office started gets its next turn.

Three rules keep helpers from running up your usage:

- A helper **never runs at a higher effort than its lead**. A lead on medium can hand down low or
  medium work; a lead on high can also hand down high.
- A **Fable helper runs on low effort only.** Most helper work belongs on Opus, medium, which is the
  helper default.
- Limits in `config/dispatch.json`: at most 6 sessions working at once on a computer, 6 helpers per
  lead, 3 levels deep, 20 turns an hour per session.

A session you start yourself from the page is your choice: these rules are for helpers.

## When your phone buzzes

Only for two things:

- a **question** a session asked you; and
- a **reply to your own words**: the reply to a session you started, a note you sent it, or your
  answer to its question.

Never for a helper's report to its lead, the group chat, or the office's own nudges. The buzz says
that it replied, never what; tapping it opens its chart. Turn it off per session on its card.

## Private work

A project under `privacy.private_work` (guide 4) is private work here too: its desk shows no title or
steps, its card shows no brief, and the office never reads its conversation. Its replies stay in the
session; read them with `/resume` on that computer.

## Settings

Every choice the page offers is in `config/dispatch.json`: the models and their ids, the efforts, the
hands, the presets, the defaults, the helper defaults and the limits. A request naming anything else is
refused. When a newer Claude model comes out, change its `id` there.

## Several computers

With the shared office set up (guide 2, then guide 7), the New session sheet on the hub has a
**Computer** choice: start a session on any of your computers from one page, your phone included. See
guide 7, *Sessions on another computer*.

## If something's off

- **"Claude Code isn't installed where the office can find it."** Sign in to Claude Code on this
  computer (`claude` in a terminal), or set `WORKSPACE_CLAUDE_EXE` to it, then restart the office.
- **It stopped: "The plan's usage limit was reached."** Your Claude plan's window is used up. A note
  tries again once it resets.
- **"Claude Code on this computer needs signing in again."** Run `claude` in a terminal and sign in.
- **It never appears on the floor.** Check its log: `<office home>/dispatch/logs/<id>.log` (the office
  home is in `workspace.config.json` `office.home`).
- **It "ran past its cap".** Give it a longer cap under More choices, or split the job.
