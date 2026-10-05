# Projects

The **Work** page in your office reads this folder. Every folder here with a `PROJECT.md` inside becomes a project on the page, with a ring showing how much is done. A project shows its steps in three lists, To do, Doing and Done; a course shows its lessons in order, with the next one to take. Click a step to open it as a page.

Two projects ship with WorkSpace:

| Folder | What it is |
|---|---|
| `getting-started` | The Get started course: nine lessons, from your first note to your first specialist agent. |
| `demo-app` | A tiny practice app with four work orders for the CTO org. |

## How a project is laid out

```
projects/
  my-project/
    PROJECT.md
    steps/
      01-first-step.md
      02-second-step.md
```

`PROJECT.md` describes the project. Each file in `steps/` is one step. In a course a step is a lesson. In a project a step is an order: one piece of work to hand to Claude or the team.

### PROJECT.md

```
---
name: Get started
summary: One sentence shown under the project name.
kind: course
order: 1
---
What this project is, shown at the top of the project page.
```

- `name`: the project's name on the Work page.
- `summary`: one sentence shown under the name.
- `kind`: `course` (its steps are lessons) or `project` (its steps are orders).
- `order`: where it sorts on the Work page. Lower numbers come first.

Everything after the second `---` is the project's description. It's written in Markdown: plain text with a few marks for headings, lists and bold.

### A step

```
---
id: GS-01
title: Welcome to your office
minutes: 10
---
The step itself, in Markdown.
```

- `id`: a short code, unique within the project. It shows on the step's card.
- `title`: the step's name.
- `minutes`: roughly how long it takes. Courses only; leave it out of orders.
- `who` (optional): who owns the step, shown on its card. Handy for orders, like `who: Gavin (frontend)`.
- `status` (optional): where the step starts, `todo`, `doing` or `done`. Leave it out and the step starts in To do.

Steps are listed in file-name order, so start each file name with a two-digit number (`01-`, `02-` and so on).

Each value runs to the end of its line. Anything after a space and a `#` is treated as a note and dropped. Put quotes around a value that has a colon in it, like `title: "Capstone: your first specialist"`, so other Markdown tools read it correctly too.

## What a step page can show

Headings, paragraphs, bullet and numbered lists, checkboxes (`- [ ]`), code blocks fenced with three backticks (each one gets a **Copy** button), inline code, **bold**, tables, and links that start with http, https or mailto.

It doesn't show raw HTML, images or italics.

A few habits keep pages looking right:

- A code block between numbered list items restarts the numbering. When a step has code in it, start each step as its own paragraph with a bold number, like `**1.**`, instead of using a numbered list.
- Don't indent a code block under a list item. Start the three backticks at the left edge.
- A blank line ends a list, and lists don't nest. Keep each list together.
- Write a file path as inline code. Links work only for web and email addresses.

## Track progress

Tap **Doing** or **Mark done** on a step's page, or have Claude run these from the WorkSpace folder:

```
node bin/work.js list
node bin/work.js show getting-started
node bin/work.js mark getting-started GS-01 done
```

`list` shows every project and where it stands, and `show` lists one project's steps. `mark` takes the project's folder name, the step's id, and then `todo`, `doing` or `done`.

The office keeps your marks on its own and never writes into your project files, so a mark doesn't change anything here.

## Add your own project

1. Make a folder here named for the project, in lowercase with dashes, like `client-onboarding`.
2. Add a `PROJECT.md` with `kind: project` and the next free `order` number.
3. Add a `steps` folder with one file per order.

Or ask Claude to do it:

```
Create a new Work project in projects/ called <name>, following the format in projects/README.md. It's a project, not a course. Ask me what the first three orders are, one at a time. For each order, write the sections Why, What to do, Done when (as a checklist) and Who. Show me the files before you save them. When they're saved, run node bin/work.js list so I can see the project.
```

A good order says why the work matters, what to do, how anyone can tell it's finished, and who should own it. The Demo app's orders in `demo-app/steps/` are examples.

## Your projects stay private

Git tracks only this README, `getting-started` and `demo-app` in this folder. The repository's `.gitignore` leaves every other folder in `projects/` out, so your own projects, which may name clients or private work, are never pushed by accident when you update or share WorkSpace.

You can also keep projects outside this repository altogether. List the folders that hold them under `work_folders` in `workspace.config.json`, and the Work page shows their projects beside these ones.

For work that must stay off the screen, add its folder to `privacy.private_work` in `workspace.config.json` (the setup interview in GS-02 asks about this). The Work page then lists that project's steps by id only and doesn't show their text. You open those steps in your editor instead.

To back up your own projects, copy them somewhere private, or keep them in a separate private repository.
