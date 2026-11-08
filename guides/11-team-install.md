# 11. Team install: the Workspace with Louise, Tony and CBFC (Mac and PC)

For a firm's staff, on a Mac or a PC, with no engineering needed. You paste a few short lines, in
order, and each step says what you should see.

When you finish, this computer has:

- **the Workspace**: your Hub folder and the office, a page in your browser at http://127.0.0.1:4316/,
  in CBFC's look (the Academy's colours, fonts and logo, once the Academy is installed in step 7);
- **the Hub fence**: Claude works only inside your Hub folder, so the rest of your computer stays
  private (see "Your Hub keeps Claude in" below);
- **Louise**, the research librarian, with her office in the Agents wing;
- **Tony**, the accountant: his basic setup (who he is, his rules, his door). His full training is
  private and is added only for people who have access (step 9);
- **CBFC**: a door in the office that opens the CBFC Academy on this computer. The Academy itself is
  private to the firm and is installed on its own (step 7);
- the way to **make your own executive assistant** by answering seven short questions (step 8).

## Read this first

- **Copy each line exactly as written.** Press Return (Enter) after each one, and wait until it
  finishes before you paste the next.
- **Use the Mac steps or the PC steps**, not both.
- Allow about 20 minutes, most of it downloads.
- Nothing here costs money by itself. **Claude does:** every chat uses your firm's Claude plan, and
  counts against its usage. Sign in with the account the firm gave you, never a personal card.
- Nothing here deletes or overwrites a file of yours. Running a step again is safe: it changes only
  what is missing.

## Bring with you

- Your **firm Claude account** login.
- **Mac:** your Mac password (the Node.js installer asks for it).
- **PC:** you must be able to click **Yes** on Windows' "allow this app to make changes" box.

---

## Mac

### 1. Install Node.js

1. Go to **nodejs.org** and click the download button for the **LTS** version. If it asks, choose
   **macOS Installer (.pkg)**.
2. Open the downloaded file from Downloads. Click **Continue**, **Continue**, **Agree**, **Install**,
   type your Mac password, then **Close**.

If the Mac already has Node.js, doing this again is harmless.

### 2. Open Terminal

Press **Cmd + Space**, type **Terminal**, press **Return**. A window with a blinking cursor opens.

### 3. Install Git

Paste this line and press Return:

```
xcode-select --install
```

**You should see** a box asking to install the command line developer tools. Click **Install**, then
**Agree**, and wait until it says the software was installed. If Terminal says
`command line tools are already installed`, Git is already there: go on.

### 4. Install Claude Code and sign in

Paste this line and press Return:

```
curl -fsSL https://claude.ai/install.sh | bash
```

**You should see** it download and end with a message that Claude Code is installed. If it also says
something about your PATH, ignore it: the next line does not need it.

Then paste this line and press Return:

```
~/.local/bin/claude auth login
```

**You should see** a browser page open. Sign in with your **firm Claude account** and click
**Authorize**. Back in Terminal, it says you are logged in.

### 5. Install the Workspace with Louise, Tony and CBFC

Paste this whole line and press Return. It is one line; copy all of it.

```
curl -fsSL https://raw.githubusercontent.com/wilson-works/workspace/main/install.sh | sh -s -- --yes --agent louise,tony,cbfc --brand cbfc --fence
```

**You should see** a few minutes of lines starting with `+` (added) or `=` (already there), in
parts: `hub`, `office`, `skills`, `agents`. Under `office`:

```
  + the CBFC Workspace look: its name, colours and logo (config/brands/cbfc.json)
  + the Hub fence: Claude reads and changes files only inside .../Hub, so the rest of this computer stays private
```

Under `agents`:

```
  Louise, from https://github.com/wilson-works/louise.git:
    + started Louise's dashboard
  Tony, from .../agents/packages/tony:
    + started Tony's dashboard
    ! Tony's full training (the accountant-tony plugin) is private, and this computer has no access to it ...
  CBFC, from .../agents/packages/cbfc:
    + started CBFC's dashboard
    ! The CBFC Academy is not on this computer yet, or not running. ...
```

The two `!` lines are normal on a new computer: they say what is private and how it gets added
(steps 7 and 9). If you already have access, they start with `=` instead. The last line is
`... change(s) made.` Lines about `NAV.md`, `hub new-project` or "set up my WorkSpace" are for
later; you can skip them today.

Go on to step 6.

---

## PC

### 1. Install Node.js

1. Go to **nodejs.org** and click the download button for the **LTS** version. If it asks, choose
   **Windows Installer (.msi)**.
2. Open the downloaded file. Click **Next**, tick the box to accept, **Next** until **Install**, click
   **Yes** on the Windows box, then **Finish**.

### 2. Install Git

Go to **git-scm.com/download/win**, download **Git for Windows**, open it, and click **Next** on every
page with the choices it already has, then **Install**, **Yes** on the Windows box, and **Finish**.

### 3. Open PowerShell (after steps 1 and 2, not before)

Click **Start**, type **PowerShell**, press **Enter**. If a PowerShell window was already open, close
it and open a new one, so it can find Node.js and Git.

### 4. Install Claude Code and sign in

Paste this line and press Enter:

```
irm https://claude.ai/install.ps1 | iex
```

Then paste this line and press Enter:

```
& "$HOME\.local\bin\claude.exe" auth login
```

**You should see** a browser page open. Sign in with your **firm Claude account** and click
**Authorize**.

### 5. Install the Workspace with Louise, Tony and CBFC

Paste this whole line and press Enter. It is one line; copy all of it.

```
$env:WW_ARGS='--yes --agent louise,tony,cbfc --brand cbfc --fence'; irm https://raw.githubusercontent.com/wilson-works/workspace/main/install.ps1 | iex
```

**You should see** the same as on a Mac (step 5 above): parts `hub`, `office`, `skills` and `agents`,
the CBFC look and the Hub fence under `office`, the three agents started, two `!` lines about what is
private, and `... change(s) made.` at the end.

---

## Both: Mac and PC

### 6. Open the office and knock on the doors

Open **http://127.0.0.1:4316/** in your browser (the installer prints the exact address near the end,
after `The office`). Bookmark it. Click **Agents** at the top.

**You should see** the Agents wing with three offices: **CBFC**, **Louise** and **Tony**, each saying
**In the office** with a **Step inside** button. If one says `Knocking…` for more than a minute,
reload the page.

Click **Step inside** on Louise and on Tony: each opens their own page.

### 7. CBFC's door: the Academy

Click **Step inside** on **CBFC**.

- If the Academy is installed and running, **you should see** the Academy open at
  http://127.0.0.1:7650/.
- If it is not installed, **you should see** a page that says
  `The CBFC Academy is not installed on this computer yet.` The Academy is private to the firm: ask the
  office manager for the **CBFC Academy install guide** and its install file (a `CBFC-Academy` ZIP in
  the firm's Google Drive), and follow its Mac or PC steps. Then press **Try again** on CBFC's page.
- If it says `The Academy is installed, but it is not running right now.`, double-click
  **CBFC Academy** on the Desktop, wait ten seconds and press **Try again**.

### 8. Make your own executive assistant

Mac: paste this line in Terminal and press Return.

```
node ~/Hub/50-AI/workspace/agents/bin/new-agent.js --ask
```

PC: paste this line in PowerShell and press Enter.

```
node "$HOME\Hub\50-AI\workspace\agents\bin\new-agent.js" --ask
```

It asks seven short questions. Type the answer and press Return (Enter); press it on its own to take
the suggestion in brackets:

1. their name;
2. what they will help you with, in one line;
3. how they talk to you (warm, calm and precise, or cheerful);
4. to 7. how they look: skin tone, hair, glasses, and the colour of their suit.

Then it shows what it will make and asks `Make <name>? (y/n)`. Press Return for yes.

**You should see** a list of `+` lines, `started its dashboard`, and `<Name>'s door:
http://127.0.0.1:76..`. Reload the office's Agents page: your assistant has an office next to
Louise's. In any Claude chat on your Hub folder, ask for them by name.

### 9. Tony's full training (only if the firm gave you access)

Tony's basic setup works on its own. His full playbooks are a private package. If step 5 printed
`= You have access to Tony's full training`, add it: open Claude Code and paste these two lines, one
at a time:

```
claude plugin marketplace add wilson-works/accountant-tony
claude plugin install the-accountant-tony@the-accountant-jev
```

If step 5 printed `! ... no access`, you do not need this: ask the office manager if your work needs it.

**Live money is always a person's.** Tony never sends an invoice, pays a bill, charges a card, runs
payroll or moves funds. A week of books goes to QuickBooks only after you click **Confirm** in
Balnce.Pro; a chat message is never the Confirm.

---

## Your Hub keeps Claude in

The Hub fence (`--fence` in step 5) means a Claude chat opened on your Hub folder reads and changes
files **only inside the Hub**. Your Documents, Desktop, Downloads, photos and every other folder stay
private, whatever mode the chat is in.

- **Always open Claude on the Hub folder itself** (`Hub` in your home folder): in VS Code, File,
  Open Folder, then `Hub`; in the Claude app, the Code tab, then `Hub`.
- **Need a file from somewhere else?** Copy it into `Hub/00-Inbox` yourself, then ask Claude to use it.
- If Claude says **`Outside the Hub: ...`**, that is the fence working, not a fault: copy the file into
  `00-Inbox`.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| Claude says `Outside the Hub: ...` | The fence is working. Copy the file you need into `Hub/00-Inbox` and ask again. |
| `! owner.name: yours is not set` when you paste the step 5 line again | Harmless: your settings are kept. Ignore it. |
| The office is purple, not CBFC's look | The step 5 line was pasted without `--brand cbfc`. Paste the step 5 line above again: it adds the look and changes nothing else. |
| The office has no CBFC logo | The Academy is not installed yet (step 7). The logo and fonts come from it. |
| `Git is not installed` | Do step 3 (Mac) or step 2 (PC), open a new Terminal or PowerShell window, and paste the step 5 line again. |
| `Node.js is not installed` or `too old` | Do step 1, open a new window, and paste the step 5 line again. |
| `There is already a folder at ... and it is not a copy of the workspace` | Something else is in your `Hub/50-AI/workspace` folder. Move it somewhere else, then paste the step 5 line again. |
| The office page does not open | Paste the step 5 line again: it starts the office and changes nothing else. |
| A door says `Knocking…` for minutes | Click its **Wake** button. Still nothing? Restart the computer and paste the step 5 line again. |
| `command not found: claude` (Mac) | Use the full line from step 4: `~/.local/bin/claude auth login`. |
| Anything else | Take a screenshot of the window and send it to the office manager. |

## Taking it out

Mac: `node ~/Hub/50-AI/workspace/install.js --remove`. PC:
`node "$HOME\Hub\50-AI\workspace\install.js" --remove`. It takes out what the installer added and
keeps every file of yours. An agent you made yourself is taken out with
`node <your Hub>/50-AI/workspace/agents/bin/agent.js remove <its key>`, which moves its folder to
`90-Archive/_DumpQueue/`; nothing is deleted until you delete that folder yourself.

## What was tested, and what was not

- **Tested on Windows (2026-11-06):** the PowerShell line from step 5 into a clean folder installed the
  Workspace, Louise, Tony and CBFC and started all three; the three doors opened from the office;
  CBFC's door showed each of its three states (not installed, installed but not running, and open on
  the Academy); step 8 made an assistant whose office appeared in the Agents wing.
- **Tested on Windows (FIELD, 2026-11-07):** steps 5 to 8 into a separate test Hub, matched line by
  line against this guide; `--brand cbfc` and `--fence` added to an existing install; a Claude chat on
  the test Hub in bypass mode was refused reading a file outside the Hub, by its file tool and by a
  shell command, and read the Hub's own files.
- **Not tested:** any Mac start to finish. The Mac steps use the same installer and the Mac's own
  tools, but the first Mac install is still the first run of these exact steps: keep it on a call.
