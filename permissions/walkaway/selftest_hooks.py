"""Deterministic drill of both walkaway hooks with synthetic payloads. Exit 0 = all rows as expected.

Usage: python selftest_hooks.py > SELFTEST.txt
Proves each hook CAN refuse (deny / block rows) and CAN stay out of the way (unarmed rows).
"""
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PERM = os.path.join(HERE, "walkaway_permission_hook.py")
STOP = os.path.join(HERE, "walkaway_stop_guard.py")
fails = 0


CFG = os.path.join(tempfile.gettempdir(), "walkaway-selftest.local.json")
with open(CFG, "w", encoding="utf-8") as _f:
    json.dump({"off_limits": ["C:\\Users\\offlimits", "D:\\PRIVATE"],
               "push_main_ok": ["coord-repo", "docs-repo"],
               "local_mcp": ["chrome-devtools"],
               "extra_roots": ["D:\\Zone"]}, _f)


def run(script, payload, project, env_extra=None):
    env = dict(os.environ, CLAUDE_PROJECT_DIR=project, WALKAWAY_CONFIG=CFG)
    env.pop("CLAUDE_WALKAWAY", None)
    env.update(env_extra or {})
    p = subprocess.run([sys.executable, script], input=json.dumps(payload), text=True,
                       capture_output=True, env=env)
    return p.returncode, p.stdout, p.stderr


def check(label, got, want):
    global fails
    ok = got == want
    fails += 0 if ok else 1
    print("%s  %-62s got=%s want=%s" % ("ok  " if ok else "FAIL", label, got, want))


def perm_decision(project, event, tool, tool_input):
    rc, out, _ = run(PERM, {"hook_event_name": event, "tool_name": tool, "tool_input": tool_input,
                            "session_id": "selftest"}, project)
    if not out.strip():
        return "silent"
    hso = json.loads(out)["hookSpecificOutput"]
    return hso["permissionDecision"] if event == "PreToolUse" else hso["decision"]["behavior"]


def bash(cmd):
    return {"command": cmd}


with tempfile.TemporaryDirectory() as armed, tempfile.TemporaryDirectory() as plain:
    os.makedirs(os.path.join(armed, ".claude"))
    open(os.path.join(armed, ".claude", "WALKAWAY"), "w").close()

    print("## permission hook — unarmed project stays silent")
    check("unarmed: Bash rm -rf /", perm_decision(plain, "PreToolUse", "Bash", bash("rm -rf /")), "silent")
    check("unarmed: AskUserQuestion", perm_decision(plain, "PreToolUse", "AskUserQuestion", {}), "silent")

    print("## permission hook — armed: ordinary work is allowed (the incident shapes)")
    for cmd in ["curl -s -o out.txt https://example.com", 'curl -s -o /dev/null -w "%{http_code}" https://x',
                "grep -r canary fixtures/", "git merge side --no-edit", "git push origin feature/x",
                "git push", "git commit -m x", "powershell -NoProfile -Command Get-Date",
                "MSYS_NO_PATHCONV=1 schtasks /query /fo LIST", "rm out/sub/moved.txt", "rm -rf out/sub",
                "rm -rf node_modules", "rm -rf .github/tmp", "gh pr create --fill", "gh run list",
                "railway logs --service x", "git reset --hard HEAD~1"]:
        check("allow: " + cmd, perm_decision(armed, "PreToolUse", "Bash", bash(cmd)), "allow")
    check("allow: Write *.token", perm_decision(armed, "PreToolUse", "Write", {"file_path": "out/secret.token"}), "allow")
    check("allow: Write .claude/note.md", perm_decision(armed, "PreToolUse", "Write", {"file_path": "D:/x/.claude/note.md"}), "allow")
    check("allow: Write project settings", perm_decision(armed, "PreToolUse", "Write", {"file_path": "D:/x/repo/.claude/settings.json"}), "allow")
    check("allow: chrome-devtools MCP", perm_decision(armed, "PreToolUse", "mcp__chrome-devtools__list_pages", {}), "allow")
    check("allow: Drive read", perm_decision(armed, "PreToolUse", "mcp__claude_ai_Google_Drive__search_files", {"q": "x"}), "allow")
    check("allow: PermissionRequest ordinary", perm_decision(armed, "PermissionRequest", "Bash", bash("ls")), "allow")

    print("## permission hook — armed: the irreversible class is denied")
    for cmd in ["git push --force origin main", "git push -f", "git push origin --delete feature/x",
                "git push origin :feature/x", "git -C /d/work/x gc", "git gc --auto", "rm -rf .git",
                "rm -rf /", "rm -rf ~", "rm -fr /d/Zone", "rm -rf 'D:\\Zone'", "railway up",
                "/c/tools/railway.exe up --detach", "firebase deploy --only hosting", "vercel deploy --prod",
                "gh repo delete wilson-works/x --yes", "gh repo archive x", "gh workflow enable 354463516",
                "schtasks /create /tn x /tr y", "cat /c/Users/offlimits/notes.txt", "ls D:\\PRIVATE"]:
        check("deny: " + cmd, perm_decision(armed, "PreToolUse", "Bash", bash(cmd)), "deny")
    check("deny: PowerShell Remove-Item -Recurse D:\\", perm_decision(armed, "PreToolUse", "PowerShell", bash("Remove-Item -Recurse -Force D:\\")), "deny")
    check("deny: PowerShell Register-ScheduledTask", perm_decision(armed, "PreToolUse", "PowerShell", bash("Register-ScheduledTask -TaskName x")), "deny")
    check("deny: Read off-limits", perm_decision(armed, "PreToolUse", "Read", {"file_path": "C:\\Users\\offlimits\\x.txt"}), "deny")
    check("allow: Read a sibling whose name only starts the same", perm_decision(armed, "PreToolUse", "Read", {"file_path": "C:\\Users\\offlimits2\\x.txt"}), "allow")
    check("deny: Write user settings.json", perm_decision(armed, "PreToolUse", "Write", {"file_path": "C:\\Users\\someone\\.claude\\settings.json"}), "deny")
    check("deny: AskUserQuestion", perm_decision(armed, "PreToolUse", "AskUserQuestion", {}), "deny")
    check("deny: ExitPlanMode", perm_decision(armed, "PreToolUse", "ExitPlanMode", {}), "deny")
    check("deny: calendar delete_event", perm_decision(armed, "PreToolUse", "mcp__claude_ai_Google_Calendar__delete_event", {}), "deny")
    check("deny: Canva publish", perm_decision(armed, "PreToolUse", "mcp__claude_ai_Canva__publish-brand-template", {}), "deny")
    check("deny: PermissionRequest force push", perm_decision(armed, "PermissionRequest", "Bash", bash("git push --force")), "deny")
    check("armed via env only", perm_decision(plain, "PreToolUse", "AskUserQuestion", {}) if False else
          (lambda: (json.loads(run(PERM, {"hook_event_name": "PreToolUse", "tool_name": "AskUserQuestion"}, plain,
                                   {"CLAUDE_WALKAWAY": "1"})[1])["hookSpecificOutput"]["permissionDecision"]))(), "deny")

    print("## permission hook — John's review (review): false positive fixed, gaps closed")
    check("allow: Write whose CONTENT quotes an off-limits path", perm_decision(
        armed, "PreToolUse", "Write", {"file_path": "D:/x/CHARTER.md", "content": "never touch C:\\Users\\offlimits\\ or D:\\PRIVATE"}), "allow")
    check("allow: Grep whose pattern names the off-limits dir but path does not", perm_decision(
        armed, "PreToolUse", "Grep", {"pattern": "offlimits", "path": "D:/work/coord-repo"}), "allow")
    for cmd in ["git push origin +feature/x", "git clean -fdx", "gh api -X DELETE repos/o/r/git/refs/heads/x",
                "gh api --method PUT repos/o/r/x", "echo {} > C:\\Users\\someone\\.claude\\settings.json",
                "cd /d/work/product-app && git push origin main",
                "git -C /d/work/other-app push origin HEAD:master",
                "cd /d/work/product-app && gh pr merge 7 --squash"]:
        check("deny: " + cmd, perm_decision(armed, "PreToolUse", "Bash", bash(cmd)), "deny")
    for cmd in ["cd /d/work/coord-repo && git push origin main", "git -C /d/work/docs-repo push origin main",
                "cd /d/work/product-app && git push origin feature/x",
                "cd /d/work/product-app && git push -u origin run-84/lane-a",
                "gh api repos/o/r/pulls", "gh pr create --fill", "cat C:\\Users\\someone\\.claude\\settings.json"]:
        check("allow: " + cmd, perm_decision(armed, "PreToolUse", "Bash", bash(cmd)), "allow")
    check("deny: any connector write (not only claude_ai_)", perm_decision(armed, "PreToolUse", "mcp__notion__create_page", {}), "deny")
    check("allow: chrome-devtools upload_file is local", perm_decision(armed, "PreToolUse", "mcp__chrome-devtools__upload_file", {}), "allow")

    print("## ask rules must be a subset of what the hook denies (C4: an ask rule prompts even in bypass)")
    with open(os.path.join(HERE, "walkaway.user-fragment.json"), "r", encoding="utf-8") as f:
        frag = json.load(f)
    for rule in frag["permissions"]["ask"]:
        tool, body = rule.split("(", 1)
        sample = body.rsplit(")", 1)[0].replace("*", " --detach")
        check("ask rule %s -> hook denies `%s`" % (rule, sample), perm_decision(armed, "PreToolUse", tool, bash(sample)), "deny")

    print("## marker expiry")
    with tempfile.TemporaryDirectory() as expired:
        os.makedirs(os.path.join(expired, ".claude"))
        with open(os.path.join(expired, ".claude", "WALKAWAY"), "w") as f:
            f.write("until=2020-01-01T00:00\n")
        check("expired marker: permission hook silent", perm_decision(expired, "PreToolUse", "AskUserQuestion", {}), "silent")
        check("expired marker: stop passes", run(STOP, {"session_id": "e"}, expired)[0], 0)
        with open(os.path.join(expired, ".claude", "WALKAWAY"), "w") as f:
            f.write("until=2099-01-01T00:00\n")
        check("unexpired marker: armed", perm_decision(expired, "PreToolUse", "AskUserQuestion", {}), "deny")

    print("## off-limits means no CROSS-contamination: a session rooted inside the root works there")
    def rooted(cwd, tool, ti):
        out = run(PERM, {"hook_event_name": "PreToolUse", "tool_name": tool, "tool_input": ti, "cwd": cwd}, armed)[1]
        return json.loads(out)["hookSpecificOutput"]["permissionDecision"]
    check("rooted in the off-limits profile: read its own file", rooted("C:\\Users\\offlimits\\health-repo", "Read", {"file_path": "C:\\Users\\offlimits\\health-repo\\notes.md"}), "allow")
    check("rooted in the off-limits profile: bash there", rooted("C:\\Users\\offlimits\\health-repo", "Bash", bash("ls /c/Users/offlimits/health-repo")), "allow")
    check("rooted there, reaching into a DIFFERENT off-limits root", rooted("C:\\Users\\offlimits\\health-repo", "Read", {"file_path": "D:\\PRIVATE\\x.txt"}), "deny")
    check("rooted elsewhere, reaching in", rooted("D:\\work\\product-app", "Read", {"file_path": "C:\\Users\\offlimits\\health-repo\\notes.md"}), "deny")
    check("rooted in a look-alike sibling, reaching in", rooted("C:\\Users\\offlimits2\\repo", "Read", {"file_path": "C:\\Users\\offlimits\\x.txt"}), "deny")

    print("## no machine config at all: the generic classes still bind, nothing machine-specific does")
    nocfg = {"WALKAWAY_CONFIG": os.path.join(tempfile.gettempdir(), "does-not-exist.json")}
    def bare(tool, ti):
        out = run(PERM, {"hook_event_name": "PreToolUse", "tool_name": tool, "tool_input": ti}, armed, nocfg)[1]
        return json.loads(out)["hookSpecificOutput"]["permissionDecision"]
    check("no config: force push denied", bare("Bash", bash("git push --force")), "deny")
    check("no config: push to main denied everywhere", bare("Bash", bash("cd /d/work/coord-repo && git push origin main")), "deny")
    check("no config: former off-limits path is just a path", bare("Read", {"file_path": "C:\\Users\\offlimits\\x.txt"}), "allow")

    print("## stop guard")
    rc, _, _ = run(STOP, {"session_id": "s"}, plain)
    check("unarmed stop passes (exit 0)", rc, 0)
    codes = [run(STOP, {"session_id": "loop"}, armed)[0] for _ in range(5)]
    check("armed, no next event: 3 blocks then release, then blocks again", codes, [2, 2, 2, 0, 2])
    check("STALL-ALARM written on release", os.path.exists(os.path.join(armed, ".walkaway", "STALL-ALARM")), True)

    tpath = os.path.join(armed, "t.jsonl")
    def transcript(tool_name, tool_input):
        rows = [{"type": "user", "message": {"content": "go"}},
                {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": tool_name, "input": tool_input}]}},
                {"type": "user", "message": {"content": [{"type": "tool_result", "content": "ok"}]}},
                {"type": "assistant", "message": {"content": [{"type": "text", "text": "done"}]}}]
        with open(tpath, "w", encoding="utf-8") as f:
            f.write("\n".join(json.dumps(r) for r in rows) + "\n")
    transcript("ScheduleWakeup", {"delaySeconds": 300})
    check("wakeup scheduled this turn -> pass", run(STOP, {"session_id": "w", "transcript_path": tpath}, armed)[0], 0)
    transcript("Bash", {"command": "sleep 99", "run_in_background": True})
    check("background command this turn -> pass", run(STOP, {"session_id": "b", "transcript_path": tpath}, armed)[0], 0)
    transcript("Bash", {"command": "ls"})
    check("foreground command only -> block", run(STOP, {"session_id": "f", "transcript_path": tpath}, armed)[0], 2)
    transcript("ScheduleWakeup", {"stop": True})
    check("ScheduleWakeup stop:true is not a next event -> block", run(STOP, {"session_id": "x", "transcript_path": tpath}, armed)[0], 2)
    os.makedirs(os.path.join(armed, ".walkaway"), exist_ok=True)
    open(os.path.join(armed, ".walkaway", "EXIT"), "w").close()
    check("exit marker -> pass", run(STOP, {"session_id": "f", "transcript_path": tpath}, armed)[0], 0)

print("\nFAILURES: %d" % fails)
sys.exit(1 if fails else 0)
