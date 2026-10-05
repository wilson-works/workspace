"""Walkaway permission hook — a walkaway session never waits on a permission dialog.

Register for BOTH `PreToolUse` and `PermissionRequest`. PreToolUse fires before any permission-mode
check in every mode, so the decision does not depend on the VS Code bypass toggle having been
flipped for this conversation (it is per-conversation and never remembered).
PermissionRequest is the backstop: if a dialog still forms, this answers it.

Armed only when a walkaway marker exists; an interactive session (no marker) is untouched:
    env CLAUDE_WALKAWAY=1   |   <project>/.claude/WALKAWAY   |   <project>/.walkaway/ON

Every tool call gets exactly one of two answers, and neither is a wait:
    allow — everything outside the irreversible class
    deny  — the irreversible class, the off-limits paths, connector writes, and any tool whose
            whole purpose is to ask a human. A deny is fed back to the model; it routes around.

An internal error answers `deny` (never a dialog, never an unclassified allow).
Every decision is appended to <project>/requests.jsonl (override: env WALKAWAY_LOG).
"""
import json
import os
import re
import sys
import time

# Tools that exist to wait for a human.
HUMAN_TOOLS = {"AskUserQuestion", "EnterPlanMode", "ExitPlanMode"}

# Machine-local policy. NOTHING about a particular machine, profile or business lives in this file:
# it is shared. Each install writes <claude-home>/walkaway.local.json (node bin/install.js permissions):
#   off_limits    path prefixes no walkaway session may name
#   push_main_ok  repo-path fragments where pushing main IS the job (coordination / docs repos)
#   local_mcp     MCP servers that are local tools, not connectors
#   extra_roots   zone roots whose recursive delete is refused
# A missing or unreadable file means empty lists: the generic classes below still bind.
def claude_home():
    return os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(os.path.expanduser("~"), ".claude")


def load_local():
    path = os.environ.get("WALKAWAY_CONFIG") or os.path.join(claude_home(), "walkaway.local.json")
    try:
        with open(path, "r", encoding="utf-8-sig") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


SEP = r"[\\/]+"


def path_forms(prefix):
    """Regex alternatives for one path prefix in every slash style: X:\a\b, X:/a/b and /x/a/b."""
    parts = [q for q in re.split(SEP, str(prefix).strip()) if q]
    if not parts:
        return []
    rest = [re.escape(q) for q in parts[1:]]
    if re.fullmatch(r"[A-Za-z]:", parts[0]):
        drive = parts[0][0]
        forms = [SEP.join([drive + ":"] + rest), "/" + "/".join([drive] + rest)]
    else:
        forms = ["/?" + SEP.join([re.escape(parts[0])] + rest)]
    return [f + r"(?![\w.-])" for f in forms]


LOCAL = load_local()
# One compiled pattern per off-limits root, so a session that is itself rooted inside one of them
# keeps working there. The rule is no CROSS-contamination: a session rooted in D:\Work may not
# name C:\Users\other, and a session rooted in C:\Users\other\project may.
OFF_LIMITS = [re.compile("(?i)(" + "|".join(path_forms(pre)) + ")") for pre in LOCAL.get("off_limits", []) if path_forms(pre)]


def crosses_boundary(tool_input, cwd):
    """True when a tool input names an off-limits root that the session's own cwd is NOT inside."""
    text = path_text(tool_input)
    home = (cwd or "") + "/"
    for rx in OFF_LIMITS:
        if rx.search(text) and not rx.search(home):
            return True
    return False
_extra = [f for pre in LOCAL.get("extra_roots", []) for f in path_forms(pre)]

# The irreversible class for shell tools. Small on purpose: every line names the rule it enforces.
_ROOTS = "(?i:" + "|".join([r"/", r"~", r"\$HOME", r"\.git", r"/[a-zA-Z]", r"[a-zA-Z]:[\\/]*"] + _extra) + ")"
IRREVERSIBLE = [
    (r"\bgit\s+(-C\s+\S+\s+)?push\b[^|;&]*(\s--force\b|\s-f\b|\s--force-with-lease\b|\s--mirror\b|\s\+\S+)", "force push (history is forever)"),
    (r"\bgit\s+(-C\s+\S+\s+)?clean\s+-[a-zA-Z]*f", "git clean -f (untracked work is unrecoverable)"),
    (r"\bgh\s+api\b[^|;&]*(-X|--method)[ =]?(DELETE|PUT|PATCH)\b", "gh api with a destructive method"),
    (r"(?i)(>|\bOut-File\b|\bSet-Content\b|\bAdd-Content\b|\btee\b|\bcp\b|\bmv\b|\bcopy\b|\bmove\b|\bsed\s+-i)[^|;&]*users[\\/]+[^\\/\s]+[\\/]+\.claude[\\/]+settings(\.local)?\.json", "user-scope settings.json is the owner's change to make"),
    (r"\bgit\s+(-C\s+\S+\s+)?push\b[^|;&]*(\s--delete\b|\s:\S+)", "remote branch delete (the owner decides)"),
    (r"\bgit\s+(-C\s+\S+\s+)?gc\b", "git gc (never from an unattended session: it can hold a shared repo for hours)"),
    (r"\brm\s+(-[a-zA-Z]*[rR][a-zA-Z]*\s+)+(-\S+\s+)*[\"']?" + _ROOTS + r"[\"']?(\s|$)", "recursive delete of a root, a home or a .git"),
    (r"(?i)\bRemove-Item\b[^|;]*-Recurse[^|;]*\s[\"']?" + _ROOTS + r"[\"']?(\s|$)", "recursive delete of a root, a home or a .git"),
    (r"\brailway(\.exe)?\s+(up|deploy|redeploy)\b", "production deploy is the owner's attended act"),
    (r"\bfirebase\s+deploy\b", "production deploy is the owner's attended act"),
    (r"\b(vercel|netlify)\b[^|;&]*--prod\b", "production deploy is the owner's attended act"),
    (r"\bgh\s+repo\s+(delete|archive|create|rename)\b", "GitHub repo lifecycle (the owner decides)"),
    (r"\bgh\s+workflow\s+(enable|run)\b", "CI minutes are a shared budget"),
    (r"(?i)\bschtasks(\.exe)?\s+/+(create|delete|change)\b", "scheduled-task registration"),
    (r"(?i)\b(Register|Unregister)-ScheduledTask\b", "scheduled-task registration"),
]
IRREVERSIBLE = [(re.compile(p), why) for p, why in IRREVERSIBLE]

# Files a walkaway session may never write (user-scope settings are the owner's to change).
PROTECTED_WRITES = re.compile(r"(?i)[\\/]\.claude[\\/]settings(\.local)?\.json$")
USER_SCOPE = re.compile(r"(?i)users[\\/]+[^\\/]+[\\/]+\.claude[\\/]settings")

# Connector writes: EVERY connector is read-only in a walkaway session.
# Local tool servers that are not connectors are exempt by name (machine-local list).
LOCAL_MCP = tuple("mcp__%s__" % n for n in LOCAL.get("local_mcp", ["chrome-devtools"]))
CONNECTOR_WRITE = re.compile(
    r"^mcp__.*__(create|update|delete|trash|publish|send|share|edit|upload|merge|move|copy|respond|resize|import|generate|comment|reply)")

# Where `main` deploys, a push or PR merge to main/master IS a deploy. Repos whose job is to be
# pushed on main (coordination / docs repos) are exempted per machine.
PUSH_MAIN_OK = tuple(str(x).lower() for x in LOCAL.get("push_main_ok", []))
PUSH = re.compile(r"\bgit\s+(?:-C\s+(\S+)\s+)?push\b([^|;&]*)")
PR_MERGE = re.compile(r"\bgh\s+pr\s+merge\b")
CD = re.compile(r"\bcd\s+(?:/d\s+)?[\"']?([^\"'&;|]+?)[\"']?\s*(?:&&|;)")


def project_dir(payload):
    return os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd()


def armed(project):
    """env, or a marker file that has not expired. First line `until=YYYY-MM-DDTHH:MM` (local time)
    disarms the marker by itself, so a forgotten marker cannot trap an attended session tomorrow."""
    if os.environ.get("CLAUDE_WALKAWAY", "").strip() in ("1", "true", "TRUE"):
        return True
    for path in (os.path.join(project, ".claude", "WALKAWAY"), os.path.join(project, ".walkaway", "ON")):
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                first = f.readline().strip()
        except OSError:
            continue
        if first.lower().startswith("until="):
            try:
                if time.time() > time.mktime(time.strptime(first[6:22].strip(), "%Y-%m-%dT%H:%M")):
                    continue
            except ValueError:
                pass  # unreadable expiry -> armed
        return True
    return False


PATH_FIELDS = ("file_path", "notebook_path", "path", "command", "url")


def path_text(tool_input):
    """Only the fields that name a target — never file CONTENT (a doc may quote an off-limits path)."""
    if not isinstance(tool_input, dict):
        return ""
    return " ".join(str(tool_input.get(k) or "") for k in PATH_FIELDS)


def deploys_by_push(cmd, cwd):
    """True when cmd pushes/merges to main|master of a repo that is not in PUSH_MAIN_OK."""
    m = PUSH.search(cmd)
    if not m and not PR_MERGE.search(cmd):
        return False
    cd = CD.search(cmd)
    where = (m.group(1) if m and m.group(1) else None) or (cd.group(1) if cd else None) or cwd or ""
    if any(ok in where.replace("\\", "/").lower() for ok in PUSH_MAIN_OK):
        return False
    if not m:
        return True  # gh pr merge outside the exempt repos: merging is the owner's attended act
    words = [w for w in m.group(2).split() if not w.startswith("-")]
    refs = [r for w in words[1:] for r in w.split(":")]  # words[0] is the remote
    if any(r in ("main", "master") for r in refs):
        return True
    if refs and "HEAD" not in refs:
        return False  # an explicit refspec that is not main/master
    try:  # bare `git push`: ask git which branch this is (one cheap call, 5 s ceiling)
        import subprocess
        out = subprocess.run(["git", "-C", where or ".", "rev-parse", "--abbrev-ref", "HEAD"],
                             capture_output=True, text=True, timeout=5).stdout.strip()
        return out in ("main", "master")
    except Exception:
        return True  # cannot tell -> deny; a deny is never a wait


def classify(tool, tool_input, cwd=""):
    """Return (decision, reason). decision is 'allow' or 'deny'."""
    if tool in HUMAN_TOOLS:
        return "deny", ("walkaway: nobody is here to answer. Decide it yourself, write the decision "
                        "down in your notes for the owner, and continue.")
    if crosses_boundary(tool_input, cwd):
        return "deny", ("walkaway: that path is another profile's territory and this session is not rooted "
                        "there. No cross-contamination. Do not retry; route around it.")
    if tool and not tool.startswith(LOCAL_MCP) and CONNECTOR_WRITE.match(tool):
        return "deny", "walkaway: connector writes are read-only in an unattended session. Write it down for the owner and continue."
    if tool in ("Bash", "PowerShell"):
        cmd = (tool_input or {}).get("command", "") if isinstance(tool_input, dict) else ""
        for rx, why in IRREVERSIBLE:
            if rx.search(cmd):
                return "deny", ("walkaway: irreversible class — %s. Do not retry a near-identical shape; "
                                "write the ready patch or command down for the owner and continue." % why)
        if deploys_by_push(cmd, cwd):
            return "deny", ("walkaway: a push or PR merge to main/master of a code repo is a production deploy — "
                            "the owner's attended act. Push your feature branch and leave the merge for the owner.")
    if tool in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
        path = ""
        if isinstance(tool_input, dict):
            path = str(tool_input.get("file_path") or tool_input.get("notebook_path") or "")
        if PROTECTED_WRITES.search(path) and USER_SCOPE.search(path):
            return "deny", "walkaway: user-scope settings.json is the owner's change to make. Write a patch file instead."
    return "allow", "walkaway: outside the irreversible class"


def emit(event, decision, reason):
    if event == "PermissionRequest":
        d = {"behavior": decision}
        if decision == "deny":
            d["message"] = reason
        out = {"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision": d}}
    else:
        out = {"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                      "permissionDecision": decision,
                                      "permissionDecisionReason": reason}}
    sys.stdout.write(json.dumps(out))


def log(project, rec):
    path = os.environ.get("WALKAWAY_LOG") or os.path.join(project, "requests.jsonl")
    try:
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec) + "\n")
    except OSError:
        pass


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}
    project = project_dir(payload)
    if not armed(project):
        sys.exit(0)  # interactive session: say nothing, the normal permission flow applies
    event = payload.get("hook_event_name") or "PreToolUse"
    tool = payload.get("tool_name")
    try:
        decision, reason = classify(tool, payload.get("tool_input"), payload.get("cwd") or project)
    except Exception as e:  # never a dialog, never an unclassified allow
        decision, reason = "deny", "walkaway hook error (%s); treated as deny. Continue with another tool." % type(e).__name__
    # Line shape follows the office hook's allowlisted field names, plus decision/reason.
    # `tool_input` is banned there as a privacy boundary (a path can be a client's name); it is
    # logged only when the canary asks for it with WALKAWAY_LOG_INPUT=1.
    rec = {"received_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "pid": os.getpid(),
           "source": "decider", "hook_event_name": event, "event": event,
           "session_id": payload.get("session_id"), "cwd": payload.get("cwd"),
           "permission_mode": payload.get("permission_mode"),
           "tool_name": tool, "tool": tool, "tool_use_id": payload.get("tool_use_id"),
           "agent_id": payload.get("agent_id"), "agent_type": payload.get("agent_type"),
           "decision": decision, "reason": reason}
    if os.environ.get("WALKAWAY_LOG_INPUT") == "1":
        rec["input"] = json.dumps(payload.get("tool_input"))[:600]
    log(project, rec)
    emit(event, decision, reason)
    sys.exit(0)


if __name__ == "__main__":
    main()
