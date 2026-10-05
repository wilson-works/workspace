# WorkSpace from WilsonWorks

**A virtual office for your Claude Code sessions, a course that teaches you to use them, and a
ready-made team of agents to put to work.**

Every Claude Code chat you run becomes a person at a desk. You see what each one is doing right
now, the helpers it sends off and brings back, and you can send any of them a note, from your desk
or your phone. Sessions ask you questions in plain English on the office, and your phone buzzes when
one does. One office can cover every computer you own.

It is built to be made yours: your name, your office's name, your colours and logo, your computers,
your private folders, your team. Claude sets it up with you, one question at a time.

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

## What's inside

| | |
|---|---|
| **The office** | A local web page (http://127.0.0.1:4316): the Floor, Work, Agents, Questions and Chat. Private by design: it reads session metadata only, never prompts or file contents, and binds to this computer alone. |
| **Get started** | A nine-lesson course on the Work page, from your first note to your first specialist agent. Every lesson has the prompts to paste. |
| **Demo app** | A tiny practice app with four work orders for your new team. |
| **The Agents' wing** | An office for each specialist agent you build, in its own colours, with a door that opens into its dashboard, from your desk or your phone. |
| **The CTO org** | 18 agents (CTO, Chief Engineer, exec assistant, five department heads, ten juniors) with a message bus and a department guard. The same team as `agent-org` in the free [claude_skills](https://github.com/wilson-works/claude_skills) pack. |
| **Permissions** | Guard rails for working without babysitting: a deny list, an ask list, and walkaway mode for unattended sessions. |
| **Many devices** | Your phone and your other computers on one office, over [Tailscale](https://tailscale.com). |
| **The prompt library** | Prompts for changing the office, the team and your specialists. |

## Start

You need Claude Code (the VS Code extension is easiest), Node.js 20+, Git and Python 3.

```
git clone https://github.com/wilson-works/workspace.git
```

Open the folder in VS Code, open the Claude Code panel, and say:

> **Set up my WorkSpace.**

Claude interviews you, writes your settings, starts the office, and offers the installs. Then open
the **Work** tab and start **Get started**.

## The guides

1. [Install](guides/01-install.md): prerequisites, the first start, the installer parts.
2. [One office for all your devices](guides/02-tailscale.md): Tailscale, your phone, more computers.
3. [Permissions](guides/03-permissions.md): deny and ask lists, bypass mode, walkaway mode.
4. [Make it yours](guides/04-customize.md): every setting.
5. [The CTO org](guides/05-the-org.md): your software team, and specialists for everything else.

And [the prompt library](prompts/README.md).

## How it works, in one paragraph

Claude Code runs **hooks** (small programs) at set moments in every session. The office's hooks
write one short line per event to a local file (which tool, which session, when; never what was in
it), hand a session any note waiting for it, and wake an idle session when one arrives. The office
server reads that file and the metadata of Claude Code's own session logs, and draws the floor. A
second computer sends its floor to the first over your tailnet every 15 seconds; the first one
answers with any notes for that computer's sessions. Everything stays on your devices.

## Privacy

- Never read: prompts, messages, tool inputs and results, file contents.
- Shown: a session's short generated title, the one-line description it writes for each step, its
  helpers' task lines, and its model. For folders you mark private (`privacy.private_work`), none of
  those, on the office or on your phone.
- The office listens on 127.0.0.1 only. Your phone and other computers reach it through
  `tailscale serve`, on your tailnet only. Requests naming any other address are refused.
- Your settings (`workspace.config.json`), your logo (`brand/`) and your own projects stay out of git.

## Commands

```
node bin/office-start.js [--restart]          start (or restart) the office
node bin/install.js [part] [--apply|--remove] hooks, permissions, startup, org --into <folder>
node bin/work.js list | show | mark           progress on the Work page
node bin/ask-owner.js "question?" --recommend "..."   a question for you, on the office
node bin/office-say.js "text"                 post in the group chat
npm run build                                 rebuild the page after editing src/ui/
```

## Credits

Made by [WilsonWorks](https://github.com/wilson-works). Icons by [Phosphor](https://phosphoricons.com)
(MIT, `src/ui/avatars/LICENSE-phosphor.txt`). Released under the MIT licence (`LICENSE`).
