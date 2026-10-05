"""Walkaway Stop guard — a walkaway turn may not end with nothing left to wake it.

Companion to an event-driven wake watcher (which re-wakes a lane on comms
changes). This one closes the other half: the turn that ends with no next event at all — a lane
that "agreed to never idle" and stalled anyway, because a rule in a prompt protects nobody once
the turn has ended.

Register as a `Stop` hook. Armed only when a walkaway marker exists; interactive sessions pass:
    env CLAUDE_WALKAWAY=1   |   <project>/.claude/WALKAWAY   |   <project>/.walkaway/ON

A stop is allowed when any one holds:
    1. exit marker      <project>/.walkaway/EXIT or <project>/.claude/WALKAWAY-EXIT exists
                        (the session states, in one line, that its exit condition is met)
    2. next event       the turn that is ending armed something that will re-invoke the session:
                        a ScheduleWakeup / CronCreate call, or a tool call with run_in_background
                        (read from the transcript — the Stop payload does not expose it)
Otherwise the stop is BLOCKED (exit 2, reason on stderr) and the session continues.

Loop safety: at most MAX_BLOCKS consecutive blocks per session (the harness's own cap is 8). On the
cap the guard releases, writes <project>/.walkaway/STALL-ALARM and logs `release-cap` — a guard
that can wedge a session is worse than the stall. The alarm file is what a watcher / the office
reads. Every invocation appends one line to <project>/stop-guard.jsonl.
"""
import json
import os
import sys
import time

MAX_BLOCKS = 3
NEXT_EVENT_TOOLS = {"ScheduleWakeup", "CronCreate"}
BACKGROUND_TOOLS = {"Bash", "PowerShell", "Agent", "Task", "Workflow", "Monitor"}

# Wording is load-bearing: in the first drill a blocked session obeyed "take the next row" so
# literally that it found an unrelated checklist file in its folder and ran it.
# So: the clean end comes first, and "more work" is bounded to the queue the launch prompt named.
REASON = (
    "WALKAWAY STOP GUARD: this turn is ending with nothing left to wake the session — that is a "
    "stall, not a stop. Do ONE of these now: (1) if the exit condition written in your launch prompt "
    "is met, or your queue is empty, create the file .walkaway/EXIT containing one line that says "
    "which, then stop; (2) if you are waiting on something, leave a command running in the "
    "background or schedule a wakeup of 10 minutes or less; (3) otherwise take the next row of the "
    "queue file your launch prompt named, and keep working. Never pick up work from any file your "
    "launch prompt did not name — if you cannot name your queue file, use (1)."
)


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


def exit_marker(project):
    return (os.path.exists(os.path.join(project, ".walkaway", "EXIT"))
            or os.path.exists(os.path.join(project, ".claude", "WALKAWAY-EXIT")))


def next_event_in_last_turn(transcript_path):
    """Name of the tool call that armed a next event in the turn now ending, or None.

    The turn = every assistant entry after the last real user prompt (tool results are also
    `user` entries; they are skipped). Unreadable transcript -> None (guard blocks; the cap
    and the exit marker keep that safe).
    """
    if not transcript_path:
        return None
    try:
        with open(transcript_path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()  # the whole file: a long turn must not scroll its wakeup out of view
    except OSError:
        return None
    found = None
    for line in lines:
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        msg = entry.get("message") or {}
        content = msg.get("content")
        if entry.get("type") == "user":
            is_tool_result = isinstance(content, list) and any(
                isinstance(c, dict) and c.get("type") == "tool_result" for c in content)
            if not is_tool_result:
                found = None  # a new turn starts here
            continue
        if entry.get("type") != "assistant" or not isinstance(content, list):
            continue
        for c in content:
            if not (isinstance(c, dict) and c.get("type") == "tool_use"):
                continue
            name, inp = c.get("name"), c.get("input") or {}
            if name in NEXT_EVENT_TOOLS and not inp.get("stop"):
                found = name
            elif name in BACKGROUND_TOOLS and inp.get("run_in_background") is True:
                found = "%s(run_in_background)" % name  # only an explicit True counts
    return found


def counter_path(project, session_id):
    d = os.path.join(project, ".walkaway")
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, "blocks-%s.count" % (session_id or "unknown")[:64])


def read_count(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return int(f.read().strip() or 0)
    except (OSError, ValueError):
        return 0


def write_count(path, n):
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(str(n))
    except OSError:
        pass


def log(project, rec):
    try:
        with open(os.path.join(project, "stop-guard.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(rec) + "\n")
    except OSError:
        pass


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}
    project = project_dir(payload)
    sid = str(payload.get("session_id") or "unknown")
    rec = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "session_id": sid,
           "stop_hook_active": payload.get("stop_hook_active"),
           "marker": False, "exit_marker": False, "next_event": None, "verdict": None}

    if not armed(project):
        rec["verdict"] = "pass-no-marker"
        log(project, rec)
        sys.exit(0)
    rec["marker"] = True
    cpath = counter_path(project, sid)

    if exit_marker(project):
        rec.update(exit_marker=True, verdict="pass-exit-marker")
        write_count(cpath, 0)
        log(project, rec)
        sys.exit(0)

    nxt = next_event_in_last_turn(payload.get("transcript_path"))
    if nxt:
        rec.update(next_event=nxt, verdict="pass-next-event")
        write_count(cpath, 0)
        log(project, rec)
        sys.exit(0)

    n = read_count(cpath)
    if n >= MAX_BLOCKS:
        rec.update(verdict="release-cap", blocks=n)
        try:
            with open(os.path.join(project, ".walkaway", "STALL-ALARM"), "a", encoding="utf-8") as f:
                f.write("%s session %s ended a turn with no next event after %d blocks\n" % (rec["ts"], sid, n))
        except OSError:
            pass
        write_count(cpath, 0)
        log(project, rec)
        sys.exit(0)

    write_count(cpath, n + 1)
    rec.update(verdict="block", blocks=n + 1)
    log(project, rec)
    try:  # loud from the FIRST block: a session that is blocked once and wanders off must be visible
        with open(os.path.join(project, ".walkaway", "STALL-ALARM"), "a", encoding="utf-8") as f:
            f.write("%s session %s tried to end a turn with no next event (block %d of %d)\n"
                    % (rec["ts"], sid, n + 1, MAX_BLOCKS))
    except OSError:
        pass
    sys.stderr.write(REASON)
    sys.exit(2)


if __name__ == "__main__":
    main()
