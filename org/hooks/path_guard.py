"""agent-org PreToolUse path guard.

Enforces department ownership for Write / Edit / MultiEdit operations.

Logic:
  1. Read tool input from stdin (JSON, Claude Code hook contract).
  2. Resolve the target file path. If not a path-bearing tool, allow.
  3. Look up active comms claims overlapping the path.
       - 0 matches  -> assume main session or shared code, allow.
       - 1+ matches -> for each claiming agent, check their department's
         owned globs in org.config.json. Allow if any owning department
         claims the path OR the path is on the `shared` list.
       - Otherwise block, naming the conflicting agent + owning department.

Exit codes:
  0  allow
  2  block (Claude Code surfaces stderr)

Configure with:
  AGENT_ORG_DB        path to comms.db (defaults to <repo>/.claude/comms.db)
  AGENT_ORG_CONFIG    path to org.config.json (defaults to <repo>/.claude/agents/org.config.json)
  AGENT_ORG_DISABLE   set to 1 to short-circuit and always allow (debugging only)
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from fnmatch import fnmatch
from pathlib import Path

# Roster -> department. Mirrors comms.py intentionally; this hook is meant to
# be drop-in alongside comms.py, so the duplication keeps the hook standalone.
DEPARTMENT_OF: dict[str, str] = {
    "cindy": "backend",
    "marcus": "backend",
    "priya": "backend",
    "gavin": "frontend",
    "ava": "frontend",
    "kai": "frontend",
    "diana": "database",
    "leo": "database",
    "nora": "database",
    "rachel": "qa",
    "owen": "qa",
    "maya": "qa",
    "josh": "api",
    "felix": "api",
    "zara": "api",
}

PATH_TOOLS = {"Write", "Edit", "MultiEdit", "NotebookEdit"}


def find_repo_root(start: Path) -> Path:
    cur = start.resolve()
    for p in (cur, *cur.parents):
        if (p / ".git").exists():
            return p
    return start


def normalize(p: str) -> str:
    return p.replace("\\", "/")


def glob_match(path: str, pattern: str) -> bool:
    # fnmatch treats ** loosely; tighten with a simple ancestor check.
    if fnmatch(path, pattern):
        return True
    if "**" in pattern:
        prefix = pattern.split("**", 1)[0].rstrip("/")
        if prefix and path.startswith(prefix + "/"):
            return True
    return False


def paths_overlap(a: str, b: str) -> bool:
    if a == b or fnmatch(a, b) or fnmatch(b, a):
        return True
    a_lit = a.split("*", 1)[0].rstrip("/")
    b_lit = b.split("*", 1)[0].rstrip("/")
    if not a_lit or not b_lit:
        return True
    return a_lit.startswith(b_lit) or b_lit.startswith(a_lit)


def load_config(config_path: Path) -> dict:
    if not config_path.exists():
        return {}
    try:
        return json.loads(config_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        sys.stderr.write(f"[path_guard] org.config.json parse error: {exc}\n")
        return {}


def department_owns(config: dict, dept: str, rel_path: str) -> bool:
    deps = config.get("departments", {})
    spec = deps.get(dept)
    if not spec:
        return True  # unknown dept -> degraded: allow rather than misfire
    return any(glob_match(rel_path, normalize(pattern)) for pattern in spec.get("owns", []))


def is_shared(config: dict, rel_path: str) -> bool:
    return any(glob_match(rel_path, normalize(pattern)) for pattern in config.get("shared", []))


def active_claims_for(db_path: Path, rel_path: str) -> list[tuple[int, str, str]]:
    if not db_path.exists():
        return []
    try:
        conn = sqlite3.connect(str(db_path))
        rows = conn.execute("SELECT id, agent, path FROM claims WHERE status = 'active'").fetchall()
        conn.close()
    except sqlite3.DatabaseError as exc:
        sys.stderr.write(f"[path_guard] db read error: {exc}\n")
        return []
    return [(rid, agent, path) for rid, agent, path in rows if paths_overlap(rel_path, path)]


def main() -> int:
    if os.environ.get("AGENT_ORG_DISABLE") == "1":
        return 0

    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0

    tool_name = payload.get("tool_name") or payload.get("name") or ""
    if tool_name not in PATH_TOOLS:
        return 0

    tool_input = payload.get("tool_input") or {}
    raw_path = (
        tool_input.get("file_path")
        or tool_input.get("notebook_path")
        or tool_input.get("path")
        or ""
    )
    if not raw_path:
        return 0

    repo_root = find_repo_root(Path.cwd())
    db_path = Path(os.environ.get("AGENT_ORG_DB") or repo_root / ".claude" / "comms.db")
    config_path = Path(
        os.environ.get("AGENT_ORG_CONFIG") or repo_root / ".claude" / "agents" / "org.config.json"
    )

    config = load_config(config_path)

    abs_path = Path(raw_path)
    if not abs_path.is_absolute():
        abs_path = (repo_root / abs_path).resolve()
    try:
        rel = normalize(str(abs_path.relative_to(repo_root)))
    except ValueError:
        # outside repo -> allow (out of scope for org enforcement)
        return 0

    claims = active_claims_for(db_path, rel)

    if not claims:
        # no claim held -> assume main session work; allow.
        return 0

    if is_shared(config, rel):
        return 0

    # Any claiming agent whose department owns this path => allow.
    for _cid, agent, _claim_path in claims:
        dept = DEPARTMENT_OF.get(agent)
        if not dept:
            # external agent claim -> allow (don't break unknown setups)
            return 0
        if department_owns(config, dept, rel):
            return 0

    # No claiming agent has authority over this path -> block.
    detail = ", ".join(
        f"{agent} ({DEPARTMENT_OF.get(agent, 'unknown')}) holds claim #{cid} on '{claim_path}'"
        for cid, agent, claim_path in claims
    )
    sys.stderr.write(
        "[path_guard] BLOCKED -- department mismatch.\n"
        f"  target: {rel}\n"
        f"  claims: {detail}\n"
        "  Hand this work off to the correct department head, or release the claim.\n"
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
