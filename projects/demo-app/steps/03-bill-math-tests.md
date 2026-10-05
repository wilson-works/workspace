---
id: DA-03
title: Tests for the bill math
who: Rachel (QA)
---
## Why

The DA-02 bug lived in `splitBill`, the function that does all the math, and nothing checked it. A user found the bug before we did.

Tests are small programs that feed the math known inputs and check the answers. They run in about a second, and they catch the same mistake if it ever comes back.

Do this after DA-02. Until DA-02 is fixed, the tests for more than one person will fail. That's expected, and the report should say so.

## What to do

- Write the tests in `tests/split.test.js`, using the test runner built into Node (`node:test` and `node:assert`). Install nothing.
- Load the function with `require('../app.js')`. It's already exported for this.
- Give each test a name that says in plain words what it checks.

Cover at least these cases:

- One person pays the whole total.
- An even split: four people, $100 bill, 20% tip, $30.00 each.
- An uneven split rounds each share to the nearest cent: three people, $100 bill, 15% tip, $38.33 each.
- A 0% tip, and a $0 bill.
- Bad input is refused with a plain message: 0 people, 2.5 people, a negative bill, a negative tip, and a value that isn't a number at all.

Run them with:

```
node --test tests/split.test.js
```

## Done when

- [ ] `node --test tests/split.test.js` passes on the fixed code.
- [ ] Every case above has a test.
- [ ] You showed the tests would have caught DA-02: run against the code from before the DA-02 fix (git can show that version), at least one test fails. The fixed code stays in place.
- [ ] The report lists each test name and what it covers.
- [ ] John has reviewed the change and it's committed.

## Who

Rachel (QA). Maya, who writes the test that stops a fixed bug from coming back, fits the DA-02 case. Owen, who hunts odd inputs, fits the bad-input cases.
