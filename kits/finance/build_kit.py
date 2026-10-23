#!/usr/bin/env python3
"""Build the WilsonWorks Finance Kit zip.

The kit is one folder a person unzips and opens in the Claude desktop app. It is
assembled from two places:

  kits/finance/kit/            committed here: CLAUDE.md, Start-Here.html, the
                               kit copies of the eight agent files (edited for a
                               team of eight), sample-company/, outputs/
  <source>/                    the live Claude folder (default ~/.claude): the
                               agents' reference files, five skills copied whole,
                               and the comms board (comms.py + schema.sql)

Before zipping it scans every file and refuses to write the zip on any hit:
drive paths, /Hub/ paths, 'py -3', client codes C00-C10, any byte-identical copy
of a file from the Run-8 live-data folder, and settings files carrying hooks.

    python build_kit.py [--source DIR] [--out DIR] [--run8-dir DIR] [--copy-to DIR]

Stdlib only.
"""
from __future__ import annotations

import argparse
import hashlib
import re
import shutil
import sys
import zipfile
from pathlib import Path

KIT_NAME = "WilsonWorks-Finance-Kit"
HERE = Path(__file__).resolve().parent
OVERLAY = HERE / "kit"

AGENTS = [
    "cfo-eleanor", "cfo-ea-sophia", "head-controller-hal", "head-treasurer-imani",
    "head-tax-anya", "head-fpa-nadia", "senior-accountant-lila", "senior-accountant-theo",
]
SKILLS = ["close-month", "cash-flow-snapshot", "month-end-prep", "invoice-chase", "plan-payroll"]

REFERENCE_NOTE = (
    "> **In this kit:** this reference was written for a larger firm. The team here is the eight people listed in\n"
    "> `CLAUDE.md` at the kit root. Anyone else it names (other seniors, other branches, a dev team), any channel\n"
    "> they use, and any research path not in this folder is not here: do their part of the work yourself. Where it\n"
    "> says the CEO, read: the person you are helping.\n\n"
)

# comms.py: the board's database lives inside the kit folder, wherever the kit is unzipped
# (not at the nearest git repo, which on a person's computer may be anything).
COMMS_PATCHES = [
    (
        "      2) <repo>/.claude/comms.db where <repo> is the nearest ancestor with .git\n"
        "      3) ./.claude/comms.db relative to cwd\n",
        "      2) <kit>/.claude/comms.db, beside the folder this script lives in\n",
    ),
    (
        "def find_repo_root(start: Path) -> Path | None:\n"
        "    cur = start.resolve()\n"
        "    for p in (cur, *cur.parents):\n"
        "        if (p / \".git\").exists():\n"
        "            return p\n"
        "    return None\n\n\n",
        "",
    ),
    (
        "    repo = find_repo_root(Path.cwd())\n"
        "    base = repo if repo else Path.cwd()\n"
        "    return base / \".claude\" / \"comms.db\"\n",
        "    return Path(__file__).resolve().parent.parent / \"comms.db\"\n",
    ),
]

# Skills copied in from ~/.claude: this kit has no QuickBooks connection, so a skill may not tell the
# person to connect one.
SKILL_PATCHES = [
    (
        "month-end-prep/SKILL.md",
        "Connect QuickBooks and at least one payment processor (PayPal, Square, or Stripe),\n",
        "Export your QuickBooks reports and at least one payment processor's settlements (PayPal, Square, or Stripe) as CSV,\n",
    ),
    (
        "cash-flow-snapshot/SKILL.md",
        "ask the user to either connect\n"
        "a source or upload a CSV (income/expense tabular data, any reasonable format).\n",
        "ask the user to upload a CSV export\n"
        "(income/expense tabular data, any reasonable format). Never ask them to connect a client's QuickBooks.\n",
    ),
]

LEAK_PATTERNS = [
    ("drive path", re.compile(r"(?<![A-Za-z])[A-Za-z]:[\\/]")),
    ("Hub path", re.compile(r"[\\/]Hub[\\/]", re.IGNORECASE)),
    ("'py -3'", re.compile(r"\bpy -3\b")),
    ("client code", re.compile(r"\bC(?:0\d|10)\b")),
    ("Run-8 reference", re.compile(r"_?Run8(?:-LiveData)?", re.IGNORECASE)),
]
SKIP_PARTS = {"__pycache__"}


def die(msg: str) -> None:
    print(f"REFUSED: {msg}", file=sys.stderr)
    sys.exit(1)


def find_run8() -> Path | None:
    for root in ("D:/Hub", "C:/Hub"):
        if Path(root + "/CLAUDE.md").exists():
            cand = Path(root + "/10-Business/CBFC-Tax/_Run8-LiveData")
            return cand if cand.is_dir() else None
    return None


def assemble(source: Path, stage: Path) -> None:
    if stage.exists():
        shutil.rmtree(stage)
    shutil.copytree(OVERLAY, stage)
    agents_dir = stage / ".claude" / "agents"
    refs_dir = agents_dir / "references"
    (refs_dir / "_shared").mkdir(parents=True, exist_ok=True)

    for name in AGENTS:
        kit_copy = agents_dir / f"{name}.md"
        if not (source / "agents" / f"{name}.md").exists():
            die(f"source agent missing: agents/{name}.md")
        if f"name: {name}\n" not in kit_copy.read_text(encoding="utf-8"):
            die(f"kit copy of {name} is missing or has the wrong name")
        ref = (source / "agents" / "references" / f"{name}.md").read_text(encoding="utf-8")
        (refs_dir / f"{name}.md").write_text(REFERENCE_NOTE + ref, encoding="utf-8", newline="\n")
    shutil.copy2(source / "agents" / "references" / "_shared" / "executor-playbook.md",
                 refs_dir / "_shared" / "executor-playbook.md")

    for skill in SKILLS:
        shutil.copytree(source / "skills" / skill, stage / ".claude" / "skills" / skill,
                        ignore=shutil.ignore_patterns("__pycache__"))
    for rel, old, new in SKILL_PATCHES:
        path = stage / ".claude" / "skills" / rel
        text = path.read_text(encoding="utf-8")
        if text.count(old) != 1:
            die(f"skills/{rel} changed upstream; the QuickBooks wording patch no longer applies")
        path.write_text(text.replace(old, new), encoding="utf-8", newline="\n")

    comms_dir = stage / ".claude" / "comms"
    comms_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source / "comms" / "schema.sql", comms_dir / "schema.sql")
    text = (source / "comms" / "comms.py").read_text(encoding="utf-8")
    for old, new in COMMS_PATCHES:
        if text.count(old) != 1:
            die("comms.py changed upstream; the portability patch no longer applies")
        text = text.replace(old, new)
    (comms_dir / "comms.py").write_text(text, encoding="utf-8", newline="\n")


def kit_files(stage: Path) -> list[Path]:
    return sorted(p for p in stage.rglob("*") if p.is_file() and not SKIP_PARTS & set(p.parts))


def leak_scan(stage: Path, run8: Path | None) -> list[str]:
    hits: list[str] = []
    files = kit_files(stage)
    for p in files:
        rel = p.relative_to(stage).as_posix()
        text = p.read_bytes().decode("utf-8", errors="replace")
        if re.fullmatch(r"settings(\..*)?\.json", p.name):
            hits.append(f"{rel}: settings file in the kit" + (" (contains 'hooks')" if "hooks" in text else ""))
        for label, pat in LEAK_PATTERNS:
            for m in pat.finditer(text):
                line = text.count("\n", 0, m.start()) + 1
                hits.append(f"{rel}:{line}: {label} {m.group(0)!r}")
    if run8 is None:
        print("note: Run-8 live-data folder not found on this machine; byte-copy check skipped")
        return hits
    kit_hashes = {hashlib.sha256(p.read_bytes()).hexdigest(): p for p in files}
    checked = 0
    for p in run8.rglob("*"):
        if p.is_file():
            checked += 1
            h = hashlib.sha256(p.read_bytes()).hexdigest()
            if h in kit_hashes:
                hits.append(f"{kit_hashes[h].relative_to(stage).as_posix()}: identical to a Run-8 live-data file")
    print(f"Run-8 byte-copy check: {checked} live-data files compared against {len(files)} kit files")
    return hits


def write_zip(stage: Path, zip_path: Path) -> int:
    if zip_path.exists():
        zip_path.unlink()
    files = kit_files(stage)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for p in files:
            z.write(p, f"{KIT_NAME}/{p.relative_to(stage).as_posix()}")
    return len(files)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--source", type=Path, default=Path.home() / ".claude")
    ap.add_argument("--out", type=Path, default=HERE / "dist")
    ap.add_argument("--run8-dir", type=Path, default=None)
    ap.add_argument("--copy-to", type=Path, default=None, help="also copy the finished zip here")
    args = ap.parse_args()

    stage = args.out / KIT_NAME
    args.out.mkdir(parents=True, exist_ok=True)
    assemble(args.source, stage)
    hits = leak_scan(stage, args.run8_dir or find_run8())
    if hits:
        for h in hits:
            print("  " + h, file=sys.stderr)
        die(f"{len(hits)} leak-scan hit(s); no zip written")
    print("leak scan: 0 hits")
    zip_path = args.out / f"{KIT_NAME}.zip"
    n = write_zip(stage, zip_path)
    print(f"wrote {zip_path} ({n} files, {zip_path.stat().st_size} bytes)")
    if args.copy_to:
        args.copy_to.mkdir(parents=True, exist_ok=True)
        shutil.copy2(zip_path, args.copy_to / zip_path.name)
        print(f"copied to {args.copy_to / zip_path.name}")


if __name__ == "__main__":
    main()
