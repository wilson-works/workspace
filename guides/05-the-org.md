# 5. The CTO org: your software team

WorkSpace ships with an 18-agent software team, the same one published in the free
`claude_skills` pack as `agent-org`. Each agent is a Claude subagent with a name, a voice and a job.
They talk over a small message bus with walls between the tiers, and a hook keeps each department
to its own files.

```
                         You (the CEO)
                              │
                     James · CTO (strategy, go / no-go)
                       ┌──────┴───────┐
           John · Chief Engineer    Tim · Exec Assistant
           (reviews every change)   (routes the work)
                                      │
     ┌──────────┬──────────┬──────────┼──────────┐
   Cindy      Gavin      Diana      Rachel     Josh        department heads
   backend    frontend   database   QA         API
   Marcus     Ava        Leo        Owen       Felix       juniors
   Priya      Kai        Nora       Maya       Zara
```

- **Direction flows down**: you tell James what you want; James gives Tim and John their part; Tim
  hands work to the right department head; the head gives it to a junior.
- **Finished work flows up through John.** He is off the chain of command on purpose, so no head
  approves their own team's work.
- **Three channels**: `c-suite` (James, John, Tim), `dept-heads` (Tim and the five heads),
  `dev-floor` (heads and juniors). A junior cannot post to the CTO; the bus refuses it.

## Put the team in a project

The team works inside one code project (a git repo). From the WorkSpace folder:

```
node bin/install.js org --into "C:\path\to\your-project"           # the plan
node bin/install.js org --into "C:\path\to\your-project" --apply   # do it
```

It copies into that project:

| | |
|---|---|
| `.claude/agents/*.md` | the 18 agents (your name goes into James's file) |
| `.claude/comms/comms.py` + `schema.sql` | the message bus; its database `.claude/comms.db` is made on first use |
| `.claude/hooks/path_guard.py` | the department guard, registered in the project's `.claude/settings.json` |
| `.claude/agents/org.config.json` | which folders each department owns: **edit this to match your repo** |

Your edits are safe: a file you changed is left alone unless you add `--force`.

Then set the department folders. Open a chat in that project and paste:

```
Read .claude/agents/org.config.json and this repo's folder layout. Set each department's "owns"
folders to match where this repo really keeps its backend, frontend, database, tests and API code.
Show me the change before you save it.
```

Check the bus: `python .claude/comms/comms.py whoami james` should say James is on `c-suite`.

## Give the team work

In a chat in the project:

```
Use the cto-james agent. Direction: <what you want, in a sentence or two>. When the team is done,
give me James's three-line report: what shipped, what is blocked, what is next.
```

On the office you will see your session at its desk with the agents as **helpers** walking in and
out: James, then Tim, then a head and a junior, each with the task it was given. Nothing merges
without John.

Their messages to each other stay in the project's bus. Read them in a terminal in the project:

```
python .claude/comms/comms.py read c-suite james --limit 20
python .claude/comms/comms.py read dept-heads tim --limit 20
python .claude/comms/comms.py read dev-floor cindy --limit 20
```

(When you run several sessions in parallel as lanes of one run, the office does draw their bus
messages as lines between their desks, and lists them in each session's panel.)

The Get started course does this with the Demo app (lesson GS-07).

## Make the team yours

Everything about an agent is in its file. The prompt library (`prompts/README.md`, "The CTO org")
has a prompt for each change; the parts each change touches are:

| Change | What has to change together |
|---|---|
| A voice or a habit | only that agent's `.md` file |
| A name | the agent's file (its `name:` line and its text), every other agent file that mentions it, `comms.py` (the `ACL`, `ROLE_OF` and `DEPARTMENT_OF` tables), `path_guard.py` (`DEPARTMENT_OF`), `org.config.json`, and the office's `config/org-people.json` roster |
| A new department | a head and juniors (new files), the same tables in `comms.py` and `path_guard.py`, a department in `org.config.json`, Tim's file (he routes to it), the roster |
| A smaller team | remove the files, the table entries and the department; tell Tim |

Keep the WorkSpace's own copy in `org/` as the template, and change the copy inside each project.

## Beyond software: specialists

The CTO org builds software. Your own recurring work, such as bookkeeping, content, client
onboarding or research, gets a **specialist**: one agent with its own fences, its own workflow
skills and its own reference notes. Lesson GS-09 builds your first one. Add it to the roster in
`config/org-people.json` so the office names its sessions.

## If something's off

- **"unknown agent"** from the bus: the name is not in `comms.py`'s tables. Renames must change both.
- **"ACL DENY"**: working as designed. That agent is not on that channel; route through Tim.
- **An edit is blocked by the path guard**: another department holds a claim on that path, or the
  folder belongs to another department in `org.config.json`. Fix the folders, or ask the right head.
