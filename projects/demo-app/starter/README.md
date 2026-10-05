> Practice code for WorkSpace from WilsonWorks. It has one known bug, left in on purpose for the CTO org to find (order DA-02). Don't use it to split a real bill until that's fixed.

# Tip splitter

Type a bill, a tip and how many people are paying. The page tells each person what to pay.

## Open it

Open `index.html` in any web browser (double-click it). There's nothing to install and no server to run.

## Files

- `index.html`: the page.
- `style.css`: how it looks.
- `app.js`: the math, in `splitBill`, and the code that connects it to the page.

## Use the math in Node

`splitBill(bill, tipPct, people)` returns `{ tip, total, each }` in dollars, and throws an error with a plain message when an input makes no sense.

```
const { splitBill } = require('./app.js');
console.log(splitBill(100, 20, 1)); // { tip: 20, total: 120, each: 120 }
```

Each amount is rounded to the nearest cent, so when a total doesn't split evenly the shares can add up to a cent or two more or less than the total.
