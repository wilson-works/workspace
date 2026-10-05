---
id: GS-02
title: Make it yours
minutes: 15
---
Right now your office has default settings. In this lesson Claude interviews you and fills in your own: your name, the office's name, its colors and logo, and a few facts about your computer. Everything goes into one file, `workspace.config.json`, in the WorkSpace folder.

## What you'll get

- An office with your name on it, in your colors, with your logo.
- A `workspace.config.json` file you can change any time.

## Do this

**1. Gather two things (optional).** If you want a logo, know where the image file is on your computer. It needs to be an .svg or .png file. If you have brand colors, have them handy, either as color codes like #1F6F4A or in words like "light green and dark green".

**2. Start the interview.** In a chat in the WorkSpace folder, paste this:

```
Set up my WorkSpace. Ask me one question at a time and wait for my answer. If I'm not sure about something, suggest a sensible answer and move on. Before you save workspace.config.json, show me everything you're about to save in plain words and wait for my yes. When it's saved, restart the office so it picks up the new settings, and tell me what to look for on the page.
```

The words "set up my WorkSpace" start the `/workspace-setup` skill. A skill is a saved set of instructions Claude follows for one job.

**3. Answer the questions.** Here's what each one means:

| Question | What it means | Example answer |
|---|---|---|
| Your name | What sessions call you. You're the owner. | Sam |
| Personal or company | Is this office for you, or for a business? | Company |
| Office name | The name in the bar at the top of the office | The Workshop |
| Company name | Shown next to the office name, for a company office | Example Co. |
| Brand colors | Two colors for the orb in the bar, a light one and a dark one | light green and dark green |
| Logo | An .svg or .png file that takes the orb's place | logo.png in Pictures |
| This computer's name | A short name in capitals for this machine | DESK |
| Other machines | Computers you'll connect later (GS-05) | LAPTOP, or none yet |
| Code folders | Where your code projects live. Each project in them gets its own room on the floor. | Code, in Documents |
| Private work | Folders whose sessions never show their titles or tasks on the office or your phone | Clients |
| Never read | Folders no session may ever read or touch | another person's user folder |

Pick personal if the office is only for your own work. Pick company if you'll run business work through it. Personal use can skip the company name and brand questions. You can change your mind later.

Private work is for things like client files, tax or health records: sessions can still work there, but the office won't show what they're doing. Never read is stronger. In GS-04 those folders become rules that stop any session from opening them.

**4. Check the summary.** Before it saves anything, Claude shows you everything it's about to write. Read it. Say what to change, or say yes.

**5. Look at the office.** Once Claude has restarted the office, reload the office page in your browser.

## What you should see

- Your office name, and your company name if you gave one, in the bar at the top of the page.
- The orb in the bar in your two colors, or your logo in its place.
- A new `workspace.config.json` in the WorkSpace folder. It has the same layout as `workspace.config.example.json`, the template that ships with WorkSpace. Keep it to yourself: it names you and your computers, so don't commit it to git or share it.

## If something's off

- **The bar didn't change.** The office reads its settings when it starts. Ask Claude: "Restart the office and check that it's reading workspace.config.json." Then reload the page.
- **The logo doesn't show.** The office only uses an .svg or .png file that it can find. Ask Claude to check the logo path in workspace.config.json points at a file that exists, then restart the office.
- **The colors don't show.** Colors are saved as codes like #1F6F4A. Ask Claude: "Check my two brand colors in workspace.config.json are written as color codes, fix them if not, and restart the office."
- **"Set up my WorkSpace" didn't start an interview.** Check the chat is open in the WorkSpace folder, where the setup skill lives. Then type /workspace-setup.
- **You want to change an answer later.** Say "set up my WorkSpace" again, or ask Claude to change one setting in workspace.config.json and restart the office.

## Done when

- [ ] You answered the setup questions and approved the summary.
- [ ] `workspace.config.json` exists in the WorkSpace folder.
- [ ] The bar at the top of the office shows your office name, and your colors or logo.

When you've finished, tap **Mark done** at the top of this lesson, or ask Claude to run `node bin/work.js mark getting-started GS-02 done`.
