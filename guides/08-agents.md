# 8. Specialist agents

The CTO org ([guide 5](05-the-org.md)) is a general software team. A **specialist agent** is built
for one job you do over and over, such as research briefs, bookkeeping, client onboarding or social
posts, with your facts, your rules and a memory of what it learned.

Every specialist on your computer gets an **office** in the office's **Agents** wing: its own
colours, its name on the door, and a door that opens into its dashboard, from your desk or your
phone. You never edit a list to make that happen. Make or install an agent, and its office appears.

## Where agents live

One folder per agent, in your Hub:

```
<Hub>/50-AI/agents/<key>/
  agent.json          who it is and how its office looks: the office reads this
  ...                 its rules, its facts, its memory, its skills and its dashboard
<Hub>/.claude/agents/<key>.md   so any chat on your Hub can call it by name
```

The `key` is a short lowercase name with dashes, like `research-desk`. It is the agent's folder name
and how sessions call it.

## The contract: agent.json, in plain words

The examples are Louise's, the first WilsonWorks agent (her colours here are only an example).

| Field | What it means | Example |
|---|---|---|
| `key` | The agent's short name, the same as its folder. | `"louise"` |
| `name` | What it is called on its door. | `"Louise"` |
| `title` | What it does, in a few words. | `"The Research Librarian"` |
| `line` | One sentence about its job, shown in its office. | `"Researches your questions with a source for every fact, and keeps what she finds on shelves you can browse."` |
| `status` | `live` when it is ready to work. | `"live"` |
| `door.local` | The address of its dashboard on this computer. | `"http://127.0.0.1:7540/"` |
| `door.phone` | Its dashboard's address on your tailnet, once you publish it ([guide 2](02-tailscale.md)); empty until then. | `null` |
| `probe` | How the office tells whether the agent is running: a port and a page on this computer, or its tailnet address. **Never** a page that hands out a login or a token. | `{ "port": 7540, "path": "/health" }` |
| `start` | The command that starts its dashboard, run in its folder. | `"node dashboard/server.js"` |
| `autostart` | Start the dashboard with the office. | `true` |
| `match` | Words that tie a session to this agent, so its chats show at its door. | `["louise", "research librarian"]` |
| `brand` | Its colours and font, and `mark`, its logo file in its folder. | `{ "accent": "#C8A96A", "mark": "mark.svg" }` |
| `art` | A full figure for inside its door (optional). | `"art.svg"` |
| `jokes` | What it says when you knock (right-click its door). | `["It is on the third shelf. It is always on the third shelf."]` |
| `requires` | The skills it needs, by name. Installing the agent adds any your Hub doesn't have yet. | `{ "skills": ["marathon-research", "distill"] }` |

The agent runs on the computer it is installed on, so there is no machine field. Its door stands open
while it works and shows zzz while it rests. A bubble by its door counts the questions its sessions
have asked you.

## Make one

From a chat on your Hub:

```
Make me a specialist agent with node 50-AI/workspace/agents/bin/new-agent.js <key> --name "<Name>"
--title "<what it does>". Show me what it will make before it makes it. When it's made, show me its
folder, and tell me how to see its office in the Agents wing.
```

`new-agent` makes the agent's folder with everything an agent needs: its `agent.json`, a place for
its rules (what it owns and what it must never do), its facts (each with where it came from), its
memory, and a small dashboard. It registers the agent so any chat on your Hub can call it, and its
office appears in the Agents wing.

Then fill it in. Lesson GS-09 of the course does this with you: an interview about the job, its
rules and its facts, a practice run, and one fix from what the practice showed.

## Install one of ours

The installer offers Louise, the research librarian, after it sets up your agents folder. To install
her later, or another agent of ours, use its key. From a chat on your Hub:

```
Install Louise with node 50-AI/workspace/agents/bin/install-agent.js louise. Show me its plan first
and wait for my yes. Then show me her office in the Agents wing and tell me how to ask her for research.
```

Some agents are built on skills from the free claude_skills pack, and say which in `requires`.
Installing the agent adds each one your Hub doesn't have yet, from the same pinned pack as your
starter skills (a `+` line for each). If the pack doesn't have one, nothing is installed and it says
which skill is missing.

## Installing a package from somewhere else

WilsonWorks vouches only for the agents in its own catalog (`agents/bin/agent.js catalog`). The
installer can also take an agent **package** from a folder, a single `.zip` file or a git address,
for example to move an agent you built yourself onto another of your computers. An agent can read and
change files on your computer, so never install a package from a link or a person you don't know and
trust.

```
Install the agent package at <the package folder or file> with
node 50-AI/workspace/agents/bin/install-agent.js "<the package>". Show me its plan first and wait for
my yes. Then show me its office in the Agents wing and tell me what it needs from me to start.
```

Like everything else here, it shows its plan first, puts the agent in `50-AI/agents/<key>/`, and
never replaces a file of yours without asking. Run it again with a newer package to update the agent.

Only install packages from people you trust: an agent can read and change files on your computer, as
you can.

## WilsonWorks agents

These are the agents of ours anyone can install, from `agents/catalog.json`:

| Agent | What it does | Price | Install |
|---|---|---|---|
| **Louise**, The Research Librarian | Researches your questions with a source for every fact, and keeps what she finds on shelves you can browse. | free | `install-agent louise` |
| **Bryn**, The Trail Guide | Helps you think a decision through. Five scouts weigh it on their own, she looks for where the plan could fail, and she keeps your call so you never argue it twice. | free | `install-agent bryn` |

`node 50-AI/workspace/agents/bin/agent.js catalog` lists them on your computer and says which ones
you have. To have one built for your own work, see "Free, or done for you" in the
[README](../README.md), or get in touch: https://wilsonworks.studio/ai-consulting?inquiry=workspace-agent

## Its door on your phone

Once your phone is on the office ([guide 2](02-tailscale.md)), you can open an agent's dashboard
from it too. On the computer the agent runs on, publish its dashboard on your tailnet, then put the
address in `door.phone`:

```
Publish my <key> agent's dashboard on my tailnet: run tailscale serve for its port on a path or port
of its own, tell me the https address it gets, and put that address in door.phone in its agent.json.
Show me each command before you run it.
```

## If something's off

- **No office in the Agents wing.** Check `50-AI/agents/<key>/agent.json` exists and is valid JSON
  (ask Claude to check it), then reload the office page.
- **The door shows zzz but the dashboard is running.** The `probe` doesn't match where the dashboard
  answers. Ask Claude to compare the probe's port and path with the dashboard's.
- **A chat can't call the agent.** Open a new chat on the Hub: a chat reads the agents list when it
  starts. Check `.claude/agents/<key>.md` exists in your Hub.
- **It guessed instead of saying "not verified".** Tighten its rules and add the missing fact, with
  where it came from. GS-09 shows how.
