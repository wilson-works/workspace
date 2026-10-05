# {{name}}, {{title}}

{{line}}

A specialist agent for the WilsonWorks Workspace, made on {{date}}. The contract it follows is
`agents/CONTRACT.md` in the Workspace.

| File or folder | What it is |
|---|---|
| `agent.json` | Who it is, its colours, its door and how to start it. The office finds this file by itself. |
| `CLAUDE.md` | Who the agent is, what it does, what it never does, how it learns. |
| `brains/` | What it knows: one markdown file per topic. |
| `rules/` | Its standing rules, each one checkable. |
| `memory/` | What it has learned. `MEMORY.md` is the index, one line per lesson. |
| `dashboard/server.js` | Its page, on this computer only: `http://127.0.0.1:{{port}}/`. |
| `mark.svg`, `art.svg` | Its sign on the office door, and the figure standing in the doorway. |
| `subagent.md` | How Claude Code calls it. It is copied to `<Hub>/.claude/agents/{{key}}.md`. |

## Use it

- In any Claude Code session on your Hub: "Ask {{name}} to ..." (the subagent is called `{{key}}`).
- Start its dashboard: `node agents/bin/agent.js start {{key}}` from the Workspace folder.
- Stop it: `node agents/bin/agent.js stop {{key}}`.

## Teach it

Tell it what it got wrong. It writes the lesson to `memory/`, and a mistake that must never happen
again becomes a rule in `rules/`. You can also edit `brains/` and `rules/` yourself: they are plain
text.
