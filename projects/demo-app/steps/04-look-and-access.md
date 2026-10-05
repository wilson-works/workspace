---
id: DA-04
title: Polish the look and make it usable for everyone
who: Gavin (frontend)
---
## Why

The page works but looks unfinished, and some people can't use it well.

- The grey labels, hint and result are hard to read. Their contrast (the difference between the text color and the background) is too low.
- The input boxes have faint edges that nearly disappear against the white.
- A person using a screen reader (software that reads the page aloud) isn't told when the result changes, or when an error appears.

## What to do

- Make every piece of text clear to read against its background. Normal text needs a contrast of at least 4.5 to 1, and large headings at least 3 to 1. These are the levels in WCAG AA, the common web accessibility standard.
- Make the input boxes' edges clearly visible: at least 3 to 1 against the background.
- Make sure every control can be reached and used with the keyboard alone, in a sensible order, with a clear outline on whichever one is selected.
- Have screen readers read out the result when it changes, without moving the keyboard focus.
- Have the error message (for example, for 0 people) read out too, and clearly tied to the box that caused it.
- Make it look finished on a phone (375 pixels wide) and on a desktop: even spacing, a result that stands out, and no sideways scrolling.
- Change the look and access only. The math and the wording of the result stay the same.

## Done when

- [ ] Every piece of text passes 4.5 to 1 contrast (large headings 3 to 1).
- [ ] Input box edges pass 3 to 1 against the background.
- [ ] Tab moves through bill, tip and people (and the tip buttons, if DA-01 is in) in that order, with a visible outline on each.
- [ ] With a screen reader on, changing any box reads out the new result.
- [ ] An error is read out and is tied to the box that caused it.
- [ ] The page fits a 375-pixel-wide screen with no sideways scrolling.
- [ ] The report lists each contrast pair checked, with its ratio.
- [ ] John has reviewed the change and it's committed.

## Who

Gavin (frontend). Kai, his accessibility junior, should own the keyboard and screen-reader checks. Ava fits the spacing and the look.
