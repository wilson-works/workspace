# Proof run, 2026-10-23 (HQ, Windows 11)

1. `python build_kit.py --copy-to <Hub>/10-Business/CBFC-Tax/FinanceKit`: `leak scan: 0 hits`, 46 files, and the
   Run-8 byte-copy check compared 4483 live-data files. With six planted leaks, the scan refused all 8 hits: drive
   path, `\Hub\`, `/Hub/`, `py -3`, client code, Run-8 reference, settings file with hooks, and a byte copy.
2. Unzipped into a fresh `D:\tmp\scratch\fk6fb8\proof\`. From the kit folder:
   `python .claude/comms/comms.py post finance-floor hal --to lila ...` printed `posted #1 on finance-floor` and `read`
   printed it back. The database was created at `<kit>/.claude/comms.db`. A read from `sample-company/` found the
   same post, so the database path depends on the kit folder, not the current directory.
3. `claude -p "Hal, walk me through closing last month for the sample company. ..." --setting-sources project
   --permission-mode acceptEdits --allowedTools "Read,Glob,Grep,Write,Edit,Agent,Bash(python3:*),Bash(python:*),Bash(ls:*)"`:
   finished with `success`, 3 turns, 309 s. The main session handed the work to `head-controller-hal`, which read its
   reference, `close-month`, `month-end-prep` and the seven CSVs. It never opened `Start-Here.html`, which holds the
   answer key. Its output: `close-packet-2026-09.md` (copied here), an xlsx file, four CSV files, and
   `hal-final-answer.md`.
   - Planted issues found: F3 uncategorized $186.43 Amazon, F4 missing receipt for the $412 Espresso Tech repair, and
     F5 the $640 mobile check deposit with no customer and no invoice.
   - Also found, not planted (the sample data supports each one): two open supplier bills not in the books, no
     balance sheet export, a $310 invoice 32 days late, no electric accrual, payroll booked from bank debits, and
     August card fees out of line.
   - Caveat: user-level instructions on HQ (the global CLAUDE.md and rules) may still have loaded. `--setting-sources
     project` excludes user settings and hooks, not user memory files.

**Mac: not proven by machine.** HQ has no Mac. What differs on a Mac:
- Python is `python3`; there is no `python`. Every agent file says to use `python3` and fall back to `python` on
  Windows.
- The first `python3` run on a Mac without developer tools opens a "command line developer tools" install prompt. The
  guide says to click Install. Only the optional message board needs it.
- An xlsx or PDF close packet needs libraries a stock Mac doesn't have. Hal's kit file says to fall back to Markdown
  plus CSV, which is what the packet's .md and .csv files are.
- Unzipping uses Finder (double-click) instead of Extract All. The download is the universal .dmg.
