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

## Install in one line

**Windows** (PowerShell):

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
VS Code or the desktop app's Code tab and start a chat: you're on the floor.
[Guide 1](guides/01-install.md) walks through it, step by step.

## The suite

| | |
|---|---|
| **The Hub** | One folder on each computer for all your work, in numbered zones (`00-Inbox` to `90-Archive`), with a constitution `CLAUDE.md` every session reads, a plain-English map (`NAV.md`) rebuilt from what is on disk, and a `CLAUDE.md` per project. Claude always knows where things go, on any drive, on Windows or macOS. [Guide 6](guides/06-the-hub.md). |
| **The starter skills** | Twelve skills from the free [claude_skills](https://github.com/wilson-works/claude_skills) pack, such as `handoff`, `notetaker`, `file-organizer`, `backlog` and `scope-check`, pulled at a pinned commit so they never drift. [Why each one](skills/README.md). |
| **The office** | A local web page (http://127.0.0.1:4316): the Floor, Work, Agents, Questions and Chat. Every session opened on your Hub shows up. Private by design: it reads session metadata only, never prompts or file contents, and binds to this computer alone. |
| **Specialist agents** | An agent for one job you repeat, with its own rules, facts, memory and dashboard. Make one with `new-agent`, or install one you were given. Each gets an office in the Agents' wing, with a door into its dashboard, by itself. [Guide 8](guides/08-agents.md). |
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

Short promos and step-by-step walkthroughs of the Hub, the office, several computers and the fleet:
{{VIDEOS_URL}}

## Free, or done for you

The whole Workspace is **free and public**. Everything here is yours to set up yourself, with the
guides and the course.

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
8. [Specialist agents](guides/08-agents.md): the agent contract, `new-agent`, installing an agent.

And [the prompt library](prompts/README.md).

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
node agents/bin/install-agent.js <package>          install an agent you were given
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
