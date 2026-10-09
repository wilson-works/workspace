# WilsonWorks Workspace

**Everything you need to run your work with Claude Code: one Hub to keep it in, the skills to get
started, an office where every session shows up, specialist agents with an office of their own, and
your computers working together.**

Every Claude Code chat you run, in VS Code or in the Claude desktop app, becomes a person at a desk.
You see what each one is doing right now, the helpers it sends off and brings back, and you can send
any of them a note, from your desk or your phone. Sessions ask you questions in plain English, and
your phone buzzes when one does.

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ ● WorkSpace · Example Co.    All 3   DESK 2   LAPTOP 1     Floor Work …  │
  ├──────────────────────────────────────────────────────────────────────────┤
  │  [my-app]                         [website]                              │
  │   James-1-Planning  ◉ Reading files     Cedar  ◉ Running a command       │
  │     └ Tim  · Routing order DA-01           └ helper · Checking links     │
  │   Gavin-1-Tip buttons ◉ Editing files                                    │
  └──────────────────────────────────────────────────────────────────────────┘
```

## Install with Claude

Make a folder called `Hub` in your user folder, open it in Claude Code (the VS Code extension, or the
Code tab of the Claude desktop app), start a chat and paste:

```
Set up my WilsonWorks Workspace from https://github.com/wilson-works/workspace, following SETUP.md.
```

What happens next:

1. **A short chat about how you want it to feel and look**: what your office is called, its mood (a
   calm studio, a busy newsroom, a cosy library), two colours to match, your logo if you have one, and
   what your sessions call you.
2. **Claude installs it**, with Louise and Bryn, showing you the plan first, and opens your office in
   your colours.
3. **You meet your first agents**: you bring Bryn a small decision and ask Louise one question.
4. **You build your first agent of your own, together**: Bryn helps you choose the job it takes off
   your hands, Louise researches how that job is done well, and the agent org builds it, in your own
   words, in your Hub.

Nothing runs without your yes, and you can stop after any step. [SETUP.md](SETUP.md) is the runbook
Claude follows. You need Claude Code, [Node.js](https://nodejs.org) 20 or newer and
[Git](https://git-scm.com/downloads).

## Send it to someone

Copy this message and send it to anyone who would like a Workspace of their own:

```text
I've been using the WilsonWorks Workspace, a free setup for Claude Code: one folder for all your work, an office page where every Claude chat shows up as a person at a desk, and two free agents, Louise for research and Bryn for thinking decisions through. It's here: https://github.com/wilson-works/workspace

You need three things first: Claude Code (in VS Code or the Claude desktop app, https://claude.com/claude-code), Node.js 20 or newer (https://nodejs.org) and Git (https://git-scm.com/downloads).

Then make a folder called Hub in your user folder, open it in Claude Code, start a chat and paste this line:

Set up my WilsonWorks Workspace from https://github.com/wilson-works/workspace, following SETUP.md.

Claude asks how you'd like your office to look and feel, installs it, introduces you to Louise and Bryn, and helps you build your first agent of your own. It shows you every step before it does it.
```

New features arrive the same way, as one line to paste: Claude merges them into your own copy and
keeps everything you changed ([guide 9](guides/09-updates.md)).

## Install in one line

The other way, from a terminal. **Windows** (PowerShell):

```
irm https://raw.githubusercontent.com/wilson-works/workspace/main/install.ps1 | iex
```

**macOS** (Terminal):

```
curl -fsSL https://raw.githubusercontent.com/wilson-works/workspace/main/install.sh | sh
```

You need [Node.js](https://nodejs.org) 20 or newer and [Git](https://git-scm.com/downloads); the
installer checks for both and says where to get anything missing. It shows its plan before every
step, never replaces a file of yours, and can be run again any time (a second run says "Nothing
changed."). Add `--dry-run` to see the plan without changing anything. Then open your Hub folder in
VS Code or the desktop app's Code tab and start a chat: you're on the floor. To have Claude style it
and introduce your first agents, paste `Carry on my Workspace setup from step 1 of 50-AI/workspace/SETUP.md.`
[Guide 1](guides/01-install.md) walks through it, step by step.

## The suite

| | |
|---|---|
| **The Hub** | One folder on each computer for all your work, in numbered zones (`00-Inbox` to `90-Archive`), with a constitution `CLAUDE.md` every session reads, a plain-English map (`NAV.md`) rebuilt from what is on disk, and a `CLAUDE.md` per project. Claude always knows where things go, on any drive, on Windows or macOS. [Guide 6](guides/06-the-hub.md). |
| **The starter skills** | Twelve skills from the free [claude_skills](https://github.com/wilson-works/claude_skills) pack, such as `handoff`, `notetaker`, `file-organizer`, `backlog` and `scope-check`, pulled at a pinned commit so they never drift. [Why each one](skills/README.md). |
| **The office** | A local web page (http://127.0.0.1:4316): the Floor, Work, Agents, Questions and Chat. Every session opened on your Hub shows up. Private by design: it reads session metadata only, never prompts or file contents, and binds to this computer alone. |
| **Specialist agents** | An agent for one job you repeat, with its own rules, facts, memory and dashboard. Install one of ours (`install-agent louise`), or make your own with `new-agent`. Each gets an office in the Agents' wing, with a door into its dashboard, by itself. [Guide 8](guides/08-agents.md). |
| **The fleet** (optional) | Your computers sharing work through your own private `fleet-ops` repo: a board of work orders, a message file per computer, and handoffs from a session on one to a session on another. The installer sets it up. [Guide 7](guides/07-several-computers.md). |

And inside the office:

| | |
|---|---|
| **Get started** | An eleven-lesson course on the Work page, from your first note to your first specialist agent, your Hub and your computers working together. Every lesson has the prompts to paste. |
| **Demo app** | A tiny practice app with four work orders for your new team. |
| **The CTO org** | 18 agents (CTO, Chief Engineer, exec assistant, five department heads, ten juniors) with a message bus and a department guard. The same team as `agent-org` in the free claude_skills pack. |
| **Permissions** | Guard rails for working without babysitting: a deny list, an ask list, and walkaway mode for unattended sessions. |
| **Many devices** | Your phone and your other computers on one office, over [Tailscale](https://tailscale.com). |
| **The prompt library** | Prompts for changing the office, the team and your specialists. |
| **The avatars** | 103 emblems and 101 frames for the people at the desks, from [CreDub](https://credub.com), the team engagement platform where your crew levels up together. Browse them at `#/avatars` on your office. |

## Videos

Short promos and captioned walkthroughs, all filmed on a demo install with invented data. They are on
the [v2.1.0 release page](https://github.com/wilson-works/workspace/releases/tag/v2.1.0):

| Video | Length | Watch |
|---|---|---|
| The Workspace in under a minute | 53.6 s | [wide](https://github.com/wilson-works/workspace/releases/download/v2.1.0/workspace-promo-16x9.mp4) · [phone](https://github.com/wilson-works/workspace/releases/download/v2.1.0/workspace-promo-9x16.mp4) |
| Specialist agents with an office of their own | 52.6 s | [wide](https://github.com/wilson-works/workspace/releases/download/v2.1.0/agents-promo-16x9.mp4) · [phone](https://github.com/wilson-works/workspace/releases/download/v2.1.0/agents-promo-9x16.mp4) |
| 1. What it is: the Hub, the skills, the office | 4:58 | [watch](https://github.com/wilson-works/workspace/releases/download/v2.1.0/walkthrough-1-what-it-is.mp4) |
| 2. Several computers, one office | 2:44 | [watch](https://github.com/wilson-works/workspace/releases/download/v2.1.0/walkthrough-2-several-computers.mp4) |
| 3. Fleet ops: sessions on different computers working together | 3:35 | [watch](https://github.com/wilson-works/workspace/releases/download/v2.1.0/walkthrough-3-fleet-ops.mp4) |

## Free, or done for you

The whole Workspace is **free and public**. Everything here is yours to set up yourself, with the
guides and the course.

**Install one of ours.** All four are free.

- **Louise, the research librarian**, researches your questions with a source for every fact, and
  keeps what she finds on shelves you can browse. Say yes when the installer offers her.
- **Bryn, the trail guide**, helps you think a decision through: five scouts weigh it on their own,
  she looks for where the plan could fail, and she keeps your call so you never argue it twice.
- **James and John's Coworking Space**, the front office of the CTO org: tell James and John what
  you need, they read your projects and plan the work as a run for your team of agents, and hand you
  the steps to start it. It works with the CTO org in `org/` and your fleet repo (`fleet/`).
- **Kindlemere**, three keepers in a park by a lake: Avo plans your meals and shopping, Steady your
  workouts and stretches, and Tumble your dog's training and play.

From the Workspace folder:

```
node agents/bin/install-agent.js louise
node agents/bin/install-agent.js bryn
node agents/bin/install-agent.js cowork
node agents/bin/install-agent.js kindlemere
```

`node agents/bin/agent.js catalog` lists every agent of ours you can install. Each one is yours to
change: its rules, facts and look are plain files. If you'd like your own version of one, built
around the way you work, [WilsonWorks builds them](https://wilsonworks.studio/ai-consulting/agents).

If you'd rather have it done for you, WilsonWorks offers two things:

- **Done-for-you setup**: we set up the Workspace on your computers with you, ready to work.
  [Get in touch](https://wilsonworks.studio/ai-consulting?inquiry=workspace-setup)
- **Specialized agents**: install one of ours in your Workspace, or have one built for your own
  work. [Get in touch](https://wilsonworks.studio/ai-consulting?inquiry=workspace-agent)

Setup help is $150 per seat; a one-job agent (a social media or sales assistant, say) starts at $250, a specialized agent (bookkeeping, for example) at $1,000, and anything else is priced to fit.

## The guides

1. [Install](guides/01-install.md): prerequisites, the one-line install, your first session in VS Code and in the desktop app.
2. [One office for all your devices](guides/02-tailscale.md): Tailscale, your phone, more computers.
3. [Permissions](guides/03-permissions.md): deny and ask lists, bypass mode, walkaway mode.
4. [Make it yours](guides/04-customize.md): every setting.
5. [The CTO org](guides/05-the-org.md): your software team, and specialists for everything else.
6. [Your Hub](guides/06-the-hub.md): the zones, the rules, the map, where projects live.
7. [Several computers](guides/07-several-computers.md): the fleet, handoffs, a builder and a gate.
8. [Specialist agents](guides/08-agents.md): the agent contract, `new-agent`, installing Louise or any agent.
9. [Updates](guides/09-updates.md): how new features arrive, and why they never break your own pieces.

And [the prompt library](prompts/README.md), with [the update procedure](prompts/update-my-workspace.md).

## How it works, in one paragraph

Claude Code runs **hooks** (small programs) at set moments in every session. The installer puts the
office's hooks in your Hub's own settings, so every chat opened on the Hub runs them. They write one
short line per event to a local file (which tool, which session, when; never what was in it), hand a
session any note waiting for it, and wake an idle session when one arrives. The office server reads
that file and the metadata of Claude Code's own session logs, and draws the floor. A second computer
sends its floor to the first over your tailnet every 15 seconds; the first one answers with any notes
for that computer's sessions. Everything stays on your devices and in your own private repos.

## Privacy

- Never read: prompts, messages, tool inputs and results, file contents.
- Shown: a session's short generated title, the one-line description it writes for each step, its
  helpers' task lines, and its model. For folders you mark private (`privacy.private_work`), none of
  those, on the office or on your phone.
- The office listens on 127.0.0.1 only. Your phone and other computers reach it through
  `tailscale serve`, on your tailnet only. Requests naming any other address are refused.
- Your settings (`workspace.config.json`), your logo (`brand/`) and your own projects stay out of git.
  Your fleet repo is private, and the installer never makes it public.

## Commands

Run from the Workspace folder (`<your Hub>/50-AI/workspace`):

```
node install.js [--dry-run] [--yes] [--remove]      the one installer (--help lists every option)
node hub/bin/hub.js nav --root <Hub>                regenerate your Hub's map, NAV.md
node hub/bin/hub.js new-project <name>              a new project in your code zone, with its CLAUDE.md
node agents/bin/new-agent.js <key> --name <N> --title <T>    a new specialist agent, with its office
node agents/bin/install-agent.js louise             install one of our agents (agents/bin/agent.js catalog lists them)
node agents/bin/install-agent.js <package>          install an agent package (only one you trust; we vouch for our catalog only)
node fleet/bin/fleet.js init | join <owner/name> | schedule  your computers working together
node bin/office-start.js [--restart]                start (or restart) the office
node bin/install.js [part] [--apply|--remove]       extra parts: hooks, permissions, startup, org --into <folder>
node bin/work.js list | show | mark                 progress on the Work page
node bin/ask-owner.js "question?" --recommend "..." a question for you, on the office
node bin/office-say.js "text"                       post in the group chat
npm run build                                       rebuild the page after editing src/ui/
```

## Credits

Made by [WilsonWorks](https://github.com/wilson-works). Avatars from [CreDub](https://credub.com):
campaigns, seasons, XP and real rewards for your team. Icons by [Phosphor](https://phosphoricons.com)
(MIT, `src/ui/avatars/LICENSE-phosphor.txt`). Released under the MIT licence (`LICENSE`).
