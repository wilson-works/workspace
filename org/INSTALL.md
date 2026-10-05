# Installing agent-org in a new project

> **In the WorkSpace, one command does steps 1 to 3 for you:**
> `node bin/install.js org --into "<project folder>"` shows what it would copy, and
> `node bin/install.js org --into "<project folder>" --apply` does it. It also puts your name
> (workspace.config.json `owner.name`) into James's file where it says "(Update with user name)".
> Then do step 2 (match `org.config.json` to your repo) and the smoke test in step 5.
> The steps below are the same work by hand.

Four concrete artifacts get installed:

1. **The 18 agent `.md` files** -> `<repo>/.claude/agents/`
2. **The comms CLI + db** -> `<repo>/.claude/comms/comms.py`, db auto-created at `<repo>/.claude/comms.db` on first use
3. **The path-guard hook** -> `<repo>/.claude/hooks/path_guard.py` + a `PreToolUse` registration in `<repo>/.claude/settings.json`
4. **Per-project config** -> `<repo>/.claude/agents/org.config.json`

## Step 1 - copy files

From the skills repo into your project:

```bash
SKILL_SRC=path/to/claude_skills/skills/agent-org
REPO=$(git rev-parse --show-toplevel)

mkdir -p "$REPO/.claude/agents" "$REPO/.claude/comms" "$REPO/.claude/hooks"

cp "$SKILL_SRC"/agents/*.md       "$REPO/.claude/agents/"
cp "$SKILL_SRC"/comms/comms.py    "$REPO/.claude/comms/"
cp "$SKILL_SRC"/comms/schema.sql  "$REPO/.claude/comms/"
cp "$SKILL_SRC"/hooks/path_guard.py "$REPO/.claude/hooks/"
cp "$SKILL_SRC"/org.config.example.json "$REPO/.claude/agents/org.config.json"
```

PowerShell equivalent:

```powershell
$SkillSrc = "path\to\claude_skills\skills\agent-org"
$Repo = (git rev-parse --show-toplevel)

New-Item -ItemType Directory -Force -Path "$Repo\.claude\agents", "$Repo\.claude\comms", "$Repo\.claude\hooks" | Out-Null
Copy-Item "$SkillSrc\agents\*.md"          "$Repo\.claude\agents\"
Copy-Item "$SkillSrc\comms\comms.py"       "$Repo\.claude\comms\"
Copy-Item "$SkillSrc\comms\schema.sql"     "$Repo\.claude\comms\"
Copy-Item "$SkillSrc\hooks\path_guard.py"  "$Repo\.claude\hooks\"
Copy-Item "$SkillSrc\org.config.example.json" "$Repo\.claude\agents\org.config.json"
```

## Step 2 - edit org.config.json

Open `<repo>/.claude/agents/org.config.json`. The roster is fixed. Only edit the `owns` glob arrays per department to match YOUR repo's layout. Common patterns:

| Department | Typical globs |
|------------|---------------|
| backend    | `src/server/**`, `src/services/**`, `internal/**`, `apps/api/**` |
| frontend   | `src/client/**`, `apps/web/**`, `*.css`, `*.scss` |
| database   | `migrations/**`, `**/schema.sql`, `**/alembic/**`, `**/schema.prisma` |
| qa         | `tests/**`, `**/*.test.*`, `**/*.spec.*`, `e2e/**` |
| api        | `src/api/**`, `src/routes/**`, `openapi.yaml`, `**/schemas/**` |

The `shared` array is paths any agent (or main session) can edit without dept-ownership enforcement: README, CLAUDE.md, docs, the backlog folder, package manifests.

## Step 3 - register the hook

One PreToolUse hook ships with the org: **path_guard** (department path ownership). Copy it into
`<repo>/.claude/hooks/` and register it:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          { "type": "command", "command": "python \"${CLAUDE_PROJECT_DIR}/.claude/hooks/path_guard.py\"" }
        ]
      }
    ]
  }
}
```

If you already have PreToolUse hooks, ADD this command to the same matcher's `hooks` array — don't replace.

## Step 4 - initialize the comms db (optional, lazy by default)

The DB is created on first use. To pre-create:

```bash
python .claude/comms/comms.py init
```

Verify with:

```bash
python .claude/comms/comms.py whoami james     # CTO: c-suite
python .claude/comms/comms.py whoami marcus    # Backend Junior: dev-floor
python .claude/comms/comms.py stats
```

## Step 5 - smoke test

```bash
# CTO posts a directive
python .claude/comms/comms.py post c-suite james --to john \
  --subject "Smoke test" "Confirming the org is wired."

# John reads it
python .claude/comms/comms.py read c-suite john --unread -v

# Junior is denied
python .claude/comms/comms.py post c-suite marcus --to john --subject "nope" "test"
# expect: ACL DENY (exit 2)
```

If those three behaviors fire correctly, the org is ready.

## Step 6 - first real run

From the main session:

> "Use the cto-james agent. Direction: process work order BUG-001 from the backlog."

James will route through Tim to the right department head. Watch the comms log if you want to see the chatter:

```bash
python .claude/comms/comms.py read c-suite james --limit 50
python .claude/comms/comms.py read dept-heads tim --limit 50
python .claude/comms/comms.py read dev-floor cindy --limit 50
```

## Maintenance

- **Archive old messages:** `python .claude/comms/comms.py archive --before 2026-01-01`
- **Inspect with sqlite:** `sqlite3 .claude/comms.db ".tables"`
- **Reset:** delete `.claude/comms.db` — auto-recreated on next use.
- **Disable enforcement temporarily:** `AGENT_ORG_DISABLE=1` env var bypasses the path guard.

## Known limitations (V1)

- Path guard relies on agents claiming before editing. If an agent forgets to claim, the guard cannot enforce dept ownership (it allows by default to avoid false positives in main-session work). The agent system prompts make claims a hard rule, but human-spawned agents can still skip them.
- Parallel subagents that write to the same path race on the claim — the second one will be denied at claim time, which is the correct behavior, but they need to coordinate via `dev-floor` rather than retrying.
- The roster is fixed at 18. Adding a new department or a third junior to a department requires editing `comms.py` (ACL + DEPARTMENT_OF) and `path_guard.py` (DEPARTMENT_OF) in lockstep, then writing the new agent `.md`.
