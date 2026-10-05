---
id: GS-08
title: Make the team yours
minutes: 20
---
The org is a set of plain text files, so you change it by asking Claude. You can rename an agent, change how one talks, add a department your work needs, or drop one it doesn't. This lesson walks through the common changes and keeps the office's name list in step, so the floor shows the right names.

## What you'll get

- An org that fits your work: the names, voices and departments you want.
- File ownership that matches one of your own repositories.
- The office naming sessions correctly after your changes.

## Do this

**1. Learn how the org is put together.** In a chat in the WorkSpace folder, paste:

```
Read guides/05-the-org.md and prompts/README.md. In one short paragraph, tell me how the org is put together: where each agent is defined, how the comms bus works, and how the path guard decides who owns which files. Then list the prompts in prompts/README.md that change the org, with one line each on what they do.
```

**2. Pick a folder to work on.** Practice in `tip-splitter` from GS-07, or install the org into one of your real repositories the same way:

```
Run node bin/install.js org --into "<full path of my repository>" without --apply, and explain what it would add. Ask me, and after I say yes, run it again with --apply.
```

**3. Make your changes.** Open a chat in that folder. Use the prompts from `prompts/README.md`, or adapt the ones below. Make one change at a time, and check it before you make the next.

To rename an agent:

```
Rename the frontend head from Gavin to <new name> everywhere in this folder's org: his agent file, every other agent that mentions him, and org.config.json. Keep his job and his juniors the same. Show me every change before you save it.
```

To change a voice:

```
Change Tim's voice: he should write shorter messages, lead with what changed, and skip the pep talk. Edit only the part of his agent file that describes how he talks. Show me before and after, and save it after I say yes.
```

To drop a department your work doesn't need:

```
This repository has no database. Remove the database department (Diana, Leo and Nora) from this folder's org: their agent files, their places in org.config.json, and any mention of them in other agents. Show me the full list of changes first.
```

To add a department:

```
Add a documentation department: a head named <name> with two juniors named <name> and <name>. They own everything under docs/. Set them up the same way as the other departments: agent files, org.config.json, the comms bus and the path guard. Show me everything before you save it.
```

To match file ownership to your repository:

```
Look through this repository's folders and propose which department should own which folders and files, based on what each one holds. Show me the plan as a table with three columns: folder, department, reason. Change org.config.json only after I approve the plan.
```

**4. Keep the office in step.** The office names sessions from the roster in `config/org-people.json`, in the WorkSpace folder. Each line pairs an agent's file name (without `.md`) with the name it goes by, and `gate` names the person who reviews changes:

```
"roster": {
  "cto-james": "James",
  "head-frontend-gavin": "Gavin"
},
"gate": "John"
```

After you rename or add an agent, paste this into a chat in the WorkSpace folder:

```
I changed my org in <full path of the folder>. Update config/org-people.json so its roster matches: add any new agents, and change the names of any I renamed. Don't remove an agent unless no folder of mine uses it any more. Keep everything else in the file as it is. Show me the change, save it after I say yes, and restart the office so it uses the new names.
```

**5. Check it.** Give a renamed or new agent a small job, and watch the floor:

```
Ask <new name> to look at one file in this folder and suggest one small improvement, without changing anything. Then tell me what they said. When that's done, mark GS-08 done by running node bin/work.js mark getting-started GS-08 done from my WorkSpace folder.
```

## What you should see

- Every change shown to you before it was saved.
- The new names in the agents' messages on the comms bus.
- The office floor using the new names.

## If something's off

- **The floor still shows an old name.** The roster in `config/org-people.json` wasn't updated, or the office hasn't restarted since. Run the step 4 prompt again.
- **An agent still calls someone by an old name.** Ask Claude to search the whole org for the old name and show you every place it's left.
- **Edits get blocked after you changed ownership.** The path guard is following the new rules. Ask Claude which rule blocked the edit, and fix the ownership if the rule is wrong.
- **You want to undo a change.** If the folder is a git repository, every change is in its history. Ask Claude: "Show me the org changes since yesterday and undo the one I name." The original org is kept in the `org` folder of WorkSpace, so Claude can also compare yours with it.

## Done when

- [ ] You made at least one change to the org: a name, a voice, a department or the file ownership.
- [ ] `config/org-people.json` matches your org.
- [ ] The office floor shows the right names.

When you've finished, tap **Mark done** at the top of this lesson, or ask Claude to run `node bin/work.js mark getting-started GS-08 done`.
