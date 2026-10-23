# The library: start here

This folder is the team's reference shelf: bookkeeping method, tax rules, IRS form lines, Drake Tax data entry, and
research reports on year-end work. Answer tax, IRS, Drake and bookkeeping questions from here, and cite what you use.
It is research for a person to check, never tax advice, and it holds no client's information.

## Where to look first

| The question is about | Open first | Then |
|---|---|---|
| A tax rule: a form, an IRC section, a publication, a deadline, a threshold, a state rule | [firm-reference/tax/INDEX.md](firm-reference/tax/INDEX.md) | the note it points to, read in full |
| What a line on an IRS form is (label, page, how it is computed, where it flows) | [irs/irs-form-lines-2025.csv](irs/irs-form-lines-2025.csv) | the IRS URL in that row |
| Where to type something in Drake Tax | [drake/drake-screen-catalog-2025.csv](drake/drake-screen-catalog-2025.csv) | [drake/tax-year-2025/INDEX.md](drake/tax-year-2025/INDEX.md) and the return type's `.gaps.md` |
| Bookkeeping method: debits and credits, accruals, closing, the accounting cycle | [firm-reference/library/INDEX.md](firm-reference/library/INDEX.md) | the card it points to |
| How the firm closes, reconciles, maps to tax lines and reviews | [firm-reference/firm/](#firm-reference-firm) below | the file named |
| Coding bank lines and reading a bookkeeper's request | [firm-reference/desk/DESK-GUIDE.md](firm-reference/desk/DESK-GUIDE.md) | [firm-reference/desk/BANK-CODING.md](firm-reference/desk/BANK-CODING.md) |
| Year-end practice, QuickBooks exports, Drake import, payroll, review standards | [Research reports](#research-reports) below | the report's overview, then its chapters |

The skills `/tax-research-cite` and `/drake-entry-lookup` walk through these steps.

## How to cite

Every rule and every figure in an answer carries three things:

1. **The file and section**, as a path in this folder: `firm-reference/tax/payroll-setup-oklahoma-2026.md` §2, or for
   a Drake answer the record's `mapping_id` (for example `1065.SETUP.TRIAL_BALANCE_IMPORT`).
2. **The date it was true**: the note's `as_of`, the record's `last_verified`, or the tax year of the form line.
3. **The primary source**: the irs.gov, eCFR or statute URL from the note's `## Sources`, the IRS URL in the form-line
   row, or the Drake knowledge-base URL in the mapping record.

Rules that go with it:

- A figure tagged `[VERIFY-FOR-TAX-YEAR]`, `[VERIFY]` or `[UNVERIFIED]` is not settled. Say so beside the figure.
- A Drake record marked `kb_inferred` or `needs_verification_in_software` is not settled either. Read the return type's
  `.gaps.md` before you rely on it.
- The worked examples in the tax notes use an invented business (a two-member landscaping LLC). Their numbers show
  the method; they are nobody's real figures.
- "The library does not carry this" is a complete answer. Say where you looked and name the primary source to read.
  Never fill a gap from memory.
- Some notes point to files that are not in this kit (other folders of the system they came from). If a link does
  not open, the material is not here: say so.

## What each part holds

### firm-reference/

The firm's own bookkeeping and tax reference, 133 files.

- **[tax/](firm-reference/tax/INDEX.md)**: 41 tax notes, federal and Oklahoma, each with a law-currency note, an
  `as_of` date and primary sources. Its INDEX has crosswalks by form, IRC section, publication and statute.
  [tax-index.json](firm-reference/tax/tax-index.json) is the same index as data.
- **[library/](firm-reference/library/INDEX.md)**: accounting method cards (the cycle, adjustments, mechanics,
  recognition, topics), each citing FASB, ASC or the regulations.
- **[desk/](firm-reference/desk/README.md)**: how a bookkeeper's request is read, the bank-coding guide, the field
  glossary, QuickBooks mechanics, and five firm research notes on categorization, bank reconciliation, payroll tax
  reconciliation and year-end close.
- **firm/**: the firm's working standards, listed below.

<a id="firm-reference-firm"></a>
#### firm-reference/firm/

| File | Answers |
|---|---|
| [bookkeeping-cycle.md](firm-reference/firm/bookkeeping-cycle.md) | the firm's weekly and monthly bookkeeping cycle |
| [Accounting-Firm-Bookkeeping-Cycle-Management.md](firm-reference/firm/Accounting-Firm-Bookkeeping-Cycle-Management.md) | running the cycle across many clients |
| [bank-rec-workpaper.md](firm-reference/firm/bank-rec-workpaper.md) | the bank reconciliation workpaper |
| [year-end-close.md](firm-reference/firm/year-end-close.md) | year-end close steps |
| [payroll-tax-recon.md](firm-reference/firm/payroll-tax-recon.md) | 941, 940 and W-3 against the books |
| [depreciation-schedule.md](firm-reference/firm/depreciation-schedule.md) | the depreciation schedule |
| [basis-worksheets.md](firm-reference/firm/basis-worksheets.md) | shareholder and partner basis worksheets |
| [schedule-l-mapping.md](firm-reference/firm/schedule-l-mapping.md) | mapping the balance sheet to Schedule L |
| [m2-cross-schedule-ties.md](firm-reference/firm/m2-cross-schedule-ties.md) | how M-2 ties to the other schedules |
| [tax-mapping.md](firm-reference/firm/tax-mapping.md) | mapping accounts to tax lines |
| [tax-line-authority.md](firm-reference/firm/tax-line-authority.md) | which source decides a tax line |
| [tax-forms.md](firm-reference/firm/tax-forms.md) | the business returns and their forms |
| [form-line-constants-2025.md](firm-reference/firm/form-line-constants-2025.md) | fixed 2025 form-line values |
| [chart-of-accounts-authority-2026-09-17.md](firm-reference/firm/chart-of-accounts-authority-2026-09-17.md) | the chart of accounts and who decides it |
| [return-review-checklists.md](firm-reference/firm/return-review-checklists.md) | reviewing a prepared return |
| [workpaper-tickmarks.md](firm-reference/firm/workpaper-tickmarks.md) | workpaper tickmarks |
| [post-filing-true-up.md](firm-reference/firm/post-filing-true-up.md) | bringing the books in line with the filed return |
| [quarterly-estimated-tax.md](firm-reference/firm/quarterly-estimated-tax.md) | quarterly estimated tax |
| [smb-tax-planning.md](firm-reference/firm/smb-tax-planning.md) | small-business tax planning |
| [qbo-financial-analysis.md](firm-reference/firm/qbo-financial-analysis.md) | reading QuickBooks financials |
| [qbo-tax-planning-signals.md](firm-reference/firm/qbo-tax-planning-signals.md) | planning signals in QuickBooks data |
| [obbba-199a-verification.md](firm-reference/firm/obbba-199a-verification.md) | 2025 law changes: bonus depreciation, §199A, retirement limits |
| [tax-authority-hierarchy.md](firm-reference/firm/tax-authority-hierarchy.md) | which tax authority outranks which |
| [irc-structure-map.md](firm-reference/firm/irc-structure-map.md) | a map of the Internal Revenue Code |
| [irs-forms-catalog.md](firm-reference/firm/irs-forms-catalog.md) | IRS forms catalog |
| [irs-publications-catalog.md](firm-reference/firm/irs-publications-catalog.md) | IRS publications catalog |

### irs/

[irs-form-lines-2025.csv](irs/irs-form-lines-2025.csv): line records for the 2025 IRS forms, one row per line: form,
page, line, label, how it is entered, the Drake screen where one is known, and the IRS URL it was read from.
[irs_form_line.schema.json](irs/irs_form_line.schema.json) describes the fields. The full page text of the IRS forms
is not in the kit: open the row's IRS URL to read the form itself.

### drake/

Drake Tax 2025 (Drake25) data entry.

- [drake-screen-catalog-2025.csv](drake/drake-screen-catalog-2025.csv): tax line to Drake screen and field, with a
  citation and a verification status per row.
- [tax-year-2025/](drake/tax-year-2025/INDEX.md): mapping records per return type (1040, 1041, 1065, 1120, 1120-S,
  990, STATE). Each record has a `mapping_id`, the screen and field, instructions, caveats, Drake knowledge-base links
  and a confidence. Each return type has a `.MANIFEST.md` (counts) and a `.gaps.md` (what the knowledge base does not
  cover, conflicts, assumptions). [YEAR-CHANGES.json](drake/tax-year-2025/YEAR-CHANGES.json) lists the 2025 changes.
- [DRAKE_DATA_ENTRY_CONVENTIONS.md](drake/DRAKE_DATA_ENTRY_CONVENTIONS.md): the screen selector, red and green fields,
  MFC numbering, the F and ST boxes, override vs adjustment fields.
- [drake_mapping.schema.json](drake/drake_mapping.schema.json) describes a mapping record.

These are the firm's own mapping records with citations to Drake's knowledge base. Drake's articles themselves are
not copied here: open the cited URL.

### Research reports

Twenty-five reports from 2026-10-22, each with dated sources. Start at the report's overview. A few files were held
back from this kit, so some reports start at a chapter instead, and some have no `sources.md`; their chapters carry
the footnoted URLs.

| Report | Answers |
|---|---|
| [a1](research/2026-10-22-a1-getting-150-clients-quickbooks-online-data-out-at-year-en/01-overview.md) | getting each client's QuickBooks data out at year end, by export or API |
| [a2](research/2026-10-22-a2-writing-corrections-back-to-quickbooks-online-with-journa/03-bank-feed-interaction.md) | journal-entry imports into QuickBooks: the bank feed, importers, holding-account cleanup, 1099 |
| [a3](research/2026-10-22-a3-drake-tax-trial-balance-import-for-tax-year-2026/01-overview.md) | Drake's trial balance import, workpapers and tie-out |
| [a4](research/2026-10-22-a4-running-claude-over-a-150-client-bookkeeping-batch-usage/01-overview.md) | running Claude over a large bookkeeping batch: limits, batches, data retention |
| [b1](research/2026-10-22-b1-the-judgement-playbook-for-small-business-year-end-bookke/01-overview.md) | year-end judgment calls: payroll, processors, sales tax, loans, owner transfers, fixed assets, 1099s |
| [b2](research/2026-10-22-b2-trust-and-tie-out-what-a-reviewing-cpa-needs-before-relyi/01-overview.md) | what a reviewing CPA needs: AICPA standards, Circular 230, tie-out matrix |
| [b3](research/2026-10-22-b3-book-to-tax-differences-and-post-return-adjusting-entries/02-book-tax-differences.md) | book-to-tax differences, Schedules L, M-1, M-2, post-return entries |
| [b4](research/2026-10-22-b4-hosting-a-small-accounting-firm-s-internal-web-app-and-cl/01-overview.md) | a firm's security duties: FTC Safeguards Rule, WISP, §7216, hosting |
| [c1](research/2026-10-22-c1-ai-cleanup-catch-up-and-year-end-products-for-accounting/01-overview.md) | AI cleanup and catch-up products for accounting firms |
| [c2](research/2026-10-22-c2-making-ai-bookkeeping-decisions-reproducible-and-auditabl/02-llm-determinism.md) | making AI bookkeeping decisions reproducible and auditable |
| [k9](research/2026-10-22-k9-local-redaction-of-ssns-itins-eins-and-account-and-routin/01-overview.md) | redacting SSNs, EINs and account numbers on your own computer |
| [k9b](research/2026-10-22-k9b-free-open-source-pdf-redactors-a-bookkeeper-can-use-before/01-overview.md) | free PDF redaction tools and how to check they worked |
| [nl1](research/2026-10-22-nl1-k9-follow-up-recall-on-numeric-identifiers-true-text-rem/01-overview.md) | redaction recall on numbers, true text removal, repeatable local models |
| [nl2](research/2026-10-22-nl2-drake-tb-import-for-an-1120-s-or-1120-how-depreciation-i/01-overview.md) | depreciation in a Drake trial balance import for an 1120-S or 1120 |
| [nl3](research/2026-10-22-nl3-intuit-accountant-suite-replacing-quickbooks-online-acco/01-overview.md) | Intuit Accountant Suite replacing QuickBooks Online Accountant |
| [nl4](research/2026-10-22-nl4-follow-up-on-the-qbo-and-gusto-connector-question-read-o/01-overview.md) | read-only QuickBooks and Gusto connections; Gusto bulk downloads |
| [nl5](research/2026-10-22-nl5-gusto-payroll-journal-and-custom-reports-columns-for-off/01-overview.md) | Gusto payroll journal columns and when Gusto debits the bank |
| [nl6](research/2026-10-22-nl6-the-2-s-corp-shareholder-s-2026-w-2-health-insurance-hsa/02-rules-and-w2-boxes.md) | a 2% S-corp shareholder's W-2: health insurance, HSA, vehicle |
| [nl7](research/2026-10-22-nl7-owner-only-401-k-and-sep-for-an-s-corp-shareholder-defer/01-overview.md) | owner-only 401(k) and SEP for an S-corp shareholder |
| [nl8](research/2026-10-22-nl8-accountable-plan-reimbursements-in-a-one-owner-s-corpora/01-overview.md) | accountable-plan reimbursements in a one-owner S corporation |
| [nl9](research/2026-10-22-nl9-rebuilding-an-asset-bought-with-a-loan-that-never-reache/01-overview.md) | booking an asset and its loan that never reached the books |
| [nl10](research/2026-10-22-nl10-can-the-filed-2025-return-anchor-2026-opening-balances/01-overview.md) | using the filed return to anchor opening balances |
| [nl11](research/2026-10-22-nl11-analytical-review-thresholds-how-big-a-year-over-year-c/01-overview.md) | how big a year-over-year change needs an explanation |
| [nl12](research/2026-10-22-nl12-rentals-inside-an-s-corporation-form-8825-lines-per-pro/01-overview.md) | rentals inside an S corporation: Form 8825 per property, Drake import |
| [q10](research/2026-10-22-q10-quickbooks-online-and-gusto-connectors-for-claude-across/01-overview.md) | QuickBooks Online and Gusto connectors for Claude |
