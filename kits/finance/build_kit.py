#!/usr/bin/env python3
"""Build the WilsonWorks Finance Kit zip.

The kit is one folder a person unzips and opens in the Claude desktop app. It is
assembled from two places:

  kits/finance/kit/            committed here: CLAUDE.md, Start-Here.html, the
                               kit copies of the eight agent files (edited for a
                               team of eight), sample-company/, outputs/
  <source>/                    the live Claude folder (default ~/.claude): the
                               agents' reference files, seven skills copied whole,
                               and the comms board (comms.py + schema.sql)
  <hub>/                       the firm's private reference material, read at build
                               time and never committed here (LIBRARY_PARTS): it
                               lands under .claude/library/, with library-INDEX.md
                               from this folder as its INDEX.md

Before zipping it scans every file and refuses to write the zip on any hit:
drive paths, /Hub/ paths, 'py -3', client codes C00-C10, any byte-identical copy
of a file from the Run-8 live-data folder, settings files carrying hooks, and
any client name in --names-file (a list kept outside the repo; whole words,
case-insensitive; no list, no build). It also refuses to start if git tracks any
library content under kits/finance.

    python build_kit.py --names-file FILE [--source DIR] [--hub DIR] [--out DIR]
                        [--run8-dir DIR] [--copy-to DIR]

Stdlib only.
"""
from __future__ import annotations

import argparse
import hashlib
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

KIT_NAME = "WilsonWorks-Finance-Kit"
HERE = Path(__file__).resolve().parent
OVERLAY = HERE / "kit"
LIBRARY_INDEX = HERE / "library-INDEX.md"

AGENTS = [
    "cfo-eleanor", "cfo-ea-sophia", "head-controller-hal", "head-treasurer-imani",
    "head-tax-anya", "head-fpa-nadia", "senior-accountant-lila", "senior-accountant-theo",
]
SKILLS = ["close-month", "cash-flow-snapshot", "month-end-prep", "invoice-chase", "plan-payroll",
          "tax-season-organizer", "tax-prep"]

REFERENCE_NOTE = (
    "> **In this kit:** this reference was written for a larger firm. The team here is the eight people listed in\n"
    "> `CLAUDE.md` at the kit root. Anyone else it names (other seniors, other branches, a dev team), any channel\n"
    "> they use, and any research path not in this folder is not here: do their part of the work yourself. Where it\n"
    "> says the CEO, read: the person you are helping.\n\n"
)

# Agent references: four phrases name the owner's company, which is also on the firm's client roster, so the
# client-name check catches them. The kit names no business. The patterns match around the name (no name is
# written here); each must match exactly once or the build refuses.
REFERENCE_PATCHES = [
    ("cfo-eleanor", re.compile(r"You should see: the \S+ dashboard\."), "You should see: the company dashboard."),
    ("head-fpa-nadia", re.compile(r"This branch \(\S+ CFO / FP&A\)"), "This branch (CFO / FP&A)"),
    ("head-treasurer-imani", re.compile(r"\S+ inventory profile not documented"),
     "the business's inventory profile not documented"),
    ("head-treasurer-imani", re.compile(r"No documented \S+ close calendar"), "No documented close calendar"),
]

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
    (
        "tax-prep/SKILL.md",
        "1. Pull YTD Profit & Loss from QuickBooks (Jan 1 through last completed quarter).\n"
        "2. If QuickBooks is not connected, ask the user to paste net income or upload a CSV.\n",
        "1. Ask the user to export a YTD Profit & Loss from QuickBooks as CSV (Jan 1 through last completed quarter).\n"
        "2. Read the uploaded CSV. If they cannot export one, ask them to paste net income.\n",
    ),
    (
        "tax-prep/SKILL.md",
        "1. Pull contractor/vendor payments from all connected sources: QuickBooks, PayPal, Stripe.\n",
        "1. Ask the user to export contractor/vendor payments as CSV: QuickBooks (Transaction List by Vendor), PayPal, Stripe.\n",
    ),
    (
        "tax-prep/SKILL.md",
        "4. Check W-9 status in QuickBooks for each flagged payee.\n",
        "4. Check W-9 status for each flagged payee in the QuickBooks vendor list CSV export, or ask the user.\n",
    ),
    (
        "tax-season-organizer/SKILL.md",
        "  calculation — pulls YTD net income from QuickBooks and calculates the federal\n",
        "  calculation — reads YTD net income from a QuickBooks CSV export and calculates the federal\n",
    ),
    (
        "tax-season-organizer/SKILL.md",
        "  year-end 1099 prep — scans QuickBooks, PayPal, and Stripe for contractors paid\n",
        "  year-end 1099 prep — scans QuickBooks, PayPal, and Stripe CSV exports for contractors paid\n",
    ),
    (
        "tax-season-organizer/SKILL.md",
        "→ Pull YTD P&L from QuickBooks\n",
        "→ Read the YTD P&L CSV the user exported from QuickBooks\n",
    ),
    (
        "tax-season-organizer/SKILL.md",
        "→ Pull all contractor/vendor payments from QuickBooks + PayPal + Stripe\n",
        "→ Read the contractor/vendor payment CSVs exported from QuickBooks + PayPal + Stripe\n",
    ),
    (
        "tax-season-organizer/SKILL.md",
        "Use QuickBooks to pull a Profit & Loss report from January 1",
        "Ask the user to export a Profit & Loss report from QuickBooks as CSV (Reports → Profit & Loss → Export), from January 1",
    ),
    (
        "tax-season-organizer/SKILL.md",
        "If QuickBooks is not connected, ask the user to upload a P&L as CSV or paste the key numbers.",
        "If they cannot export it, ask them to paste the key numbers.",
    ),
    (
        "tax-season-organizer/SKILL.md",
        "Query each connected source for **all payments made",
        "From each export, take **all payments made",
    ),
    (
        "tax-season-organizer/SKILL.md",
        "**QuickBooks — try live connector first, fall back to CSV if needed:**\n\n"
        "1. **Try live connector.** Attempt to pull vendor-level payment records via the QuickBooks MCP. If the connector "
        "returns individual payee records with name, amount, and account category, use them directly and skip the CSV step.\n\n"
        "2. **Detect aggregate-only response.** If the MCP returns only category-level totals (e.g. \"Contract labor: $7,500\" "
        "with no payee breakdown), the connector does not yet support vendor-level queries. In this case, prompt the user:\n\n"
        "   > \"QuickBooks returned summary data only — I need payee-level detail to build your 1099 list. Please export a "
        "**Transaction List by Vendor** report (QuickBooks → Reports → Expenses → Transaction List by Vendor, filtered to "
        "this tax year) and upload the CSV here. I'll process it automatically.\"\n\n"
        "3. **Process CSV via Desktop connector.** Map columns: payee name, amount, date, payment method, EIN/SSN status. "
        "Follow the same aggregation and threshold logic below regardless of whether data came from the live connector or CSV.\n\n"
        "> **Note for future connector versions:** If the QuickBooks MCP is upgraded to expose vendor payment records "
        "directly, step 1 will succeed and the CSV fallback will be skipped automatically. No changes to this skill are "
        "needed — the try-first logic handles it.\n",
        "**QuickBooks — CSV export:**\n\n"
        "1. Ask the user to export a **Transaction List by Vendor** report (QuickBooks → Reports → Expenses → Transaction "
        "List by Vendor, filtered to this tax year) and upload the CSV. This kit has no QuickBooks connection; never ask "
        "them to connect one.\n\n"
        "2. Map columns: payee name, amount, date, payment method, EIN/SSN status, then follow the aggregation and "
        "threshold logic below.\n",
    ),
    (
        "tax-season-organizer/SKILL.md",
        "note whether a W-9 / EIN is on file in QuickBooks. Mark as:\n",
        "note whether a W-9 / EIN is on file, from the QuickBooks vendor list CSV export or by asking the user. Mark as:\n",
    ),
    (
        "tax-season-organizer/reference/connector-queries.md",
        "Pull a **Profit & Loss** report for the period",
        "Ask the user to export a **Profit & Loss** report as CSV (Reports → Profit & Loss → Export) for the period",
    ),
    (
        "tax-season-organizer/reference/connector-queries.md",
        "Pull all **bill payments and checks** to vendors for the full tax year (Jan 1 – Dec 31).\n",
        "Ask the user to export a **Transaction List by Vendor** report as CSV covering all **bill payments and checks** to\n"
        "vendors for the full tax year (Jan 1 – Dec 31). This kit has no QuickBooks connection.\n",
    ),
    (
        "tax-season-organizer/reference/connector-queries.md",
        "If any connector is unavailable, ask the user to:\n",
        "This kit works from CSV exports. Ask the user to:\n",
    ),
    (
        "tax-season-organizer/reference/examples/quarterly-estimate.md",
        "## Step 1: Pull YTD P&L from QuickBooks\n",
        "## Step 1: Read the YTD P&L CSV exported from QuickBooks\n",
    ),
]

# The firm's reference library: (part in .claude/library/, source root under the Hub, what to take). Read at build
# time only; nothing here is committed. Each path is checked to exist, so a moved source refuses the build.
LIBRARY_PARTS = [
    # the-accountant-tony's reference tree: the howard base at its pinned sha, plus the overlay that drops drive paths
    ("firm-reference", "{code}/the-accountant-tony/reference", ["desk", "firm", "library", "tax"]),
    ("drake", "{code}/balnce-pro-app/docs/reference/drake-library", [
        "drake-screen-catalog-2025.csv",
        ("general/docs/DRAKE_DATA_ENTRY_CONVENTIONS.md", "DRAKE_DATA_ENTRY_CONVENTIONS.md"),
        ("general/schema/drake_mapping.schema.json", "drake_mapping.schema.json"),
        ("tax-year/2025", "tax-year-2025"),
    ]),
    ("irs", "{code}/balnce-pro-app/docs/reference/irs-library", [
        "irs-form-lines-2025.csv",
        ("general/schema/irs_form_line.schema.json", "irs_form_line.schema.json"),
    ]),
    ("research", "50-AI/research", ["2026-10-22-*"]),
]
LIBRARY_SKIP_SUFFIXES = {".py"}           # tooling, not reference
LIBRARY_SKIP_NAMES = {"meta.json"}        # a research run's machine metadata
# Source files left out of the zip because they hit a check below (file names only, never what they hit on).
LIBRARY_LEFT_OUT: dict[str, str] = {
    "research/2026-10-22-a2-writing-corrections-back-to-quickbooks-online-with-journa/00-brief.md":
        "drive or Hub path",
    "research/2026-10-22-a2-writing-corrections-back-to-quickbooks-online-with-journa/01-overview.md":
        "drive or Hub path",
    "research/2026-10-22-a2-writing-corrections-back-to-quickbooks-online-with-journa/02-je-import-spec.md":
        "drive or Hub path",
    "research/2026-10-22-a2-writing-corrections-back-to-quickbooks-online-with-journa/sources.md":
        "drive or Hub path",
    "research/2026-10-22-a3-drake-tax-trial-balance-import-for-tax-year-2026/02-import-layout-and-mapping.md":
        "drive or Hub path",
    "research/2026-10-22-a3-drake-tax-trial-balance-import-for-tax-year-2026/04-fit-to-exporter-and-gaps.md":
        "client code",
    "research/2026-10-22-a3-drake-tax-trial-balance-import-for-tax-year-2026/sources.md":
        "drive or Hub path",
    "research/2026-10-22-a4-running-claude-over-a-150-client-bookkeeping-batch-usage/00-brief.md":
        "client code, drive or Hub path",
    "research/2026-10-22-a4-running-claude-over-a-150-client-bookkeeping-batch-usage/sources.md":
        "drive or Hub path",
    "research/2026-10-22-b2-trust-and-tie-out-what-a-reviewing-cpa-needs-before-relyi/00-brief.md":
        "client code",
    "research/2026-10-22-b2-trust-and-tie-out-what-a-reviewing-cpa-needs-before-relyi/06-reviewing-ai-coded-work.md":
        "client code",
    "research/2026-10-22-b3-book-to-tax-differences-and-post-return-adjusting-entries/01-overview.md":
        "drive or Hub path",
    "research/2026-10-22-b3-book-to-tax-differences-and-post-return-adjusting-entries/sources.md":
        "drive or Hub path",
    "research/2026-10-22-b4-hosting-a-small-accounting-firm-s-internal-web-app-and-cl/sources.md":
        "drive or Hub path",
    "research/2026-10-22-c2-making-ai-bookkeeping-decisions-reproducible-and-auditabl/00-brief.md":
        "client code",
    "research/2026-10-22-c2-making-ai-bookkeeping-decisions-reproducible-and-auditabl/01-overview.md":
        "drive or Hub path",
    "research/2026-10-22-c2-making-ai-bookkeeping-decisions-reproducible-and-auditabl/04-structured-outputs.md":
        "client code",
    "research/2026-10-22-c2-making-ai-bookkeeping-decisions-reproducible-and-auditabl/sources.md":
        "drive or Hub path",
    "research/2026-10-22-k9-local-redaction-of-ssns-itins-eins-and-account-and-routin/04-verification-throughput.md":
        "client code",
    "research/2026-10-22-k9-local-redaction-of-ssns-itins-eins-and-account-and-routin/sources.md":
        "drive or Hub path",
    "research/2026-10-22-nl1-k9-follow-up-recall-on-numeric-identifiers-true-text-rem/00-brief.md":
        "drive or Hub path",
    "research/2026-10-22-nl1-k9-follow-up-recall-on-numeric-identifiers-true-text-rem/sources.md":
        "drive or Hub path",
    "research/2026-10-22-nl12-rentals-inside-an-s-corporation-form-8825-lines-per-pro/sources.md":
        "drive or Hub path",
    "research/2026-10-22-nl2-drake-tb-import-for-an-1120-s-or-1120-how-depreciation-i/00-brief.md":
        "drive or Hub path",
    "research/2026-10-22-nl2-drake-tb-import-for-an-1120-s-or-1120-how-depreciation-i/sources.md":
        "drive or Hub path",
    "research/2026-10-22-nl6-the-2-s-corp-shareholder-s-2026-w-2-health-insurance-hsa/01-overview.md":
        "drive or Hub path",
}

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


def find_hub() -> Path | None:
    for root in ("D:/Hub", "C:/Hub"):
        if Path(root + "/CLAUDE.md").exists():
            return Path(root)
    return None


def code_zone(hub: Path) -> Path:
    for name in ("Projects", "Active"):
        if (hub / "20-Coding" / name).is_dir():
            return hub / "20-Coding" / name
    die(f"no code zone (20-Coding/Projects or 20-Coding/Active) under {hub}")


def library_files(hub: Path) -> list[tuple[Path, str]]:
    """(source file, path under .claude/library/) for every library file, LIBRARY_LEFT_OUT removed."""
    code = code_zone(hub)
    out: list[tuple[Path, str]] = []
    for part, root, entries in LIBRARY_PARTS:
        base = hub / root.format(code=code.relative_to(hub).as_posix())
        for entry in entries:
            src_rel, dest_rel = entry if isinstance(entry, tuple) else (entry, entry)
            matches = sorted(base.glob(src_rel))
            if not matches:
                die(f"library source missing: {part}: {src_rel}")
            for m in matches:
                dest = m.name if "*" in src_rel else dest_rel
                files = [m] if m.is_file() else sorted(p for p in m.rglob("*") if p.is_file())
                for f in files:
                    if f.suffix in LIBRARY_SKIP_SUFFIXES or f.name in LIBRARY_SKIP_NAMES or SKIP_PARTS & set(f.parts):
                        continue
                    rel = dest if f == m else f"{dest}/{f.relative_to(m).as_posix()}"
                    out.append((f, f"{part}/{rel}"))
    unknown = set(LIBRARY_LEFT_OUT) - {rel for _, rel in out}
    if unknown:
        die(f"LIBRARY_LEFT_OUT names files the sources no longer have: {sorted(unknown)}")
    return [(f, rel) for f, rel in out if rel not in LIBRARY_LEFT_OUT]


def public_repo_guard() -> None:
    """Refuse if git tracks any library content under kits/finance: the repo is public."""
    try:
        res = subprocess.run(["git", "ls-files", "--", "."], cwd=HERE, capture_output=True, text=True, check=True)
    except (OSError, subprocess.CalledProcessError) as e:
        die(f"public-repo guard could not run git ls-files: {e}")
    bad = []
    for path in res.stdout.splitlines():
        parts = path.split("/")
        if "library" in parts[:-1] or (path.endswith((".json", ".csv")) and "sample-company" not in parts[:-1]):
            bad.append(path)
    if bad:
        die(f"git tracks library content under kits/finance (a public repo): {bad}")


def load_names(path: Path | None) -> list[re.Pattern[str]]:
    if path is None:
        die("--names-file is required: the client-name check never skips")
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as e:
        die(f"names file unreadable: {e.__class__.__name__}")
    names = [n.strip() for n in lines if n.strip() and not n.strip().startswith("#")]
    if not names:
        die("names file is empty: the client-name check never skips")
    return [re.compile(r"(?<!\w)" + re.escape(n) + r"(?!\w)", re.IGNORECASE) for n in names]


def find_run8() -> Path | None:
    for root in ("D:/Hub", "C:/Hub"):
        if Path(root + "/CLAUDE.md").exists():
            cand = Path(root + "/10-Business/CBFC-Tax/_Run8-LiveData")
            return cand if cand.is_dir() else None
    return None


def assemble(source: Path, hub: Path, stage: Path) -> None:
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
        for agent, pat, new in REFERENCE_PATCHES:
            if agent == name:
                ref, n = pat.subn(new, ref)
                if n != 1:
                    die(f"references/{name}.md changed upstream; the business-name patch no longer applies")
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

    library = stage / ".claude" / "library"
    for src, rel in library_files(hub):
        (library / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, library / rel)
    shutil.copy2(LIBRARY_INDEX, library / "INDEX.md")


def kit_files(stage: Path) -> list[Path]:
    return sorted(p for p in stage.rglob("*") if p.is_file() and not SKIP_PARTS & set(p.parts))


def leak_scan(stage: Path, run8: Path | None, names: list[re.Pattern[str]]) -> list[str]:
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
        for n, pat in enumerate(names, 1):
            m = pat.search(text)
            if m:  # the name itself is never printed
                line = text.count("\n", 0, m.start()) + 1
                hits.append(f"{rel}:{line}: client name (names-file entry {n})")
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
    ap.add_argument("--hub", type=Path, default=None, help="Hub root holding the library sources (default: probe D:, C:)")
    ap.add_argument("--names-file", type=Path, default=None, help="client names, one per line, kept outside the repo")
    ap.add_argument("--out", type=Path, default=HERE / "dist")
    ap.add_argument("--run8-dir", type=Path, default=None)
    ap.add_argument("--copy-to", type=Path, default=None, help="also copy the finished zip here")
    args = ap.parse_args()

    public_repo_guard()
    names = load_names(args.names_file)
    hub = args.hub or find_hub()
    if hub is None:
        die("Hub root not found (looked for D:/Hub/CLAUDE.md and C:/Hub/CLAUDE.md); pass --hub")
    stage = args.out / KIT_NAME
    args.out.mkdir(parents=True, exist_ok=True)
    assemble(args.source, hub, stage)
    hits = leak_scan(stage, args.run8_dir or find_run8(), names)
    if hits:
        for h in hits:
            print("  " + h, file=sys.stderr)
        die(f"{len(hits)} leak-scan hit(s); no zip written")
    print(f"leak scan: 0 hits ({len(names)} client names checked)")
    zip_path = args.out / f"{KIT_NAME}.zip"
    n = write_zip(stage, zip_path)
    print(f"wrote {zip_path} ({n} files, {zip_path.stat().st_size} bytes)")
    if args.copy_to:
        args.copy_to.mkdir(parents=True, exist_ok=True)
        shutil.copy2(zip_path, args.copy_to / zip_path.name)
        print(f"copied to {args.copy_to / zip_path.name}")


if __name__ == "__main__":
    main()
