# CBFC, The Academy

Opens the CBFC Academy on this computer: the firm library, Ask CBFC and Planning.

A basic setup for the WilsonWorks Workspace (2026-11-06). The contract it follows is
`agents/CONTRACT.md` in the Workspace.

| File or folder | What it is |
|---|---|
| `agent.json` | Who it is, its colours, its door and how to start it. The office finds this file by itself. |
| `CLAUDE.md` | Who the agent is, what it does, what it never does, how it learns. |
| `brains/` | What it knows: one markdown file per topic. |
| `rules/` | Its standing rules, each one checkable. |
| `memory/` | What it has learned. `MEMORY.md` is the index, one line per lesson. |
| `dashboard/server.js` | Its page, on this computer only: `http://127.0.0.1:7570/`. |
| `mark.svg`, `art.svg` | Its sign on the office door, and the figure standing in the doorway. |
| `subagent.md` | How Claude Code calls it. It is copied to `<Hub>/.claude/agents/cbfc.md`. |

## Use it

- In any Claude Code session on your Hub: "Ask CBFC to ..." (the subagent is called `cbfc`).
- Start its dashboard: `node agents/bin/agent.js start cbfc` from the Workspace folder.
- Stop it: `node agents/bin/agent.js stop cbfc`.

## Teach it

Tell it what it got wrong. It writes the lesson to `memory/`, and a mistake that must never happen
again becomes a rule in `rules/`. You can also edit `brains/` and `rules/` yourself: they are plain
text.
