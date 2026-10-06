# 50-AI

**What goes here:** the tools Claude works with.

- `{{workspace}}/`: the office, the course and the installer.
- `claude_skills/`: the skills pack, checked out at a pinned commit.
- `agents/<key>/`: one folder per specialist agent. Its `agent.json` gives it an office in the Agents' wing.
- `fleet-ops/`: your private fleet repo, only when you use more than one computer.

**What never goes here:** client data, passwords, keys or tokens. An agent reads those from where they belong; it
never keeps a copy.

**Example:** `50-AI/agents/louise/agent.json` gives Louise, the research librarian, her office.
