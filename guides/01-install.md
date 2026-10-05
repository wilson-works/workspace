# 1. Install WorkSpace

About 15 minutes. You need a computer running Windows, macOS or Linux. Windows is where WorkSpace
gets the most use; macOS and Linux work the same way, and the few differences are noted below.

## What you need first

| | Why | Get it |
|---|---|---|
| **Claude Code** | The Claude that does the work. The VS Code extension is the easiest way in. | https://claude.com/claude-code |
| **VS Code** | Where you open the WorkSpace folder and chat with Claude. | https://code.visualstudio.com |
| **Node.js** 20 or newer (22.13 or newer recommended) | Runs the office. 22.13+ also lets the office show the org's messages. | https://nodejs.org (the LTS button) |
| **Git** | Downloads WorkSpace and keeps a history of your projects. | https://git-scm.com |
| **Python 3** | The permission hooks and the CTO org's tools are Python. On Windows, install from python.org, not the Microsoft Store shortcut. | https://www.python.org/downloads |

Check them in a terminal: `node --version`, `git --version`, `python --version` (or `py -3 --version`
on Windows, `python3 --version` on macOS and Linux).

## 1. Get the folder

```
git clone https://github.com/wilson-works/workspace.git
```

Put it somewhere you will keep it, such as your Documents folder. The office runs from this folder.
If you move it later, run the installer parts again (step 4) so they point at the new place.

## 2. Open it in VS Code and start the office

In VS Code: **File > Open Folder**, pick the `workspace` folder, open the Claude Code panel and start
a chat. Then paste:

```
Start my WorkSpace office with node bin/office-start.js and tell me the address to open.
```

Open http://127.0.0.1:4316 in your browser. 127.0.0.1 means "this computer": the office is not on
the internet. You should see the **Floor**, with your chat as a person at a desk.

The page is already built (`dist/` ships with the repo), so there is nothing to compile. If you ever
change the page's code in `src/ui/`, run `npm install` once and then `npm run build`.

## 3. Make it yours

Say **"set up my WorkSpace"**. Claude interviews you one question at a time: your name, whether the
office is personal or for a company, the office name, brand colours and logo, this computer, your
code folders, and any private folders. It shows you a summary before it saves anything. The answers
go in `workspace.config.json`, which stays on your computer (it is in `.gitignore`).

## 4. The three installer parts

The setup interview offers these at the end. You can also run them yourself. Each one first
**shows its plan and changes nothing**; add `--apply` to make the change, and `--remove` to undo it.
Before any settings file changes, it is backed up next to itself as `settings.json.bak-<date-time>`.

| Part | What it does | Plan | Apply |
|---|---|---|---|
| **hooks** | Every Claude Code chat on this computer shows up on the office and can receive notes. Without it, only chats opened in the WorkSpace folder do. | `node bin/install.js hooks` | `node bin/install.js hooks --apply` |
| **permissions** | Guard rails: a deny list, an ask list and walkaway mode. See [guide 3](03-permissions.md). | `node bin/install.js permissions` | `... --apply` |
| **startup** | Starts the office when you log in (Windows Startup folder, macOS LaunchAgent, Linux autostart). | `node bin/install.js startup` | `... --apply` |

Run `node bin/install.js` with no part to see all three plans at once.

After installing hooks, open a **new** chat: a chat reads its settings when it starts.

## 5. Take the course

Open the **Work** tab. The **Get started** project is a nine-lesson course: your office, your
settings, teaching Claude about you, permissions, your phone, questions and the group chat, your CTO
team, customizing the team, and building your first specialist agent. Each lesson has the prompts to
paste, and a **Mark done** button.

## Waking an idle session

When a chat has finished its turn and is waiting for you, a note from the office would normally wait
until you type something. The hooks part installs a small waiter that wakes the chat within a few
seconds when a note arrives, so you can steer a session from the office or your phone. It stops by
itself when you start typing in that chat, when the chat closes, or after 8 hours.

## Where things live

| | |
|---|---|
| Your settings | `workspace.config.json` in the WorkSpace folder |
| The office's own state (notes, questions, chat, progress, logs) | Windows `%LOCALAPPDATA%\WorkSpace`, macOS `~/Library/Application Support/WorkSpace`, Linux `~/.local/share/WorkSpace` |
| The office's log | `office.log` in that folder; `forward.log` on a second computer |
| Claude Code's settings | `~/.claude/settings.json` (your user settings) |

## If something's off

- **The page won't open.** Run `node bin/office-start.js` again and read what it prints; then look
  at `office.log`. Port 4316 must be free.
- **The floor is empty.** Chats opened outside the WorkSpace folder need the hooks part. Chats that
  were already open before you installed it need to be closed and reopened.
- **Notes say they can't be delivered.** The same: that chat isn't running the office's hooks.
- **You changed settings and nothing moved.** Names, colours and privacy show within seconds. Adding
  or renaming a computer needs `node bin/office-start.js --restart`.
