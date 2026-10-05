# The agent contract

A **specialist agent** is an agent built for one job you do over and over: drafting your posts,
sorting receipts, writing research briefs. In the WilsonWorks Workspace each one is a folder with a
brain, rules, a memory and a small dashboard, and each one gets an office in the Agents' wing with a
door into that dashboard.

This page is the contract for that folder, for people and for Claude. Everything here is checked by
`agents/lib/agents.js` (`validateManifest`), so a page that says "this is allowed" and code that
refuses it cannot drift apart.

## The folder

One folder per agent, named by its key, inside an agents folder. On a Hub that is
`<Hub>/50-AI/agents/<key>/`.

```
<key>/
  agent.json            who it is, its colours, its door, how to start it  (required)
  CLAUDE.md             who it is, what it does, what it never does, how it learns
  brains/               what it knows: one markdown file per topic (README.md explains the format)
  rules/                its standing rules: one checkable rule per file
  memory/MEMORY.md      what it has learned: an index of one-line pointers to notes in memory/
  dashboard/server.js   its page, on this computer only (Node's built-ins, nothing to install)
  dashboard/package.json  says the dashboard is CommonJS, so it runs wherever the folder lands
  mark.svg              its sign on the office door (or a .png)
  art.svg               the figure standing in its open doorway (or a .png)
  subagent.md           the Claude Code subagent that lets any session call it
  README.md             what it is and how to use it
```

Only `agent.json` is required for an office. The rest is what `new-agent` makes, and what a good
agent has.

While it runs, its dashboard writes `dashboard/.pid` and `dashboard/dashboard.log`. Those two files
belong to this computer: they are never part of a package.

## `agent.json`

```json
{
  "key": "iris", "name": "Iris", "title": "The Research Desk",
  "line": "Reads everything on a topic and hands back one page with the sources.",
  "status": "live",
  "door": { "local": "http://127.0.0.1:7601/", "phone": null },
  "probe": { "port": 7601, "path": "/health" },
  "start": "node dashboard/server.js",
  "autostart": true,
  "match": ["iris", "research desk"],
  "brand": { "bg": "#0B1020", "panel": "#16213E", "ink": "#E6EDF7", "accent": "#38BDF8", "accent2": "#818CF8",
             "font": "Inter, system-ui, sans-serif", "mark": "mark.svg" },
  "art": "art.svg",
  "jokes": ["I read the footnotes so you do not have to."]
}
```

| Field | Required | What is checked |
|---|---|---|
| `key` | yes | Starts with a lower-case letter; only `a-z`, `0-9` and `-`; at most 31 characters. The same as its folder's name. |
| `name` | yes | Text, at most 40 characters. |
| `title` | no | Text, at most 60 characters: the job on its door. |
| `line` | no | Text, at most 200 characters: what it does, in one line. |
| `status` | no | `live`, `building` or `planned`. A planned agent's door stays shut. |
| `door.local` | no | Only `http://127.0.0.1:<port>/...` or `http://localhost:<port>/...`, with a port from 1024 to 65535. Its dashboard on this computer. |
| `door.phone` | no | Only `https://<name>.ts.net/...` (your tailnet address, once `tailscale serve` publishes the dashboard), or `null`. |
| `probe` | no | `{ "port", "path" }`: a port from 1024 to 65535 and a path starting `/`, checked on this computer. Or `{ "url" }`: an `https://<name>.ts.net/...` address, checked from any computer. Or `null`. See the probe rule below. |
| `start` | no | The command that starts its dashboard, run in its folder: a program and its arguments, without a shell (`node dashboard/server.js`, `python dashboard.py`). `node` means the Node that runs the Workspace. |
| `autostart` | no | `true` or `false`. When `true`, `start` and a probe with a port are required, and the office starts it when the office starts. |
| `match` | no | Words that find its sessions on the office floor by their title or folder. Only how many there are is shown, never their titles. |
| `brand` | yes | `bg`, `panel`, `ink`, `accent` and `accent2`, each a colour written `#rrggbb`; `font` (text, optional); `mark` (optional). |
| `brand.mark`, `art` | no | A plain file name in the agent's own folder ending `.svg` or `.png`: no folders, no `..`. The file must be there. |
| `jokes` | no | At most 12, each at most 160 characters. What it answers when someone right-clicks its door to knock. |

`machine` is ignored: an agent runs on the computer it is installed on. (An agent on another computer
belongs in `config/agents.json`, with its `machine` and a `{ "url" }` probe.)

Anything else in the file is ignored, so a newer agent still opens in an older office.

### The probe rule

The office checks each agent's probe every 20 seconds to see whether it is running. **A probe must
never be a page that hands out a login or a token.** A dashboard's `/open` link often answers with a
redirect that carries its login token; a probe that hits it would hand that token to every check. So:

- the probe is never `/open`;
- the probe is never the same page as a door (`door.local` or `door.phone`);
- the template's probe is `/health`, which answers `{"ok":true}` and nothing else.

Up means any HTTP answer below 500.

## What the office does with it

- It reads every `<agents folder>/<key>/agent.json`, one level down and never deeper, on every
  request. The agents folders are `agents_dirs` in `workspace.config.json`, by default
  `<Hub>/50-AI/agents`. **Writing `agent.json` there is the registration.** Nobody edits
  `config/agents.json` to add one.
- An `agent.json` that fails a check above is left out. `node agents/bin/agent.js list` says why.
- A key that `config/agents.json` also names is shown as `config/agents.json` has it.
- The placeholder office (`your-specialist`) disappears once any real agent exists.
- Its mark and figure are served from its own folder at `/agent-files/<key>/<file>`: only an `.svg`
  or `.png` directly inside that folder, never a link, never a sub-folder.
- Its door opens only while its probe answers. The office never proxies a dashboard: the door is a
  link the browser opens itself.
- When the office starts, every agent with `autostart: true` whose probe does not answer is started,
  detached, logging to its `dashboard/dashboard.log`.

## The dashboard

`dashboard/server.js` in the template is the model. It listens on `127.0.0.1` only, on its own
`probe.port`. It refuses any request whose `Host` is not `127.0.0.1` or `localhost` (or the name in
its own `door.phone`), so a web page elsewhere cannot point a name at the port and read it. `/` is
its page in its own colours: its name and title, how many brains, rules and memory lines it has, and
its latest memory lines. `/health` answers `{"ok":true}` with no login and no token. `/mark.svg` is
its mark.

## The subagent

`subagent.md` is a Claude Code subagent definition (`name`, `description`, `model`, then its
instructions). It may say `{{agent_dir}}` wherever it needs the agent's folder; that is filled in
when it is registered. Registering it writes `<Hub>/.claude/agents/<key>.md`, so any session opened
on the Hub can call the agent by name. A file already there that differs is yours: it is kept.

## Packages

A package is how an agent travels: one you were given, one you bought, or one you built and want on
another computer. It is any of:

- **a folder** with `agent.json` at its top;
- **a `.zip` file** with `agent.json` at its top (or inside the one folder the zip holds);
- **a git address** (`https://...`, `ssh://...` or `git@...`) whose repository has `agent.json` at
  its top.

Installing one (`install-agent`):

1. A `.zip` is opened with `tar` on Windows (it ships with Windows 10 and later), `ditto` on macOS or
   `unzip` elsewhere; a git address is cloned with `git clone --depth 1`. Both go to a temporary
   folder. **Nothing from the package is run while it is installed.**
2. Its `agent.json` is checked. A package that fails is refused, and nothing is written.
3. It is copied to `<agents folder>/<key>/`, without symbolic links, `.git` or a running agent's own
   files. When that folder is already there and differs, yours is kept unless you say `--force` (or
   yes); a replaced one moves to `<Hub>/90-Archive/_DumpQueue/`.
4. When its port is taken by another agent or by anything listening, it gets a free one, and
   `probe.port` and `door.local` are rewritten.
5. Its subagent is registered.
6. When it says `autostart: true`, its dashboard is started after you say yes (or `--yes`). Starting
   it runs its `start` command: install packages only from people you trust.

## The commands

Run from the Workspace folder. Each prints its plan with the same marks: `+` add, `~` change,
`=` already there, `!` yours differs and is kept, `-` remove. `--dry-run` writes nothing. Exit codes:
`0` done (or plan shown), `1` failed, `2` refused.

| Job | Command |
|---|---|
| Make a new agent | `node agents/bin/new-agent.js <key> --name <Name> --title <Title> [--line <text>] [--color <#rrggbb>] [--hub <root>] [--port <n>] [--no-start] [--dry-run]` |
| Install a package | `node agents/bin/install-agent.js <folder, .zip or git address> [--hub <root>] [--yes] [--force] [--no-start] [--dry-run]` |
| See them all | `node agents/bin/agent.js list` |
| Start or stop one | `node agents/bin/agent.js start <key>` (or `start --all`), `node agents/bin/agent.js stop <key>` |
| Take one out | `node agents/bin/agent.js remove <key> [--yes]` |

`new-agent` picks a free port from 7600 (one no other `agent.json` uses and nothing listens on). A
key that already exists is refused. `stop` stops only the process whose id is in `dashboard/.pid`,
never "whatever holds the port". `remove` stops it and moves its folder, and its subagent file, to
`<Hub>/90-Archive/_DumpQueue/agent-<key>-<YYYY-MM-DD>/`. Nothing is ever deleted: you delete that
folder yourself once you are sure.
