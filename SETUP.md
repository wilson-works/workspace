# Set up the WilsonWorks Workspace with Claude

This page is two things: the one line a person pastes into Claude Code, and the runbook Claude follows
when they do.

## For the person: the one line

You need **Claude Code** (the VS Code extension, or the Code tab of the Claude desktop app),
**Node.js 20 or newer** (https://nodejs.org, the LTS button) and **Git** (https://git-scm.com/downloads).

1. Make a new, empty folder called `Hub` in your user folder (for example `C:\Users\alex\Hub`, or
   `/Users/alex/Hub` on a Mac). It will hold all your work.
2. Open it: in VS Code, **File**, then **Open Folder**; in the desktop app, the **Code** tab, then
   choose that folder (keep the session on this computer, not in the cloud).
3. Start a chat and paste:

```
Set up my WilsonWorks Workspace from https://github.com/wilson-works/workspace, following SETUP.md.
```

Claude starts with a short chat about how you want your office to look and feel, then installs it,
introduces you to two agents (Louise and Bryn), and helps you build your first agent of your own.
It shows you what it is about to do before every step and waits for your yes. Plan on an hour for
everything, or stop after any step and carry on another day.

---

## For Claude: the runbook

You are setting up the WilsonWorks Workspace for someone who may be new to AI and to Claude Code.

**How to work, every step:**

- Plain English. Explain a word the first time you use it ("a *session* is one Claude Code chat").
- **One question at a time**, with two or three examples, and wait for the answer. If they are unsure,
  suggest something sensible and move on.
- **Nothing runs without their yes.** Before any command that changes something, say in one or two
  lines what it will do and show the plan (every tool here has `--dry-run`, or prints a plan first).
- After each step, say what they should see now, and where.
- They can stop after any step. To pick up later, they paste:
  `Carry on my Workspace setup from step <n> of 50-AI/workspace/SETUP.md.`

If this file came from the web and the repository is not on this computer yet, keep reading: step 2
downloads it. If the chat is already open on a Hub that has `50-AI/workspace` in it, the Workspace is
installed: skip to the first step they have not done (ask), or to step 6 if they want an update.

### Step 0. Check the ground (do it, don't ask)

- `node --version` (20 or newer) and `git --version`. If either is missing or too old, stop here,
  say which, and give the link above. Nothing else is needed to start.
- Where this chat is open. That folder is their **Hub** if it is empty, or is called `Hub`, or already
  has a `.hub/hub.json`. If it is a busy folder (their Documents, their user folder), suggest a `Hub`
  folder inside their user folder instead, and tell them to open that folder for every chat after the
  install.
- This computer's own name (`COMPUTERNAME` on Windows, `hostname` on a Mac), for step 1's last question.

What they see: two version numbers and one line saying where their Hub will be.

### Step 1. How should it look and feel? (a short conversation)

Before anything is installed, find out how they want their workspace to feel. Ask these one at a time.
Keep the answers in this chat: they are saved in step 2, once there is a settings file to save them in.

1. **What should your sessions call you?** Usually a first name: "Alex answered your question".
2. **How should your office feel when you open it?** Offer moods, and take their own words too:
   - a calm studio: quiet, unhurried, room to think;
   - a busy newsroom: lots going on, everything at a glance;
   - a cosy library: warm, a bit old-fashioned, books everywhere;
   - a bright workshop: tools out, things being made;
   - a quiet night shift: dim and focused.
3. **What is your office called?** Suggest two names that fit the mood ("The Studio", "The Reading Room",
   "The Newsroom", "The Workshop", "Night Desk"). Then: is it just for you, or for a business? For a
   business, the business name too (it shows next to the office name).
4. **Two colours.** The office has an orb in its top bar, in a lighter and a darker colour. Offer two or
   three pairs that fit their mood, with the codes, or turn their own brand colours into codes:

   | Mood | Pairs (lighter, darker) |
   |---|---|
   | calm studio | sage `#A7C4A0` + pine `#2F5D50` · mist `#B8C7D9` + slate `#3B4F66` |
   | busy newsroom | signal red `#F87171` + ink `#1E293B` · amber `#FBBF24` + navy `#1E3A8A` |
   | cosy library | honey `#E9C46A` + walnut `#6B4226` · lamplight `#F2D6A2` + library green `#2E4A3B` |
   | bright workshop | sky `#7DD3FC` + cobalt `#1D4ED8` · tangerine `#FDBA74` + rust `#9A3412` |
   | quiet night shift | lavender `#C4B5FD` + indigo `#3730A3` · moonlight `#E2E8F0` + midnight `#1E293B` |

5. **A logo?** Optional. An `.svg` or `.png` file on their computer. No logo is fine: the orb stays.
6. **Names for your sessions?** The office gives every chat a short name (trees, out of the box: Cedar,
   Rowan, Birch). Offer a theme that fits the mood, in their words (a reading room: Folio, Quill,
   Margin, Index; a workshop: Anvil, Chisel, Lathe). Optional; trees are fine.
7. **This computer's short name**, shown on its chip on the office: capitals, like `DESK` or `LAPTOP`.
   Suggest one from step 0.

Then read the whole picture back in a few plain lines ("The Reading Room, a cosy library, lamplight and
library green, no logo, sessions named after things in a library, this computer is DESK") and ask if
anything should change.

What they see: a short, friendly conversation and a summary of their answers. Nothing is installed yet.

### Step 2. Install it

Do these in order, each after a yes. Run every command from the Hub folder unless it says otherwise.

1. **Download the Workspace** into the Hub:
   `git clone https://github.com/wilson-works/workspace.git 50-AI/workspace`
   (Say: "This copies the Workspace into your Hub, in `50-AI/workspace`.")
2. **The installer's plan**, from `50-AI/workspace`:
   `node install.js --dry-run --hub "<Hub>" --owner "<their name>" --machine <NAME> --agent louise`
   Explain the six parts in plain words (guide 1 has a table): it checks the tools, makes the Hub's
   folders (its *zones*) and their rules, connects every chat on the Hub to the office and starts it,
   copies twelve starter skills, makes a home for agents and moves Louise in, and leaves the fleet
   (several computers) alone. Each line starts with a mark: `+` added, `=` already there, `!` yours
   and kept.
3. **Install**, on their yes: the same line with `--yes` in place of `--dry-run`. (`--yes` means the
   installer asks no questions of its own: they already said yes to its plan, and it still keeps every
   file of theirs.)
4. **Bryn**, from `50-AI/workspace`: `node agents/bin/install-agent.js bryn --dry-run`, explain, then
   `node agents/bin/install-agent.js bryn --yes`.
5. **Their design**, in `50-AI/workspace/workspace.config.json` (the installer wrote it, with their name,
   this computer and the office's port; it stays on their computer and is never shared). Show the lines
   before and after, and save on their yes:
   - `use`: `"personal"` or `"company"`; `owner.name`;
   - `brand.office_name`, `brand.company` (empty for personal use), `brand.colors` (lighter, then darker);
   - `brand.logo`: copy their file into `50-AI/workspace/brand/` and write `"brand/<file>"`; or leave it out.

   Read it back with `node -e "console.log(require('./src/server/config').load().brand)"` and say what the
   office understood. Name, colours and logo show within seconds, with no restart.
6. **Their own branch.** In `50-AI/workspace`: `git switch -c my-workspace`. Say: "Anything you change in
   the Workspace's own files from now on is saved on a branch of your own, called my-workspace, so an
   update never overwrites it (step 6)." If `git config user.name` is empty, set it for this folder only:
   `git config user.name "<their name>"` and `git config user.email "workspace@localhost"` (this copy is
   never pushed anywhere).
7. **Session names**, if they chose a theme: add a pool of about 60 short one-word names to
   `config/callsigns.json` (a new key under `pools`), set `"callsigns": "<pool>"` on this machine in
   `workspace.config.json`, then save it on their branch:
   `git add config/callsigns.json` and `git commit -m "My session names"`.
   Restart the office so it picks up the pool: `node bin/office-start.js --restart`.
8. **Open the office** at the address the installer printed (`http://127.0.0.1:4316/` unless it said
   another port). Open it for them if you can (`start <address>` on Windows, `open <address>` on a Mac),
   or give them the link. Then the **Agents** tab: Louise's and Bryn's offices, each with a door. Click a
   door to open that agent's own page (`node agents/bin/agent.js list` prints both addresses).

What they see: the office with their name in the bar and the orb in their colours (or their logo);
Louise's and Bryn's doors standing open in the Agents tab; Louise's library and Bryn's trailhead each
in a tab of its own.

**Then a new chat.** A chat loads its agents and the office's connection when it starts, and this one
started before the install. Tell them: "Open a new chat on your Hub and paste:
`Carry on my Workspace setup from step 3 of 50-AI/workspace/SETUP.md.` You'll see that new chat appear
as a person at a desk on the office Floor."

### Step 3. Meet the first agents

Introduce them in a few lines each, then try each one once, on something small and real.

- **Bryn, the trail guide**, helps them think a decision through. She frames the question, asks whether
  it can be undone and how much rides on it, brainstorms routes when there are none, has five scouts
  weigh a bigger call on their own (they are five viewpoints from one AI, and she says so), looks for
  how a plan could fail (a *premortem*), and, when they decide and say "file it", lays the decision as
  a stone on **the stone path**, so it is never argued twice. Rules they keep coming back to become
  **trail markers**. She never decides for them.
- **Louise, the research librarian**, looks things up properly: a source for every fact, and what she
  finds goes on the shelves of her library, where they can browse it. A single question gets a quick
  answer in the chat; a bigger one goes on her list, and the **Research my list** button on her page
  starts her on it.

Try Bryn: ask them for a small decision they actually face this week (which evening to keep free,
which of two tools to try). They type: `Bryn, help me decide <it>.` For a small call they can undo, she
gives a straight answer and offers to lay a stone. If she suggests a council, she says the cost first;
for this first try, a no is fine.

Try Louise: ask them for one thing they have wondered about. They type: `Louise, <the question>?` She
answers in the chat with her sources, and offers to put it on her list for a full research run.

**How they work together.** Bryn helps decide *what to do*; Louise finds out *what is known*. When
Bryn's trail reaches a question of fact ("is this tool any good for people like me?"), she can send
it to Louise, and the book Louise shelves comes back to the trail. The next step uses exactly that.

What they see: Bryn's trailhead changing scene as she works and a stone on her stone path (if they
filed one); Louise at her computer, then the answer, in the chat.

### Step 4. Their own first agent, together

A *specialist agent* is an agent built for one job they repeat, with their facts and their rules. Theirs
is made by three helpers in turn: Bryn sets the course, Louise researches, and the *agent org* (a
software team of agents that ships with the Workspace: James plans, Tim routes, a department head and
a junior build, John reviews) builds it. Lesson GS-09 of the course has every prompt below, ready to
copy, for doing it again later.

1. **Bryn sets the course.** `Bryn, help me decide which job my first agent should take off my hands.`
   She asks what they do over and over, frames the choice, brainstorms with them, weighs it if it is a
   big call, and, when they choose, they say "file it": the job is a stone on the stone path.
2. **Louise researches how that job is done well.**
   `Louise, research how <the job> is done well: the usual steps, how good work is checked, and the common mistakes.`
   It goes on her list and she runs it; a full run can take a while, and her page shows each stage.
   When it is shelved, `Louise, what do we have on <the job>?` gives the book.
3. **Make the agent**, from the Hub, after showing the plan (`--dry-run` first):
   `node 50-AI/workspace/agents/bin/new-agent.js <key> --name "<Name>" --title "<what it does>" --color <their darker colour>`
   The key is short, lower-case, with dashes (`weekly-review`). Its office appears in the Agents tab at
   once, in their colour.
4. **Give it a history of its own.** In `50-AI/agents/<key>`: `git init`, then a `.gitignore` with three
   lines, `dashboard/.pid`, `dashboard/dashboard.log` and `.claude/comms.db` (files the running agent and
   its build team write for themselves), then `git add -A` and `git commit -m "Made by new-agent"`. Say: "Your agent is its own little repository, in your Hub,
   outside the Workspace, so no update ever touches it, and every change to it is saved with a note
   of why."
5. **Their own words.** Interview them, one question at a time (GS-09 step 5 has the prompt: the job, its
   voice, what it owns, what it must never do, how it checks its work, its facts and where each comes
   from, its two or three routines, a practice task, its look), building on Bryn's stone and Louise's book.
   Write the answers to `50-AI/agents/<key>/BRIEF.md` in their words, show it, save it on their yes, and
   commit it in the agent's repository.
6. **The agent org builds it.** Put the org in the agent's folder:
   `node 50-AI/workspace/bin/install.js org --into "50-AI/agents/<key>"` (the plan), then the same with
   `--apply` on their yes. Set `.claude/agents/org.config.json` there so the frontend department owns
   `dashboard/**` and the backend department owns `rules/**`, `brains/**`, `memory/**`, `routines/**`,
   `CLAUDE.md` and `subagent.md`; show it first, and commit both. Then they open that folder in a new window (File, Open Folder,
   `<Hub>/50-AI/agents/<key>`), start a chat there and paste the build prompt from GS-09 step 6 (it names the three sources, the
   layout, the "not verified" rule, and a commit for each approved change). James
   takes the direction, the team writes the agent from `BRIEF.md`, Louise's book and Bryn's stone, John
   reviews, and the chat shows them every file before saving. Each approved change is a commit in the
   agent's own repository.
7. **Practice and one fix.** In a new chat on the Hub: the practice task from the interview; then one
   fix from what it showed, committed in the agent's repository with why.
8. **Into their Workspace.** Add the agent to the roster in `50-AI/workspace/config/org-people.json`
   (`"<key>": "<Name>"`, so the office names its sessions), and commit it on their branch:
   `git add config/org-people.json` and `git commit -m "Add <Name> to my roster"`.
   Then mark the lesson: `node 50-AI/workspace/bin/work.js mark getting-started GS-09 done`.

What they see: a stone on Bryn's path naming the job; a book on Louise's shelves; their agent's office
in the Agents tab, in their colours, its door opening into its page; helpers walking in and out of
their desk on the Floor while the org builds; and an agent that does the practice task in their way.

### Step 5. Where to go next

- The **Work** tab's **Get started** course: GS-01 to GS-11, from their first note to several computers.
- Their phone on the office: guide 2.
- Changing anything later: say "set up my WorkSpace" in a chat on the Hub, or use `prompts/README.md`.

### Step 6. How updates arrive

Tell them, in these two sentences: **"WilsonWorks sends updates as a short Claude prompt naming a
feature (a branch or a version of the public repository); you paste it into a chat on your Hub, and
Claude shows you what changes before it changes anything. Your settings, your agents, your Hub and your
own skills sit where updates never reach, and anything you changed in the Workspace itself is kept on
your own branch, which the update is merged into, never written over."**

The procedure is `prompts/update-my-workspace.md`; the guide is `guides/09-updates.md`.
