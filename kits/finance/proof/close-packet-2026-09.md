# Close Packet - September 2026
**Harbor Lane Coffee (invented practice company)**

| | |
|---|---|
| Period | September 1-30, 2026 |
| Prepared by | Hal (Controller), 2026-10-23 |
| Reviewed by | Not yet. Owner sign-off pending |
| Status | **DRAFT. Not closed.** Two flags (F1, F2) block the close. Eleven flags are pending owner sign-off |
| Run type | Unattended test run. Flags are listed with recommendations and were not acted on |
| Sources | Only the seven files in `sample-company/`, exported for September 2026. No QuickBooks connection was used |

Nothing in `sample-company/` was changed. Nothing was recategorized, deleted, posted or paid.

---

## 1. Key figures (from `profit-and-loss-2026-09.csv`)

| | Sep 2026 | Aug 2026 | Change |
|---|---:|---:|---:|
| Revenue (Total Income, row 18) | $29,349.75 | $27,170.30 | +$2,179.45 (+8.0%) |
| Cost of goods sold (row 19) | $6,497.60 | $6,110.60 | +$387.00 (+6.3%) |
| Gross profit (row 20) | $22,852.15 | $21,059.70 | +$1,792.45 |
| Gross margin | 77.9% | 77.5% | +0.35 pts |
| Operating expenses (row 21) | $15,774.22 | $15,590.35 | +$183.87 (+1.2%) |
| **Net income (row 22)** | **$7,077.93** | **$5,469.35** | **+$1,608.58 (+29.4%)** |
| Cash in checking, 9/30 (bank row 32) | $24,952.93 | $18,450.00 opening | +$6,502.93 |

*Gross margin* is the share of each sales dollar left after paying for the beans, milk and pastries that went into it.

**Before you rely on net income, read flag F1.** If the two open supplier bills belong in September, net income drops to about $4,423 and gross margin to about 68.8%.

---

## 2. The close, step by step

### Step 1. Month and books open
- Month closed: **September 2026.** Every file in `sample-company/` covers September 2026 only, which matches "last month" as of today (2026-10-23).
- Books open: none of the exports shows a closing date or a filing. I treated September as open. **The owner has to confirm this (F11).**

### Step 2. P&L and the transaction register
- `transactions-2026-09.csv` has 42 lines (rows 2-43) in 33 transactions. Square deposits come in two lines each, the sale and the fee, under one transaction ID. Those are splits, not duplicates.
- I added up every register line by account. **All 16 accounts tie to the P&L to the penny.** Income is $29,349.75 and net income is $7,077.93.
- **Uncategorized lines: 1.** T128, AMZN Mktp US, $186.43 (row 32). See F3.

### Step 3. Matching processor payouts and customer payments to the bank

**Square payouts** (`square-payouts-2026-09.csv`, rows 2-10). I compared the *net payout* (what Square actually sent to the bank after fees) against the bank and the books.

| Result | Count | Amount |
|---|---:|---:|
| Square payouts matched to the books and the bank, same day, $0.00 difference | 9 of 9 | $25,097.83 net |
| Square gross sales vs. book Coffee & Food Sales | ties | $25,804.75 |
| Square fees vs. book Merchant Processing Fees | ties | $706.92 |
| Payouts in Square, missing from the books | 0 | $0.00 |
| Square deposits in the books with no Square record | 0 | $0.00 |
| Variance lines (matched, but amounts differ) | 0 | $0.00 |

**Customer payments.** T110 Maple Street Bakery $1,450.00 (bank row 11) and T111 Northside Coworking $880.00 (bank row 25) both match exactly. T115, the $640.00 mobile check deposit (bank row 20), matches the bank but has **no customer name**. See F5.

**Full bank match** (`bank-statement-2026-09.csv`, rows 3-32). The rule was amount within $0.50 and date within 2 days.

| Result | Count | Amount |
|---|---:|---:|
| Book cash transactions matched to the bank | 30 of 30 | in $28,067.83 / out $21,564.90 |
| Bank lines matched to the books | 30 of 30 | same |
| Unmatched, book side | 0 | $0.00 |
| Unmatched, bank side | 0 | $0.00 |

The three September invoices (T112-T114, $2,905.00) are not cash, so they are not expected on the bank statement.

### Step 4. Duplicate scan
The test was same amount, same name, within 5 days. **No duplicates were flagged.** The only same-name, same-amount pairs are the two Gusto payrolls ($4,850.00 and $371.03, on 9/15 and 9/30). They are 15 days apart, which is a normal twice-a-month payroll.

### Step 5. Receipts (expenses over $75 with no attachment)
- **Missing: 1.** T122 Espresso Tech Services, $412.00 (row 17). See F4.
- Six Square fee lines over $75 (rows 7, 15, 25, 31, 36, 40) have no attachment. They need no receipt because each one is backed line by line by the Square payout report. I marked them "receipt not required."

### Step 6. Bank and subledger tie-outs
A *subledger* is a detail list that feeds one account in the books. The AR aging lists every unpaid customer invoice, and the AP aging lists every unpaid supplier bill. Their totals should equal the matching accounts in the books.

| Tie-out | Result |
|---|---|
| **Bank to books** | Opening $18,450.00 + book cash activity $6,502.93 = **$24,952.93**, which equals the bank ending balance (row 32). **Ties, $0.00 difference.** No uncleared items. Caveat: no balance sheet was supplied, so the tie is bank vs. register activity, assuming the book opening balance was also $18,450.00 |
| **Cash vs. profit check** | Net income $7,077.93 minus the rise in customer receivables $575.00 (invoiced $2,905.00, collected $2,330.00) = $6,502.93, the exact change in cash. Internally consistent |
| **AR aging** (`ar-aging-2026-09-30.csv`) | Total **$3,215.00** across 4 invoices. Rolls forward cleanly: implied 8/31 AR of $2,640.00 = INV-1039 $310 + INV-1041 $1,450 + INV-1043 $880. **Cannot tie to account 1100** because there is no balance sheet export (F2) |
| **AP aging** (`ap-aging-2026-09-30.csv`) | Total **$2,655.20** across 2 bills. **Neither bill appears in the register or P&L.** This is a subledger-to-books gap (F1). I resolve gaps like this. I don't carry them |
| **Clearing accounts** | The chart of accounts has none (no Undeposited Funds or suspense account). Square is booked gross with the fee split out, so there is no clearing balance. Clean |
| **Accruals** | An *accrual* records a cost in the month it was incurred even if the bill comes later. None are booked. Known candidates: September electric (F7) and the two open bills (F1) |
| **Budget** | No budget file was supplied. Variances are against August only |

---

## 3. Owner sign-off gate

```
Uncategorized transactions:  0 of 1 resolved   (F3)
Settlement discrepancies:    0 flagged          (9 of 9 Square payouts reconciled)
Bank match:                  30 of 30 matched both ways, $0.00 unmatched
Suspicious duplicates:       0 flagged
Missing receipts:            1 outstanding      (F4)
Controller flags:            9 more (F1, F2, F5-F11). F1 and F2 block the close
```

Every flag below is **pending owner sign-off**. This was an unattended run, so nobody could answer questions. I continued past the gate to write this packet, and every flag is still open.

| # | Flag | Source | Recommended action | Who | Status |
|---|---|---|---|---|---|
| **F1** | **Two September supplier bills missing from the books, $2,655.20.** RR-8866 Ridgeline Roasters $2,060.00 (9/28) and VD-3391 Valley Dairy $595.20 (9/29) are open on the AP aging but appear nowhere in the register or P&L. Sales are recorded when invoiced, but supplier costs only when paid. That mix overstates September profit | AP aging rows 2-3 | Enter both as bills in QuickBooks with their bill dates, through Accounts Payable rather than a plug entry. Pick one method for the books (I recommend *accrual*, recording sales and costs when they happen, since sales already work that way). Check whether RR-8812 ($1,940, paid 9/3) was an August bill. Impact: net income about $4,422.73 and gross margin about 68.8% | Owner; Lila and Theo | Pending owner sign-off. **Blocks close** |
| **F2** | **AR and AP can't be tied to the books.** No balance sheet or trial balance export. A *trial balance* is the list of every account's ending balance | AR/AP agings; no balance sheet file | Export the Balance Sheet as of 9/30/2026. Confirm AR (1100) = $3,215.00 and AP (2000) = $2,655.20. Resolve any difference over $1 | Owner; Lila | Pending owner sign-off. **Blocks close** |
| F3 | Uncategorized expense, AMZN Mktp US, $186.43, 9/22. Receipt is attached | Register row 32 (T128) | Open the receipt and recode it. Most likely Supplies (6600), or Cost of Goods if it was cups, lids or food | Owner | Pending owner sign-off |
| F4 | Missing receipt, Espresso Tech Services, $412.00, 9/12 (group head rebuild) | Register row 17 (T122) | Get the service invoice and attach it. Confirm it was a repair (an expense) and not an upgrade to add to Espresso Equipment (1500) | Owner | Pending owner sign-off |
| F5 | $640.00 mobile check deposit (check 2214) booked to Catering Sales with no customer and no invoice | Register row 26 (T115); bank row 20 | Identify the payer, add the name, and attach the check image. Make sure it doesn't pay an open invoice, which would count the sale twice | Owner; Lila | Pending owner sign-off |
| F6 | Past due: Bayview Dental INV-1039, $310.00, due 8/29, now 32 days late. The same customer was billed $420 again on 9/28 | AR aging row 5 | Send a friendly reminder with both invoices. No write-off yet. Hold further credit if it reaches 60 days | Lila | Pending owner sign-off |
| F7 | Electric cutoff. The $418.62 paid 9/17 is for **August** usage, and September's usage isn't recorded anywhere | Register row 23 (T125) | Theo books an estimated September electric accrual (about $420-$460) that reverses when the October bill arrives. Or confirm the books are cash basis on purpose | Theo | Pending owner sign-off |
| F8 | Payroll is booked from bank debits, not from the Gusto report. The tax debit equals employer taxes only, and Payroll Liabilities (2100) is never used, so employee withholdings can't be seen | Register rows 21-22, 41-42; bank rows 16-17, 30-31 | Pull the Gusto payroll register for both pay runs. Confirm gross wages, withholdings and employer taxes. Theo rebuilds the entry if it differs | Owner; Theo | Pending owner sign-off |
| F9 | No sales tax payable account in the chart of accounts. If Square gross sales include sales tax, revenue is overstated and a liability is missing | Chart of accounts; Square file | Ask Anya to confirm the sales tax setup | Anya | Pending owner sign-off |
| F10 | Card fees fell 28.9% (4.07% of card sales in August, 2.74% in September) while sales rose. September ties to Square exactly, so the open question is August | P&L row 14 | Pull the August Square report. Look for a one-time fee, chargeback or misposting | Owner; Nadia if it's a rate change | Pending owner sign-off |
| F11 | Books-open status not shown in the exports | All files | Confirm September has no closing date set and nothing has been filed for it, before making any fix above | Owner | Pending owner sign-off |

*Materiality* is the size of mistake that would change a decision. For a month with $29,350 in revenue I used about 1% ($290). F1 is well above it. F3 and F4 are below it in size but still need fixing because they affect categories and records.

---

## 4. P&L narrative

**September came in at $7,077.93 net income, up 29% from August's $5,469.35. Read the caution at the end before you rely on it.**

**Revenue** was $29,349.75, up 8% month over month (MoM). Counter and card sales through Square did most of the work at $25,804.75 (+$1,394, +5.7%), spread evenly across nine payouts. Catering had the biggest swing, up 54% to $2,020. That came from a $960 members' breakfast for Northside Coworking, a new $420 office coffee service for Bayview Dental, and a $640 check from a customer we still need to name. Wholesale beans to Maple Street Bakery held steady at $1,525.

**Gross margin** held at 77.9%, against 77.5% in August. Beans and dairy rose about 6%, in line with sales.

**Expenses** were nearly flat at $15,774 (+1.2%). Rent, payroll, insurance and internet did not change. Three lines moved. A $412 espresso machine repair is new. Card fees dropped $288 even though sales rose, which needs explaining (F10). Supplies looks lower, but $186 of Amazon spending is sitting uncategorized.

**Bottom line and caution:** two supplier bills dated the last days of September ($2,655) are not in these numbers. If they belong in September, net income is closer to $4,400 and margin closer to 69%. Cash is solid at $24,953, up $6,503.

**Watch list for October:** (1) Collect Bayview Dental's $310, now past due. (2) Settle when supplier bills hit the books. (3) Confirm with Anya whether Square sales include sales tax.

---

## 5. Pre-review checklist

| Check | Result |
|---|---|
| Every number ties to a named file and row | Yes. Cited throughout |
| Subledgers (AR, AP) tie to the books | **No.** AR can't be tested (F2). AP is out by $2,655.20 against the register (F1) |
| Period cutoffs clean | **No.** September electric is not accrued (F7). Supplier bills dated 9/28-9/29 are not booked (F1) |
| Accruals booked for known but unbilled items | **No** (F1, F7) |
| Clearing accounts at zero or explained | Yes. None exist, and Square is booked gross with fees split |
| Narrative covers change vs. prior month and budget | Prior month: yes. Budget: none supplied |
| Payroll as recorded agrees to the processor report | Not verified (F8) |
| Inventory | Account 1200 exists, but purchases go straight to cost of goods and there is no month-end count. A count is worth adding once the books move to accrual |

**Verdict:** the bank side is clean. 30 of 30 transactions match, all nine Square payouts tie, and the P&L ties to the register to the penny. That part is the rhythm. The books are not closed, though. Supplier bills and accruals aren't recorded, and AR and AP can't be tied to a balance sheet. Clear F1 and F2 and I'll sign it.

---

## 6. Files in this packet (all in `outputs/`)

| File | What it is |
|---|---|
| `close-packet-2026-09.md` | This document |
| `close-packet-2026-09.xlsx` | Workbook with tabs: P&L, Reconciliation (bank), Square, Action Items, Trial Balance (placeholder: no source data) |
| `close-packet-2026-09-pl.csv` | P&L, September vs. August, with $ and % change |
| `close-packet-2026-09-bank-reconciliation.csv` | Line-by-line book-to-bank match, with register and bank row numbers |
| `close-packet-2026-09-square-reconciliation.csv` | Square payout to book to bank, per payout |
| `close-packet-2026-09-action-items.csv` | Flags F1-F11 with source, recommendation, owner and status |

**Not produced:** the one-page PDF summary. No PDF library is installed on this computer (reportlab and fpdf are missing), so I did not install one. The trial balance tab is a placeholder because no trial balance export exists in `sample-company/`.
