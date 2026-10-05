---
id: GS-10
title: Your Hub
minutes: 25
---
Your Hub is the one folder that holds all your work, split into numbered zones, with a short set of rules and a map that teach Claude where everything goes. The installer made it. In this lesson you learn its zones, read its map, tidy a messy folder into it, and start your first project in the right place.

## What you'll get

- A clear picture of your Hub's zones and what goes in each.
- Your Hub's map, `NAV.md`, with a row you added yourself.
- A tidier Downloads folder, sorted into the zones, without anything deleted.
- Your first project in the code zone, with its own `CLAUDE.md`, and on the map.

## Do this

**1. Open a chat on your Hub.** In VS Code, choose File, then Open Folder, and pick your Hub folder. Or, in the Claude desktop app, choose Code and pick your Hub folder. Start a new chat. Check the office: you're on the floor.

**2. Take the tour.** Paste this:

```
Give me a tour of my Hub. Read CLAUDE.md and NAV.md first, and don't search the whole Hub: those two files are the map. Then tell me, one line each, what every zone is for, with an example of something of mine that would go there. Last, tell me the five rules in CLAUDE.md in plain words.
```

The rules matter most. Nothing is deleted until it has been copied and checked, and you've said yes. If a document and the computer disagree, the computer wins. A newly connected service is read-only until you say otherwise. A session never searches the whole Hub at once. Code goes through branches.

**3. Ask where things go.** Try a few of your own:

```
Using only NAV.md, where should these go in my Hub: a client's contract, the photos from last week's event, my tax letter, a new website project? Answer with the folder for each.
```

**4. Add your own row to the map.** Think of a word you use for something, like "receipts" or "the shop". Paste:

```
Add a row to my Hub's map: when I say "<my word>", it means <the folder>. Put it in .hub/nav.json, regenerate NAV.md with node 50-AI/workspace/hub/bin/hub.js nav --root . and show me the new line.
```

**5. Tidy one folder.** The `file-organizer` skill sorts a messy folder into the zones. It always shows the whole plan first and never deletes. Paste:

```
Use the file-organizer skill on my Downloads folder. Sort what's there into my Hub's zones, following NAV.md. Show me the whole plan first and move nothing until I say yes. Anything whose home isn't clear goes to 00-Inbox.
```

Read the plan. Say what to change, or say yes.

**6. Start your first project.** Pick a name in lowercase with dashes, like `my-website`. Paste:

```
Start a new project in my Hub called <my-project> with node 50-AI/workspace/hub/bin/hub.js new-project <my-project>. Show me its plan first and wait for my yes. When it's made, show me its CLAUDE.md, then regenerate NAV.md with node 50-AI/workspace/hub/bin/hub.js nav --root . and show me the project's line.
```

**7. Open the project's room.** Open a new chat on the new project's folder, in `20-Coding/Projects/<my-project>`. On the office floor, that chat sits in the project's own room.

## What you should see

- A tour that names every zone and the five rules, without Claude searching the whole Hub.
- Your new row in `NAV.md`.
- A plan for Downloads before anything moved, and afterwards the files in their zones, with nothing deleted.
- `20-Coding/Projects/<my-project>` with its own `CLAUDE.md`, and a line for it in `NAV.md`.

## If something's off

- **Claude searched the whole Hub.** Stop it and say: "Read NAV.md first, then search only inside the zone you need." That is rule 4 in your Hub's `CLAUDE.md`.
- **"No Hub found."** The chat isn't open on your Hub folder, or the Hub has no `.hub/hub.json`. Open the Hub folder itself, or run the installer again.
- **The new row isn't in NAV.md.** Ask Claude to check `.hub/nav.json` is valid JSON, then regenerate the map again.
- **The project landed somewhere else.** Ask Claude to move it into `20-Coding/Projects`: copy first, check the copy, and remove the old one only after your yes.

## Done when

- [ ] You can say what each zone is for, and the five rules.
- [ ] `NAV.md` has a row you added.
- [ ] One messy folder is sorted into the zones, with nothing deleted.
- [ ] Your first project is in `20-Coding/Projects`, with its own `CLAUDE.md`, and on the map.

`guides/06-the-hub.md` has the rest: where projects live, the two things that differ from one computer to the next, and how to keep the Hub tidy.

When you've finished, tap **Mark done** at the top of this lesson, or ask Claude to run `node 50-AI/workspace/bin/work.js mark getting-started GS-10 done`.
