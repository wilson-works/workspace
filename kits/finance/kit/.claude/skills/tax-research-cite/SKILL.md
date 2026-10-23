---
name: tax-research-cite
description: Answer a tax or IRS question from the kit's library, with a citation for every rule and figure. Use for any question about a form, a line, an IRC section, an IRS publication, a deadline, a threshold or a state tax rule. Invoke with /tax-research-cite [question].
---

# Tax research with citations

You answer from the library in `.claude/library/`, not from memory. A figure you cannot point to is a figure you do
not give.

## Steps

1. **Open `.claude/library/INDEX.md` first.** It says which part of the library answers which kind of question.
2. **Name the instrument** in the question: the form (Form 1065, Schedule C), the IRC section (§179, §199A), the
   IRS publication (Pub 15, Pub 946), or the state rule. If the question names none, find the topic in the index
   with plain words.
3. **Find the hit.** For a tax rule, start at `firm-reference/tax/INDEX.md` and its crosswalks. For what a line on a
   form is, use `irs/irs-form-lines-2025.csv`. For bookkeeping method, use `firm-reference/library/INDEX.md`.
4. **Read the hit in full**, not just the matching line: its law-currency note, its `as_of` date, its worked facts
   and its `## Sources` section.
5. **Answer, then cite.** Every rule and every figure carries:
   - the file and section (for example `firm-reference/tax/payroll-setup-oklahoma-2026.md` §2),
   - the file's `as_of` date,
   - the primary-source URL from the file's sources (irs.gov, the eCFR, the statute).

## Figures that are not settled

- A figure tagged `[VERIFY-FOR-TAX-YEAR]`, `[VERIFY]` or `[UNVERIFIED]` is not settled. Say so in the answer, next to
  the figure, and tell the person to confirm it for their tax year at the primary source.
- A file's worked example is an invented business. Its dollar amounts show the method; they are not anyone's real
  numbers and not a rule.
- Check the year. A 2025 form line or a 2026 threshold may not hold for another year.

## When the library is silent

"The library does not carry this" is an allowed answer, and often the right one. Say it plainly, say where you looked,
and name the primary source the person should read (the form's instructions on irs.gov, the IRC section, the state
revenue department). Never fill the gap from memory and present it as found.

## Rules

- This is research for a person to check, not tax advice. Open the answer with: "Prepared for review, not tax advice."
- Quote short. Cite the place; do not paste whole pages.
- Never put a client's name or details into a file you write. Work in `outputs/`.
- If two files disagree, show both, with their `as_of` dates, and say which is newer. Do not pick one silently.

## Answer shape

```
Prepared for review, not tax advice.

Answer: <one or two plain sentences>

Why: <the rule, in plain words>

Sources:
- <file> §<section> (as_of <date>): <primary-source URL>

Not settled: <any [VERIFY-FOR-TAX-YEAR] figure, or "none">
```
