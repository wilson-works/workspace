Hal closed **September 2026** for the practice company (Harbor Lane Coffee, which is made up) and wrote the close packet to `outputs/`. He **would not sign the month off as closed** because two problems are holding it up. Nothing in `sample-company/` was changed.

## What matched
- **Bank:** all 30 transactions in the books match the bank statement, and the bank statement has nothing the books don't. The bank balance went from $18,450.00 to $24,952.93. Matching the books to the bank like this is called a "bank reconciliation."
- **Square** (the card processor): all 9 deposits match exactly, at $25,804.75 in sales minus $706.92 in fees.
- **Profit and loss report:** it agrees with the transaction list to the penny. Revenue was $29,349.75 and profit was $7,077.93.
- **Duplicate check:** nothing was entered twice.

## What's holding up the close
1. **Two supplier bills aren't in the books ($2,655.20).** They are from Ridgeline Roasters ($2,060) and Valley Dairy ($595.20). Without them, September profit looks too high: about $4,400 is closer to right than $7,078. **Recommended action:** enter both bills with their September dates.
2. **There's no balance sheet export.** A balance sheet lists what the business owns and owes on a given date. Without it, Hal can't check two totals against the books: what customers owe you ($3,215) and what you owe suppliers ($2,655). **Recommended action:** export the balance sheet as of September 30 and compare.

## Other flags, each with Hal's recommended action
3. **Amazon charge with no category ($186.43):** check the receipt and move it to Supplies.
4. **No receipt for a $412 repair** (Espresso Tech Services): get the invoice from the vendor.
5. **A $640 check deposit with no customer name:** find out who paid, and make sure the sale wasn't already counted from an invoice.
6. **Bayview Dental owes $310 and is 32 days late:** send a friendly reminder.
7. **September's electric bill isn't recorded yet:** book an estimate of about $420–$460 that cancels itself when the real bill arrives.
8. **Payroll was entered from bank withdrawals:** pull the Gusto payroll reports so the full wage and tax figures are right.
9. **There's no sales tax account:** ask Anya, our tax lead, whether the card sales include sales tax.
10. **Card fees fell from 4.07% to 2.74% of card sales:** check August's Square report for a mistake.
11. **Check whether September is still open in QuickBooks** before entering any of these fixes.

## Files in `outputs/`
- `close-packet-2026-09.md`, the written summary
- `close-packet-2026-09.xlsx`, a spreadsheet with the P&L, bank and Square matching, and the action list
- Four CSV files with the same tables: P&L, bank matching, Square matching and action items

## What Hal couldn't do
- **PDF summary:** no PDF tool is installed on this computer.
- **Trial balance** (each account's ending balance): this needs the balance sheet.
- **Budget comparison:** there's no budget file, so September is compared with August only.

**Next step:** fix the first two flags. Theo can enter the missing bills, and Lila can check the balance sheet totals once you've exported it. Hal kept his two working scripts outside this folder, in `D:\tmp\scratch\fk6fb8\hal-work\`.