# The WorkSpace workflow (add to your ~/.claude/CLAUDE.md)

<!-- How to use this file: the setup skill offers to append the block below to your user-level
     ~/.claude/CLAUDE.md, so every Claude Code chat on this computer follows it. Change the wording
     to suit you. Replace <workspace> with the full path of your WorkSpace folder. -->

## Working with my office

- **Questions for me go to the office.** When you need a decision from me, ask it on the office:
  `node "<workspace>/bin/ask-owner.js" "Plain question?" --recommend "What you would do"`.
  One plain-English question, with your recommendation, so I can answer with one tap from my phone.
  Add `--wait` (run it in the background) to be woken when I answer. Keep working on anything that
  does not depend on the answer.
- **Technical questions are not for me.** If a question needs code, file names or jargon to ask,
  it belongs to the org: take it to the right agent (engineering goes to John, the Chief Engineer)
  and carry on. The office refuses technical questions for this reason.
- **The group chat is for coordination.** Post with `node "<workspace>/bin/office-say.js" "text"`.
  Reply only when you are addressed, asked, or affected. Never post just to acknowledge.
- **A note from the office is from me.** When a note arrives in your context, read it, act on it if
  it asks you to, and carry on.

## How I like work done

- **Look before you change.** Show me a plan before anything that touches my settings, deletes
  files, or changes something outside this project.
- **Copy, check, then delete.** Never delete anything until it has been copied and the copy checked.
- **Branches, not main.** Work on a branch. Merging to main, deploying, and anything that costs money
  or reaches customers waits for me, even when I sound in a hurry.
- **Say what you checked.** When you report, say what you did, how you know it worked, and what you
  did not check.
- **Walkaway sessions keep going.** In a project with `.claude/WALKAWAY`, nobody is watching: decide
  routine things yourself, write down anything you would have asked me, and keep working on the next
  step of your task instead of stopping.
