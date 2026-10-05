---
id: DA-02
title: Each person is told to pay too much
who: Gavin (frontend)
---
## Why

A user reported this:

"Four of us split a $100 dinner and left a 20% tip. The page said the total with tip was $120.00, but it told each of us to pay $45.00. That's $180.00 between the four of us. When I use it on my own, it gets my amount right."

We checked, and it isn't only groups of four. Two people splitting a $50 bill with a 10% tip are each told $30.00, while the total says $55.00. The more people, the further off it gets. One person is always right.

Anyone who trusts this page overpays. That makes it the worst problem the app has.

## What to do

- Reproduce it first, in the browser, with the examples above.
- Find the cause and fix it there. Don't patch the number on the screen.
- Check that every amount on the page still agrees with the others.
- In your report, explain the cause in one or two plain sentences, so John can check the fix matches it.
- Fix only this. Anything else you notice goes in the report.

## Done when

- [ ] Four people, $100 bill, 20% tip: each pays $30.00, and the total is $120.00.
- [ ] Two people, $50 bill, 10% tip: each pays $27.50, and the total is $55.00.
- [ ] One person, $100 bill, 20% tip: still $120.00.
- [ ] Three people, $100 bill, 15% tip: each pays $38.33 (shares are rounded to the nearest cent).
- [ ] The report names the cause in plain words.
- [ ] John has reviewed the change and it's committed.

## Who

Gavin (frontend). The math lives in `app.js`, which belongs to his team in this app. Rachel's QA team adds a test that guards against this coming back in DA-03.
