---
name: workspace-setup
description: "Set up WorkSpace from WilsonWorks for the person using it: an interview, one question at a time, that writes workspace.config.json (their name, personal or company use, office and company name, brand colors and logo, this computer, other computers, code folders, private folders), restarts the office, and offers the office hooks, the permission setup and start-at-login, each shown as a plan first. Use when the person says 'set up my WorkSpace', 'set up the office', 'personalize my office', 'change my WorkSpace settings', or runs /workspace-setup."
---

# Set up my WorkSpace

You are setting up this person's office. They may have never used Claude Code before. Ask **one
question at a time**, wait for the answer, and keep every question plain. If they are unsure,
suggest a sensible answer and move on. Nothing is saved until they approve a summary.

## 0. Check the ground (do it, don't ask)

- **Where the WorkSpace folder is.** If this chat is open on a **Hub** (a `.hub/hub.json` in this
  folder or one above it), the WorkSpace folder is `<Hub>/50-AI/workspace`. Run every command below
  from there (`cd` into it first), and read and write `workspace.config.json` there. Never search the
  whole Hub to find it; the Hub's `NAV.md` says where things are. If there is no Hub, this chat is in
  the WorkSpace folder itself.
- **What the Hub already knows.** Read `<Hub>/.hub/hub.json`: `machine` (this computer's short
  name), `role` and `owner`. Treat those as answers already given: confirm them in one line, don't
  ask again.
- `node --version`: Node 20 or newer is needed; 22.13 or newer lets the office read the org's
  comms bus. If it is older, say so plainly and point to https://nodejs.org (the LTS download).
- `git --version` and a Python 3 (`python`, `py -3` or `python3`): both are needed later (the CTO
  org and the walkaway hooks). Missing ones are not a blocker for the office; note them for the end.
- This computer's own name: `COMPUTERNAME` on Windows, `hostname` on macOS or Linux.
- Whether `workspace.config.json` already exists. If it does, this is a change, not a first setup:
  read it, show the current answers in plain words, and ask which ones to change. Skip the rest.
  **Except** when the installer wrote it (its `_readme` names `install.js`, and it holds only
  `owner`, one machine and `office`): then the basics are set, and this is still the first setup.
  Show those answers in plain words, then go through the rest of the interview (use, office and
  company name, colours, logo, other computers, private folders). Keep `office.port` and
  `office.home` exactly as they are unless the person asks to change them: the Hub's hooks find the
  office through them.

## 1. The interview

Read `workspace.config.example.json`. Every `{{CLAUDE: ...}}` marker is a question and says what to
ask. Go in this order:

1. **Their name**: what sessions should call them (`owner.name`).
2. **Personal or company** (`use`). Personal: skip the company and brand questions unless they want
   them. Company: ask all of them.
3. **Office name** (`brand.office_name`, default "WorkSpace").
4. **Company name** (`brand.company`), company use only.
5. **Brand colors** (`brand.colors`): two, a lighter and a darker one, saved as `#rrggbb`. Turn
   words ("forest green and dark green") into codes yourself and say which codes you picked.
6. **Logo** (`brand.logo`): an .svg or .png. Copy it into `brand/` in this folder (create it; it is
   kept out of git) and save the path as `brand/<file>`. No logo: leave it empty (the orb stays).
7. **This computer's short name** (`machines[0].name`), capitals, digits and hyphens, for example
   DESK. On a Hub, use `machine` from `.hub/hub.json` (they must match). Fill
   `machines[0].computer` yourself from step 0, and `hub: true`.
8. **Other computers** they will connect later: one entry each (`name`, `computer` if they know
   it). Tell them `guides/02-tailscale.md` connects them, and that `hub_url` is filled in then. If
   they use a fleet (`<Hub>/50-AI/fleet-ops/machines/` exists), use the names in it, so a computer's
   chip and its name on the board match (`guides/07-several-computers.md`).
9. **Code folders** (`code_roots`): where their code projects live. On a Hub, the projects live in
   its code zone (`20-Coding/Projects`), which the office uses on its own: leave `code_roots` empty
   unless they also keep code outside the Hub. Without a Hub, none yet is a fine answer.
10. **Private work** (`privacy.private_work`): folders (or folder-name words) whose sessions must
    never show titles or tasks on the office or the phone, such as client or tax folders.
11. **Never read** (`privacy.never_read`): folders no session may ever read or touch, such as another
    person's user folder on a shared computer.

## 2. Save

Show a plain-words summary of every answer and the file you will write. On their yes, write
`workspace.config.json` with the same layout as the example, with the `_readme` and `_` keys dropped
and every marker replaced by an answer or an empty value. Check it is valid JSON by reading it back
with `node -e "console.log(require('./src/server/config').load())"` and show them what the office
understood (name, machines, which one is the hub).

## 3. Restart the office

Run `node bin/office-start.js --restart`, then tell them to open (or reload) the office at
http://127.0.0.1:<office.port> (4316 unless `office.port` says otherwise) and what they should see:
their office name (and company) in the bar, the orb in their colors or their logo, this computer's
chip with its short name.

## 4. Offer the three installs, one at a time

For each: run it **without** `--apply`, explain the plan in plain words, ask, and apply only on yes.
Tell them a backup of their settings is made first and `--remove` undoes it.

1. `node bin/install.js hooks`: every Claude Code chat on this computer appears on the office and can
   get notes. On a Hub, chats opened on the Hub already do (the installer put the hooks in the Hub's
   own `.claude/settings.json`), so this is only for chats in folders outside the Hub; say so, and
   skip it if they only work on the Hub. After applying, new chats pick it up.
2. `node bin/install.js permissions`: the deny and ask lists and the walkaway hooks
   (`guides/03-permissions.md`). If Python was missing in step 0, say the lists still work.
3. `node bin/install.js startup`: the office starts when they log in. (Skip it if `install.js
   --startup` already did: the plan then shows `=`.)

## 5. Finish

- If this was their first setup, mark the course lesson: `node bin/work.js mark getting-started GS-02 done`.
- Offer the workflow rules (`permissions/CLAUDE.workflow.md`): a short block that teaches every
  session to ask them questions through the office and to use the group chat politely. Show it; on
  yes, append it to their `~/.claude/CLAUDE.md` (create the file if missing; never replace what is there).
- Point them to the **Work** tab and the next lesson of Get started.
- List anything still missing from step 0 (Python, git) with where to get it.
