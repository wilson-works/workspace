#!/usr/bin/env python3
"""agent-org comms CLI.

A token-efficient SQLite-backed message bus + path-claim ledger for the
agent-org hierarchy. Three channels, three tiers, hard ACL.

Channels:
    c-suite     James, John, Tim
    dept-heads  Tim, Cindy, Gavin, Diana, Rachel, Josh
    dev-floor   Cindy, Gavin, Diana, Rachel, Josh + all juniors

Token discipline:
    Default `read` output is one line per message: "#42 14:23 cindy->john (subj)".
    Bodies only print under --verbose. Default --limit is 20.
    A body over MAX_BODY_CHARS (2000) is auto-split into a numbered thread on post.
    Nothing is dropped and nothing is rejected; the parts carry "(i/n)" subjects
    and share a thread_id.

Database location:
    Resolved in this order:
      1) AGENT_ORG_DB env var
      2) <repo>/.claude/comms.db where <repo> is the nearest ancestor with .git
      3) ./.claude/comms.db relative to cwd
    Steps 2 and 3 are BOTH relative to the process cwd, so a call made from a git
    worktree or a run subdirectory silently creates and writes to a private comms.db --
    the post succeeds and nobody ever reads it. Pin AGENT_ORG_DB to the main checkout's
    comms.db on every call.

CLI:
    comms.py post <channel> <from> --subject TEXT [--to A] [--thread ID] [--wo WO] BODY
    comms.py read <channel> <as_agent> [--since ID|--unread] [--limit N] [--verbose] [--mine]
    comms.py thread <id> <as_agent> [--verbose]
    comms.py inbox <as_agent> [--unread] [--limit N]
    comms.py mark-read <channel> <as_agent> [--up-to ID]
    comms.py claim <path> <as_agent> [--wo WO]
    comms.py release (--path PATH | --id ID) <as_agent>
    comms.py claims [--active] [--by AGENT] [--for-path PATH]
    comms.py whoami <agent>
    comms.py stats
    comms.py archive --before YYYY-MM-DD
    comms.py init        Force-create the DB (normally lazy on first use)
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
import textwrap
from datetime import datetime
from fnmatch import fnmatch
from pathlib import Path

# ---------------------------------------------------------------------------
# Roster + ACL. The org is fixed; only the *project paths* are configurable
# (see org.config.json, consumed by path_guard.py — not here).
# ---------------------------------------------------------------------------

CHANNELS = ("c-suite", "dept-heads", "dev-floor")

ACL: dict[str, set[str]] = {
    # C-suite (Opus)
    "james": {"c-suite"},  # CTO
    "john": {"c-suite"},  # Chief Engineer
    # Bridge (Opus) — only agent on TWO upper channels
    "tim": {"c-suite", "dept-heads"},  # Exec Assistant
    # Department heads (Opus) — bridge dept-heads <-> dev-floor
    "cindy": {"dept-heads", "dev-floor"},  # Backend
    "gavin": {"dept-heads", "dev-floor"},  # Frontend
    "diana": {"dept-heads", "dev-floor"},  # Database
    "rachel": {"dept-heads", "dev-floor"},  # QA
    "josh": {"dept-heads", "dev-floor"},  # API
    # Juniors (Sonnet) — confined to dev-floor
    "marcus": {"dev-floor"},
    "priya": {"dev-floor"},  # backend
    "ava": {"dev-floor"},
    "kai": {"dev-floor"},  # frontend
    "leo": {"dev-floor"},
    "nora": {"dev-floor"},  # database
    "owen": {"dev-floor"},
    "maya": {"dev-floor"},  # qa
    "felix": {"dev-floor"},
    "zara": {"dev-floor"},  # api
}

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

ROLE_OF: dict[str, str] = {
    "james": "CTO",
    "john": "Chief Engineer",
    "tim": "Executive Assistant",
    "cindy": "Backend Lead",
    "gavin": "Frontend Lead",
    "diana": "Database Lead",
    "rachel": "QA Lead",
    "josh": "API Lead",
    "marcus": "Backend Junior",
    "priya": "Backend Junior",
    "ava": "Frontend Junior",
    "kai": "Frontend Junior",
    "leo": "Database Junior",
    "nora": "Database Junior",
    "owen": "QA Junior",
    "maya": "QA Junior",
    "felix": "API Junior",
    "zara": "API Junior",
}

MAX_BODY_CHARS = 2000
SCHEMA_PATH = Path(__file__).parent / "schema.sql"

# ---------------------------------------------------------------------------
# DB plumbing
# ---------------------------------------------------------------------------


def find_repo_root(start: Path) -> Path | None:
    cur = start.resolve()
    for p in (cur, *cur.parents):
        if (p / ".git").exists():
            return p
    return None


def resolve_db_path() -> Path:
    env = os.environ.get("AGENT_ORG_DB")
    if env:
        return Path(env)
    repo = find_repo_root(Path.cwd())
    base = repo if repo else Path.cwd()
    return base / ".claude" / "comms.db"


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    fresh = not db_path.exists()
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    if fresh or _missing_tables(conn):
        schema = SCHEMA_PATH.read_text(encoding="utf-8")
        conn.executescript(schema)
        conn.commit()
    return conn


def _missing_tables(conn: sqlite3.Connection) -> bool:
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    have = {r[0] for r in rows}
    return not {"messages", "read_state", "claims", "audit"}.issubset(have)


# ---------------------------------------------------------------------------
# ACL + validation
# ---------------------------------------------------------------------------


def require_known_agent(agent: str) -> None:
    if agent not in ACL:
        die(f"unknown agent '{agent}'. Roster: {', '.join(sorted(ACL))}")


def require_channel(channel: str) -> None:
    if channel not in CHANNELS:
        die(f"unknown channel '{channel}'. Channels: {', '.join(CHANNELS)}")


def require_acl(agent: str, channel: str, action: str) -> None:
    require_known_agent(agent)
    require_channel(channel)
    if channel not in ACL[agent]:
        die(
            f"ACL DENY: {agent} ({ROLE_OF[agent]}) cannot {action} on '{channel}'. "
            f"Allowed channels: {', '.join(sorted(ACL[agent])) or 'none'}"
        )


def die(msg: str, code: int = 2) -> None:
    sys.stderr.write(f"comms: {msg}\n")
    sys.exit(code)


def audit(conn: sqlite3.Connection, agent: str, action: str, detail: str = "") -> None:
    conn.execute(
        "INSERT INTO audit (agent, action, detail) VALUES (?, ?, ?)",
        (agent, action, detail[:500]),
    )


# ---------------------------------------------------------------------------
# Output formatting (token-efficient by default)
# ---------------------------------------------------------------------------


def short_time(iso: str) -> str:
    # 2026-05-06T14:23:01.123Z -> 05-06 14:23
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.strftime("%m-%d %H:%M")
    except ValueError:
        return iso[:16]


def fmt_row(row: sqlite3.Row, verbose: bool) -> str:
    target = row["to_agent"] or row["channel"]
    head = (
        f"#{row['id']} {short_time(row['posted_at'])} "
        f"{row['from_agent']}->{target} ({row['subject']})"
    )
    if row["work_order"]:
        head += f" [{row['work_order']}]"
    if not verbose:
        return head
    body = textwrap.fill(row["body"], width=78, initial_indent="  ", subsequent_indent="  ")
    return f"{head}\n{body}"


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def cmd_post(args: argparse.Namespace) -> int:
    require_acl(args.from_agent, args.channel, "post")
    if args.to:
        require_known_agent(args.to)
    body = args.body
    if body == "-":
        body = sys.stdin.read()
    # LC-25 repair (walter session 6, upstreamed by
    # WO-20260815-org-pack-drift-corrections): never truncate. An oversize body
    # auto-splits into a numbered thread instead of losing its tail. The old
    # warn-and-truncate path cost session 6's lanes ~20 message tails, and the
    # loss was silent at the point it mattered -- the end of a message is where
    # the handoff lives.
    chunks = [body[i : i + MAX_BODY_CHARS] for i in range(0, len(body), MAX_BODY_CHARS)] or [""]

    db = resolve_db_path()
    conn = connect(db)
    thread = args.thread
    first_id = None
    total = len(chunks)
    for i, chunk in enumerate(chunks, start=1):
        subject = args.subject if total == 1 else f"{args.subject} ({i}/{total})"
        cur = conn.execute(
            """INSERT INTO messages
                  (channel, from_agent, to_agent, thread_id, subject, body, work_order)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (args.channel, args.from_agent, args.to, thread, subject, chunk, args.wo),
        )
        audit(conn, args.from_agent, "post", f"#{cur.lastrowid} {args.channel} -> {args.to or '*'}")
        if first_id is None:
            first_id = cur.lastrowid
            if thread is None and total > 1:
                thread = first_id
    conn.commit()
    if total > 1:
        print(
            f"posted #{first_id} on {args.channel} (auto-split into {total} parts, thread #{thread})"
        )
    else:
        print(f"posted #{first_id} on {args.channel}")
    return 0


def cmd_read(args: argparse.Namespace) -> int:
    require_acl(args.as_agent, args.channel, "read")
    db = resolve_db_path()
    conn = connect(db)
    conn.row_factory = sqlite3.Row

    since = args.since
    if args.unread:
        cur = conn.execute(
            "SELECT last_read_id FROM read_state WHERE agent = ? AND channel = ?",
            (args.as_agent, args.channel),
        ).fetchone()
        since = cur["last_read_id"] if cur else 0

    where = ["channel = ?"]
    params: list = [args.channel]
    if since is not None:
        where.append("id > ?")
        params.append(since)
    if args.mine:
        where.append("(to_agent = ? OR to_agent IS NULL)")
        params.append(args.as_agent)

    sql = f"SELECT * FROM messages WHERE {' AND '.join(where)} " f"ORDER BY id DESC LIMIT ?"
    params.append(args.limit)
    rows = list(reversed(conn.execute(sql, params).fetchall()))

    if not rows:
        print(f"(no messages on {args.channel}" + (f" since #{since}" if since else "") + ")")
        return 0

    for row in rows:
        print(fmt_row(row, args.verbose))

    # advance read cursor to the newest message returned
    newest = max(r["id"] for r in rows)
    conn.execute(
        """INSERT INTO read_state (agent, channel, last_read_id)
           VALUES (?, ?, ?)
           ON CONFLICT(agent, channel) DO UPDATE
             SET last_read_id = MAX(last_read_id, excluded.last_read_id)""",
        (args.as_agent, args.channel, newest),
    )
    audit(conn, args.as_agent, "read", f"{args.channel} up_to #{newest} ({len(rows)} msgs)")
    conn.commit()
    return 0


def cmd_thread(args: argparse.Namespace) -> int:
    require_known_agent(args.as_agent)
    db = resolve_db_path()
    conn = connect(db)
    conn.row_factory = sqlite3.Row

    root = conn.execute("SELECT * FROM messages WHERE id = ?", (args.id,)).fetchone()
    if not root:
        die(f"no message #{args.id}")
    require_acl(args.as_agent, root["channel"], "read")

    rows = conn.execute(
        """SELECT * FROM messages
           WHERE id = ? OR thread_id = ?
           ORDER BY id ASC""",
        (args.id, args.id),
    ).fetchall()
    for row in rows:
        print(fmt_row(row, verbose=True))
    return 0


def cmd_inbox(args: argparse.Namespace) -> int:
    require_known_agent(args.as_agent)
    db = resolve_db_path()
    conn = connect(db)
    conn.row_factory = sqlite3.Row

    channels = sorted(ACL[args.as_agent])
    placeholders = ",".join("?" * len(channels))
    where = [f"channel IN ({placeholders})", "to_agent = ?"]
    params: list = [*channels, args.as_agent]

    if args.unread:
        # filter against per-channel last_read_id
        cursors = {
            r["channel"]: r["last_read_id"]
            for r in conn.execute(
                "SELECT channel, last_read_id FROM read_state WHERE agent = ?",
                (args.as_agent,),
            ).fetchall()
        }
        # build per-channel OR clauses
        chan_clauses = []
        for c in channels:
            chan_clauses.append("(channel = ? AND id > ?)")
            params.extend([c, cursors.get(c, 0)])
        where = [f"({' OR '.join(chan_clauses)})", "to_agent = ?"]
        params.append(args.as_agent)

    sql = f"SELECT * FROM messages WHERE {' AND '.join(where)} " f"ORDER BY id DESC LIMIT ?"
    params.append(args.limit)
    rows = list(reversed(conn.execute(sql, params).fetchall()))

    if not rows:
        print(f"(inbox empty for {args.as_agent})")
        return 0
    for row in rows:
        print(fmt_row(row, verbose=False))
    return 0


def cmd_mark_read(args: argparse.Namespace) -> int:
    require_acl(args.as_agent, args.channel, "read")
    db = resolve_db_path()
    conn = connect(db)
    up_to = args.up_to
    if up_to is None:
        cur = conn.execute(
            "SELECT MAX(id) AS m FROM messages WHERE channel = ?",
            (args.channel,),
        ).fetchone()
        up_to = cur[0] or 0
    conn.execute(
        """INSERT INTO read_state (agent, channel, last_read_id)
           VALUES (?, ?, ?)
           ON CONFLICT(agent, channel) DO UPDATE
             SET last_read_id = MAX(last_read_id, excluded.last_read_id)""",
        (args.as_agent, args.channel, up_to),
    )
    conn.commit()
    print(f"marked {args.channel} read up to #{up_to} for {args.as_agent}")
    return 0


def cmd_claim(args: argparse.Namespace) -> int:
    require_known_agent(args.as_agent)
    db = resolve_db_path()
    conn = connect(db)
    conn.row_factory = sqlite3.Row
    # detect overlap with existing active claims by other agents
    existing = conn.execute("SELECT id, agent, path FROM claims WHERE status = 'active'").fetchall()
    for row in existing:
        if row["agent"] == args.as_agent:
            continue
        if _paths_overlap(args.path, row["path"]):
            die(
                f"CLAIM CONFLICT: '{args.path}' overlaps with claim "
                f"#{row['id']} ('{row['path']}') held by {row['agent']}. "
                f"Coordinate on dev-floor or wait for release.",
                code=3,
            )
    cur = conn.execute(
        """INSERT INTO claims (path, agent, work_order)
           VALUES (?, ?, ?)""",
        (args.path, args.as_agent, args.wo),
    )
    audit(conn, args.as_agent, "claim", f"#{cur.lastrowid} {args.path}")
    conn.commit()
    print(f"claim #{cur.lastrowid} active for {args.as_agent}: {args.path}")
    return 0


def cmd_release(args: argparse.Namespace) -> int:
    require_known_agent(args.as_agent)
    db = resolve_db_path()
    conn = connect(db)
    if args.id:
        n = conn.execute(
            """UPDATE claims SET status='released',
                 released_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
               WHERE id = ? AND agent = ? AND status='active'""",
            (args.id, args.as_agent),
        ).rowcount
    else:
        n = conn.execute(
            """UPDATE claims SET status='released',
                 released_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
               WHERE path = ? AND agent = ? AND status='active'""",
            (args.path, args.as_agent),
        ).rowcount
    audit(conn, args.as_agent, "release", f"id={args.id} path={args.path} n={n}")
    conn.commit()
    print(f"released {n} claim(s) for {args.as_agent}")
    return 0 if n else 1


def cmd_claims(args: argparse.Namespace) -> int:
    db = resolve_db_path()
    conn = connect(db)
    conn.row_factory = sqlite3.Row
    where, params = [], []
    if args.active:
        where.append("status = 'active'")
    if args.by:
        where.append("agent = ?")
        params.append(args.by)
    if args.for_path:
        # naive overlap filter using path prefix; precise overlap is in cmd_claim
        where.append("(path LIKE ? OR ? LIKE path)")
        params.extend([f"{args.for_path}%", args.for_path])
    sql = "SELECT * FROM claims"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY id DESC LIMIT 50"
    rows = conn.execute(sql, params).fetchall()
    if not rows:
        print("(no claims match)")
        return 0
    for r in rows:
        wo = f" [{r['work_order']}]" if r["work_order"] else ""
        rel = f" released {short_time(r['released_at'])}" if r["released_at"] else ""
        print(
            f"#{r['id']} {r['status']:8} {r['agent']:7} "
            f"{r['path']}{wo} (claimed {short_time(r['claimed_at'])}){rel}"
        )
    return 0


def cmd_whoami(args: argparse.Namespace) -> int:
    require_known_agent(args.agent)
    role = ROLE_OF[args.agent]
    dept = DEPARTMENT_OF.get(args.agent, "-")
    chans = ", ".join(sorted(ACL[args.agent]))
    print(f"{args.agent}: {role} (dept: {dept}) channels: {chans}")
    return 0


def cmd_stats(_: argparse.Namespace) -> int:
    db = resolve_db_path()
    conn = connect(db)
    conn.row_factory = sqlite3.Row
    print(f"db: {db}")
    for ch in CHANNELS:
        total = conn.execute(
            "SELECT COUNT(*) AS c FROM messages WHERE channel = ?", (ch,)
        ).fetchone()["c"]
        print(f"  {ch}: {total} messages")
    active = conn.execute("SELECT COUNT(*) AS c FROM claims WHERE status = 'active'").fetchone()[
        "c"
    ]
    print(f"  active claims: {active}")
    return 0


def cmd_archive(args: argparse.Namespace) -> int:
    db = resolve_db_path()
    conn = connect(db)
    n = conn.execute("DELETE FROM messages WHERE posted_at < ?", (args.before,)).rowcount
    m = conn.execute("DELETE FROM audit WHERE at < ?", (args.before,)).rowcount
    conn.commit()
    print(f"archived {n} messages, {m} audit rows before {args.before}")
    return 0


def cmd_init(_: argparse.Namespace) -> int:
    db = resolve_db_path()
    connect(db).close()
    print(f"initialized {db}")
    return 0


# ---------------------------------------------------------------------------
# Path overlap (used by claim conflict detection AND by path_guard hook)
# ---------------------------------------------------------------------------


def _paths_overlap(a: str, b: str) -> bool:
    """Conservative overlap test for path globs.

    Treats either side as a glob; declares overlap if either matches the other
    or if their literal-prefix portions share a parent. Good enough for the
    coarse 'don't both edit packages/coa/**' use case.
    """
    if a == b:
        return True
    if fnmatch(a, b) or fnmatch(b, a):
        return True
    a_lit = a.split("*", 1)[0].rstrip("/")
    b_lit = b.split("*", 1)[0].rstrip("/")
    if not a_lit or not b_lit:
        return True
    return a_lit.startswith(b_lit) or b_lit.startswith(a_lit)


# ---------------------------------------------------------------------------
# Argparse wiring
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="comms", description=__doc__.split("\n", 1)[0])
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("post", help="post a message to a channel")
    sp.add_argument("channel")
    sp.add_argument("from_agent")
    sp.add_argument("body", help="message body, or '-' to read from stdin")
    sp.add_argument("--to")
    sp.add_argument("--thread", type=int)
    sp.add_argument("--subject", required=True)
    sp.add_argument("--wo")
    sp.set_defaults(func=cmd_post)

    sp = sub.add_parser("read", help="read messages on a channel")
    sp.add_argument("channel")
    sp.add_argument("as_agent")
    sp.add_argument("--since", type=int)
    sp.add_argument("--unread", action="store_true")
    sp.add_argument(
        "--mine", action="store_true", help="only messages addressed to you or broadcast"
    )
    sp.add_argument("--limit", type=int, default=20)
    sp.add_argument("--verbose", "-v", action="store_true")
    sp.set_defaults(func=cmd_read)

    sp = sub.add_parser("thread", help="read a thread by root id")
    sp.add_argument("id", type=int)
    sp.add_argument("as_agent")
    sp.add_argument("--verbose", "-v", action="store_true")
    sp.set_defaults(func=cmd_thread)

    sp = sub.add_parser("inbox", help="messages addressed to you across allowed channels")
    sp.add_argument("as_agent")
    sp.add_argument("--unread", action="store_true")
    sp.add_argument("--limit", type=int, default=20)
    sp.set_defaults(func=cmd_inbox)

    sp = sub.add_parser("mark-read", help="advance your read cursor on a channel")
    sp.add_argument("channel")
    sp.add_argument("as_agent")
    sp.add_argument("--up-to", type=int)
    sp.set_defaults(func=cmd_mark_read)

    sp = sub.add_parser("claim", help="claim a path before editing it")
    sp.add_argument("path")
    sp.add_argument("as_agent")
    sp.add_argument("--wo")
    sp.set_defaults(func=cmd_claim)

    sp = sub.add_parser("release", help="release a claim")
    g = sp.add_mutually_exclusive_group(required=True)
    g.add_argument("--path")
    g.add_argument("--id", type=int)
    sp.add_argument("as_agent")
    sp.set_defaults(func=cmd_release)

    sp = sub.add_parser("claims", help="list claims")
    sp.add_argument("--active", action="store_true")
    sp.add_argument("--by")
    sp.add_argument("--for-path")
    sp.set_defaults(func=cmd_claims)

    sp = sub.add_parser("whoami", help="show role + allowed channels for an agent")
    sp.add_argument("agent")
    sp.set_defaults(func=cmd_whoami)

    sp = sub.add_parser("stats", help="db stats")
    sp.set_defaults(func=cmd_stats)

    sp = sub.add_parser("archive", help="delete messages older than --before YYYY-MM-DD")
    sp.add_argument("--before", required=True)
    sp.set_defaults(func=cmd_archive)

    sp = sub.add_parser("init", help="force-initialize the db (otherwise lazy)")
    sp.set_defaults(func=cmd_init)

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
