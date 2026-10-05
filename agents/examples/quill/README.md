# Quill, The Content Desk

Drafts your posts and newsletters in your own voice.

Quill is the demo agent package that ships with the WilsonWorks Workspace. Install it to see what a
specialist agent is, then use it as the model for your own. Its voice notes, rules and memory are
invented demo content: replace them with yours, or let Quill learn them from your corrections.

## Install it

From the Workspace folder:

```
node agents/bin/install-agent.js agents/examples/quill
```

It is copied to your Hub's `50-AI/agents/quill/`, registered as a Claude Code subagent called
`quill`, and gets an office in the Agents' wing with a door into its dashboard. Add `--yes` to start
its dashboard without being asked.

## What is in it

| File or folder | What it is |
|---|---|
| `agent.json` | Who it is, its colours, its door and how to start it. The office finds this file by itself. |
| `CLAUDE.md` | Who Quill is, what it does, what it never does, how it learns. |
| `brains/` | What it knows: your voice and the formats of each channel. |
| `rules/` | Its standing rules: never posts without a yes; every claim has a source. |
| `memory/` | What it has learned. `MEMORY.md` is the index, one line per lesson. |
| `dashboard/server.js` | Its page, on this computer only: `http://127.0.0.1:7612/` (another port if that one is taken). |
| `mark.svg`, `art.svg` | Its sign on the office door, and the figure standing in the doorway. |
| `subagent.md` | How Claude Code calls it. It is copied to `<Hub>/.claude/agents/quill.md`. |

## Use it

- In any Claude Code session on your Hub: "Ask Quill to draft a post from this note: ...".
- Start or stop its dashboard: `node agents/bin/agent.js start quill`, `node agents/bin/agent.js stop quill`.
- Take it out again: `node agents/bin/agent.js remove quill` (it moves to the archive's `_DumpQueue`;
  nothing is deleted).
