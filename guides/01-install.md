# 1. Install the WilsonWorks Workspace

About 20 minutes, most of it downloads. You need a computer running Windows or macOS (Linux works
the same way as macOS). You don't need to be a developer: you paste one line, answer a few
questions, and the installer shows you what it will do before it does it.

Rather have Claude do it all with you, starting with how you want your office to look and feel? Open an
empty `Hub` folder in Claude Code and paste the one line at the top of [SETUP.md](../SETUP.md).

When you finish, you have:

- **your Hub**: one folder that holds all your work, in numbered zones, with rules that teach Claude
  to find its way around ([guide 6](06-the-hub.md));
- **the starter skills**: twelve ready-made skills from the free claude_skills pack, such as
  `handoff`, `notetaker` and `file-organizer` (`skills/README.md` says why each one is there);
- **the office**: a page in your browser where every Claude Code chat on your Hub is a person at a
  desk, with the Get started course on its Work tab.

Later, if you want them: your phone and other computers on the same office ([guide 2](02-tailscale.md)),
several computers sharing work ([guide 7](07-several-computers.md)), and specialist agents with an
office of their own ([guide 8](08-agents.md)).

## What you need first

| | Why | Get it |
|---|---|---|
| **Claude Code** | The Claude that does the work. Use it in **VS Code** (the extension) or in the **Claude desktop app** (its Code tab). Either one is fine. | https://claude.com/claude-code |
| **VS Code** (if you choose it) | A free editor. Claude Code lives in a panel at its side. | https://code.visualstudio.com |
| **Node.js** 20 or newer | Runs the installer and the office. | https://nodejs.org (the LTS button) |
| **Git** | Downloads the Workspace and the skills, and keeps a history of your projects. | https://git-scm.com/downloads |
| **Python 3** (recommended) | The permission hooks and the CTO org's tools use it. On Windows, install it from python.org, not the Microsoft Store shortcut. | https://www.python.org/downloads |
| **GitHub's `gh`** (only for several computers) | Makes your private fleet repo. | https://cli.github.com |
| **Tailscale** (only for your phone or other computers) | A private network of your own devices. | https://tailscale.com/download |

On Windows you can get Git and Node.js from a PowerShell window:

```
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
```

On a Mac, `xcode-select --install` gives you Git, and the Node.js download page gives you Node.
Close and reopen your terminal after installing, so it finds them. The installer checks all of these
first and tells you what is missing and where to get it. Only Node.js and Git are required to start.

## 1. Install

### The one-line way

**Windows**: open **PowerShell** (press the Windows key, type PowerShell, press Enter) and paste:

```
irm https://raw.githubusercontent.com/wilson-works/workspace/main/install.ps1 | iex
```

**macOS**: open **Terminal** (in Applications, then Utilities) and paste:

```
curl -fsSL https://raw.githubusercontent.com/wilson-works/workspace/main/install.sh | sh
```

It downloads the Workspace into your Hub (`Hub` in your user folder unless you choose another
place), then runs its installer. The installer goes through six parts, in order, and for each one
it **prints its plan first** and asks before it changes anything:

| Part | What it does |
|---|---|
| check | Looks for Node.js, Git and the optional tools above. |
| hub | Makes your Hub: the zones, its rules (`CLAUDE.md`) and its map (`NAV.md`). |
| office | Writes the office's settings, connects every chat opened on the Hub to the office, and starts it. |
| skills | Downloads the skills pack into `50-AI/claude_skills` and copies the twelve starter skills into your Hub. |
| agents | Makes `50-AI/agents`, the home of your specialist agents, then offers Louise, the research librarian: say yes and she moves into your office, with the research skills she works with. |
| fleet | Only if you say you use more than one computer: see [guide 7](07-several-computers.md). |

Each line of a plan starts with a mark:

| Mark | Meaning |
|---|---|
| `+` | will be added |
| `~` | will be changed (only things the installer put there itself) |
| `=` | already there, nothing to do |
| `!` | yours is different, and it is kept as it is |
| `-` | will be removed (only with `--remove`) |

It ends by telling you what is where, the office's address, and your next three steps.

Want to see the plan before anything happens? Run it as a **dry run**, which writes nothing:

```
$env:WW_ARGS = '--dry-run'; irm https://raw.githubusercontent.com/wilson-works/workspace/main/install.ps1 | iex
```

```
curl -fsSL https://raw.githubusercontent.com/wilson-works/workspace/main/install.sh | sh -s -- --dry-run
```

(On Windows, run `Remove-Item Env:WW_ARGS` afterwards, or open a new window, before the real install.)

To put your Hub somewhere else, such as a second drive, set `WW_HUB` first:
`$env:WW_HUB = 'F:\Hub'` on Windows, `export WW_HUB=/Volumes/Work/Hub` on a Mac.

### The by-hand way

If you'd rather see each step, do what the one-liner does yourself. Make a folder called `Hub`, and
inside it `50-AI`. Then, in a terminal:

```
git clone https://github.com/wilson-works/workspace.git <your Hub>/50-AI/workspace
cd <your Hub>/50-AI/workspace
node install.js --dry-run
node install.js
```

`node install.js --help` lists every option, such as `--machine DESK` (this computer's short name),
`--owner Alex` (what your sessions call you), `--startup` (start the office when you log in),
`--agent louise` (install Louise without being asked) and `--yes` (no questions; your files are
always kept; it never installs an agent you didn't name with `--agent`).

### Running it again, and taking it out

Run the installer again any time, for example after an update: everything already in place shows
`=`, and it ends with "Nothing changed." It never replaces a file of yours. If you changed one of
the starter skills, it shows `!` and leaves it alone.

`node install.js --remove`, from `<your Hub>/50-AI/workspace`, takes out what the installer added
(the office's connection to your Hub, login start, the fleet's daily sync, and every starter skill
you haven't changed) and lists what it kept: your zones, your files, your settings and anything you
changed.

## 2. Your first session in VS Code

**1.** Open VS Code. Choose **File**, then **Open Folder**, and pick your **Hub** folder (not the
`workspace` folder inside it). If VS Code asks whether you trust the authors of the files in this
folder, say yes: it is your own folder.

**2.** Open the **Claude Code** panel: click the Claude icon in the bar at the side of the window,
or open the command palette (Ctrl+Shift+P on Windows, Cmd+Shift+P on a Mac) and choose
**Claude Code: Open**. Sign in the first time it asks.

**3.** Start a chat and paste:

```
Read this Hub's CLAUDE.md and NAV.md, then tell me in five short lines what this Hub is and where my
code, my documents and my agents go. Don't search the whole Hub; those two files are the map.
```

**4.** Open the office in your browser at the address the installer printed (usually
http://127.0.0.1:4316). 127.0.0.1 means "this computer": the office is not on the internet. On the
**Floor** tab, your chat is a person at a desk, with a line saying what it is doing right now.

Every chat you open on the Hub shows up the same way. That works because the installer put the
office's hooks (small programs Claude Code runs at set moments) in your Hub's `.claude/settings.json`.

## 3. Your first session in the desktop app

**1.** Open the **Claude desktop app** and sign in. Choose **Code** (it sits next to Chat).

**2.** When it asks which folder to work in, choose your **Hub** folder. Keep it on this computer
(a local session), not in the cloud: the office only sees sessions running on your computers.

**3.** Start a session and paste the same prompt as step 3 above.

**4.** Open the office in your browser (http://127.0.0.1:4316, or the address the installer
printed). Your session is a person at a desk on the **Floor**, just like one from VS Code.

## 4. Make it yours

In a chat on your Hub, say **"set up my WorkSpace"**. Claude interviews you one question at a time:
your name, the office's name, colours and logo, your computers, and any private folders. It shows
you a summary before it saves anything. Then open the **Work** tab in the office and start
**Get started**, the course that walks you through everything else.

## 5. Your phone

Your phone can open the office from anywhere and buzz when a session has a question for you,
without putting anything on the internet. [Guide 2](02-tailscale.md) sets that up with Tailscale,
in about 20 minutes. Lesson GS-05 of the course walks you through it.

## 6. Your first project

Code projects live in your Hub's code zone, `20-Coding/Projects`, one folder each, and each one gets
its own `CLAUDE.md` with its rules. In a chat on your Hub, paste:

```
Start a new project in my Hub called <my-project> with node 50-AI/workspace/hub/bin/hub.js new-project
<my-project>. Show me its plan first and wait for my yes. Then regenerate NAV.md with
node 50-AI/workspace/hub/bin/hub.js nav --root . and show me the new line.
```

Lesson GS-10 and [guide 6](06-the-hub.md) say more.

## 7. Your first agent

A specialist agent is an agent built for one job you repeat, with its own rules, facts and memory.
Every agent you make or install gets an office in the office's **Agents** wing, with a door to its
dashboard, by itself.

If you said yes to Louise during the install, she is already there. If not, install her any time
from a chat on your Hub:

```
Install Louise with node 50-AI/workspace/agents/bin/install-agent.js louise. Show me its plan first
and wait for my yes. Then show me her office in the Agents wing.
```

To make your own, in your own words:

```
Make me a specialist agent with node 50-AI/workspace/agents/bin/new-agent.js <key> --name "<Name>"
--title "<what it does>". Show me what it will make before it makes it. When it's made, tell me
where it lives and how to see its office in the Agents wing.
```

Lesson GS-09 builds one with you properly, and [guide 8](08-agents.md) explains the rest,
including installing an agent someone gave you.

## More installer parts

The office has a few extra parts you can add later, each shown as a plan first. Run them from
`<your Hub>/50-AI/workspace`:

| Part | What it does | Plan | Apply |
|---|---|---|---|
| **hooks** | Chats opened **outside** your Hub show up on the office too (it adds the hooks to your user settings). Chats on the Hub already do. | `node bin/install.js hooks` | `node bin/install.js hooks --apply` |
| **permissions** | Guard rails: a deny list, an ask list and walkaway mode. See [guide 3](03-permissions.md). | `node bin/install.js permissions` | `... --apply` |
| **startup** | Starts the office when you log in. (`node install.js --startup` does the same.) | `node bin/install.js startup` | `... --apply` |

Before any settings file changes, it is backed up next to itself as `settings.json.bak-<date-time>`.
`--remove` undoes each part. After a change to hooks, open a **new** chat: a chat reads its
settings when it starts.

## Waking an idle session

When a chat has finished its turn and is waiting for you, a note from the office would normally wait
until you type something. The office's hooks include a small waiter that wakes the chat within a few
seconds when a note arrives, so you can steer a session from the office or your phone. It stops by
itself when you start typing in that chat, when the chat closes, or after 8 hours.

## Where things live

| | |
|---|---|
| Your Hub | `Hub` in your user folder, or the folder you chose |
| The Workspace (the office, the course, the installer) | `<Hub>/50-AI/workspace` |
| Your office settings | `workspace.config.json` in the Workspace folder |
| The office's own files (notes, questions, chat, progress, logs) | the folder in `office.home` of your settings; by default Windows `%LOCALAPPDATA%\WorkSpace`, macOS `~/Library/Application Support/WorkSpace` |
| The starter skills | `<Hub>/.claude/skills` |
| The skills pack | `<Hub>/50-AI/claude_skills` |
| Your agents | `<Hub>/50-AI/agents` |
| What the installer put where | `<Hub>/.hub/installed.json` |
| The office's log | `office.log` in the office's own folder |

## If something's off

- **The installer says Node.js or Git is missing.** Install it from the table at the top, close and
  reopen the terminal, and run the line again.
- **"running scripts is disabled on this system"** (Windows). Paste this first, then the one-liner:
  `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`. It only lasts for that window.
- **The page won't open.** In a terminal in `<your Hub>/50-AI/workspace`, run
  `node bin/office-start.js` and read what it prints, then `office.log`.
- **The installer says the port is in use.** Something else uses it. Run it again with
  `--office-port 4317` (any free number from 1024 up). If your `workspace.config.json` already
  exists, change `office.port` in it instead, then run the installer again.
- **Your chat isn't on the floor.** Check the chat was opened on the **Hub** folder, not a folder
  inside it or somewhere else. A chat that was open before the install needs to be closed and
  reopened. For chats in other folders, add the **hooks** part above.
- **A line says `!`.** That file is yours and differs from the Workspace's copy, so it was kept. To
  take the Workspace's copy, move yours somewhere else and run the installer again.
- **You changed settings and nothing moved.** Names, colours and privacy show within seconds. Adding
  or renaming a computer needs `node bin/office-start.js --restart`.
