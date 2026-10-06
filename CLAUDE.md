# WorkSpace — instructions for Claude

You are working inside **WorkSpace from WilsonWorks**: a virtual office for Claude Code sessions,
plus a get-started course and a ready-made CTO org. The person using it may be new to Claude
Code. Speak plainly, explain a term the first time you use it, and do one step at a time.

## First thing in a new chat

- If `workspace.config.json` does **not** exist, say once that the office is running on default
  settings and offer to set it up ("say *set up my WorkSpace*"). Do not push it.
- If the person says "set up my WorkSpace" (or anything like it), run the `/workspace-setup` skill.
- If they ask what to do next, run `node bin/work.js list` and suggest the next step of the
  Get started course.
- If they ask to set up the Workspace from scratch, or to "carry on my Workspace setup", follow
  `SETUP.md` (design chat, install, the first agents, their own first agent).
- If they ask to update the Workspace with a branch or tag, follow `prompts/update-my-workspace.md`:
  their changes live on their branch `my-workspace`, and an update is merged into it, never forced.

## Where this folder sits

Installed the usual way, this folder is `<Hub>/50-AI/workspace`, and the person opens their chats on
the **Hub** (the folder two levels up), not here. From a chat on the Hub, run these commands as
`node 50-AI/workspace/<command>`, or `cd` here first. Read the Hub's `CLAUDE.md` and `NAV.md` for
where things go, and never search the whole Hub at once.

## The commands (run from this folder)

| Job | Command |
|---|---|
| Install, or check the install (Hub, skills, office, agents folder, fleet) | `node install.js --dry-run` (the plan), `node install.js` (asks before each part), `--yes` (no questions; keeps the person's files), `--remove` (takes out what it added), `--help` |
| Regenerate the Hub's map | `node hub/bin/hub.js nav --root <Hub>` |
| A new project in the Hub's code zone | `node hub/bin/hub.js new-project <name>` |
| A new specialist agent, with its office | `node agents/bin/new-agent.js <key> --name <Name> --title "<Title>"` |
| Install one of our agents, or a package | `node agents/bin/install-agent.js louise` or `<package>` (plan first; `--yes`); `node agents/bin/agent.js catalog` lists ours |
| Several computers (the fleet) | `node fleet/bin/fleet.js init [--create-repo]`, `join <owner/name>`, `schedule [--remove]` |
| Start the office | `node bin/office-start.js` → http://127.0.0.1:4316 (or `office.port` in workspace.config.json) |
| Restart it (after changing machines in workspace.config.json) | `node bin/office-start.js --restart` |
| See what an installer part would change | `node bin/install.js` (all parts) or `node bin/install.js <part>` |
| Install a part | `node bin/install.js hooks\|permissions\|startup --apply` (undo: `--remove`) |
| Put the CTO org in a project | `node bin/install.js org --into "<folder>" --apply` |
| Work page progress | `node bin/work.js list`, `node bin/work.js show <project>`, `node bin/work.js mark <project> <step-id> <todo\|doing\|done>` |
| Ask the owner a question on the office | `node bin/ask-owner.js "Plain question?" --recommend "What I would do"` |
| Post in the office group chat | `node bin/office-say.js "text" [--to <callsign>]` |
| Rebuild the page after editing `src/ui/` | `npm install` once, then `npm run build` |
| What the office sees, as data | `node bin/office-read.js --live --summary` |

Brand, owner name, privacy and `config/org-people.json` changes show without a restart (the office
re-reads them). Adding or renaming a machine needs `--restart`.

## Rules

1. **Look before you change.** Every installer part prints its plan first. Show the plan, explain it
   in plain words, and run `--apply` only after the person says yes. Never write to the person's
   user settings (`~/.claude/settings.json`) any other way.
2. **`workspace.config.json` is private.** It names the person, their computers and folders. Never
   commit it, never paste its contents into anything public. The same goes for `brand/` and any
   project folder in `projects/` other than `getting-started` and `demo-app` (all kept out of git
   by `.gitignore`).
3. **Settings markers.** In `workspace.config.example.json`, a value like `{{CLAUDE: ... }}` is a
   note to you: it says what to ask. In `workspace.config.json`, a value still holding a marker
   counts as not set.
4. **Private work stays private.** Folders under `privacy.private_work` are client or personal work:
   never put their file names, client names or contents into a group-chat post, an owner question,
   a commit message or a Work page project that is tracked by git.
5. **Course lessons are the person's to finish.** Help with each step; mark a lesson done (`node
   bin/work.js mark ...`) only when they say it is done, or when the lesson's prompt tells you to.
6. **Customizing.** `prompts/README.md` is the prompt library for changing the office, the org and
   the specialists. Prefer its prompts over inventing new mechanisms. `guides/04-customize.md`
   explains every setting.

## Where things are

- `src/server/` the office server (Node, no dependencies); `src/ui/` the page (React); `dist/` the
  built page (committed, so other computers install by pulling).
- `.claude/hooks/` the hooks that report sessions to the office and hand them notes.
- `bin/` the command-line tools above. `config/` thresholds, callsign pools, the org roster, avatars.
- `config/agents.json` the Agents' wing (an office per specialist, with a door to its dashboard). Agents
  in the Hub's `50-AI/agents/<key>/agent.json` get an office without being listed there.
- `install.js` the one installer (its parts are in `bin/install-suite.js`); `install.ps1` and
  `install.sh` fetch this repo on a fresh computer and run it. `skills/starter.json` the pinned
  starter skills. `hub/`, `agents/`, `fleet/` the Hub template, the agent contract and the fleet
  template. `guides/` 01 to 09 cover all of it.
- `org/` the CTO org (18 agents, comms bus, path guard). `permissions/` the permission setup and
  walkaway hooks. `projects/` the Work page's projects. `guides/` and `prompts/` the documentation.
