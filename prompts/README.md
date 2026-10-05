# The prompt library

Copy a prompt, change the parts in `<angle brackets>`, and paste it into a Claude Code chat opened
on the WorkSpace folder (or on a project, where it says so). Every prompt that changes something
asks Claude to show you the change first.

**Contents:** [Your settings](#your-settings) · [The office](#the-office) ·
[The CTO org](#the-cto-org) · [Specialists](#specialists) · [The Work page](#the-work-page) ·
[How sessions work](#how-sessions-work) · [Company use](#company-use)

---

## Your settings

**Run the setup again, or change one answer**

```
Set up my WorkSpace. I already have a workspace.config.json: show me my current answers in plain
words and ask which ones I want to change.
```

```
In workspace.config.json, change <the setting> to <the new value>. Show me the line before and after,
then tell me whether the office needs a restart for it.
```

**Rename the office**

```
Rename my office to "<new name>" and set the company name to "<company, or none>". Change only
brand.office_name and brand.company in workspace.config.json, then tell me where the new name shows.
```

**Your colours**

```
Make my office's orb match my brand. My colours are <describe them, or give codes>. Pick a lighter
and a darker #rrggbb for brand.colors, show me both codes, and save them when I say yes.
```

**Your logo, everywhere (bar, tab and Home Screen icons)**

```
Use my logo in the office. The file is <full path to the .svg or .png>. Copy it into a brand folder
in this WorkSpace and set brand.logo to it. Then make the Home Screen icons match: if it is an SVG,
copy it over public/favicon.svg, install @resvg/resvg-js in a temporary folder outside this repo,
run node tools/render-icons.mjs with --resvg pointing at it, run npm run build, and tell me how to
check the icon on my phone. Show me each step before you run it.
```

**Add a computer**

```
I want to add another computer to my office. Its short name will be <LAPTOP>. Walk me through
guides/02-tailscale.md for it one step at a time: what to do on this computer, what to do on the
new one, and how to check the new computer's chip turns green.
```

**Keep a folder private**

```
Sessions working in <folder> must never show their titles or tasks on the office or my phone. Add it
to privacy.private_work in workspace.config.json and tell me how to check it worked.
```

```
No session should ever read or touch <folder>. Add it to privacy.never_read in workspace.config.json,
show me the deny rules node bin/install.js permissions would add for it, and apply them when I say yes.
```

---

## The office

**Retire avatars you don't like**

```
Open the avatar gallery at http://127.0.0.1:4316/#/avatars with me. I'll tell you which emblems I
dislike; add their ids to "retired" in config/avatars.json so they are never handed out again.
```

**Session names from your own world**

```
Give this computer's sessions names from <a theme: mountains, jazz musicians, coffee drinks>. Add a
pool of 60 short one-word names to config/callsigns.json, set "callsigns" on this machine in
workspace.config.json to that pool, and restart the office.
```

**The idle nudge**

```
Change what the office says to a session that sits idle with nothing to do. Make it <your words>.
It is wake.nudge_text in config/thresholds.json.
```

**Words that are not code**

```
My business uses these names, which the office mistakes for code when sessions ask me questions:
<list>. Add them to config/plain-names.json.
```

**Change the look**

```
I'd like the office to feel more <warm / playful / minimal / like my brand>. Suggest three small
changes to src/ui/office.css (colours, rounding, spacing), show me each, make the ones I pick, run
npm run build, and tell me to reload the page.
```

---

## The CTO org

**Put the team in a project**

```
Install the CTO org into <full path of my project> with node bin/install.js org. Show me the plan
first. After I say yes, apply it, then open that project's .claude/agents/org.config.json and set
each department's folders to match how that project is laid out. Show me before you save.
```

**Give the team work** (in a chat opened on the project)

```
Use the cto-james agent. Direction: <what you want>. Route it through Tim to the right department,
have John review before anything is final, and give me James's three-line report at the end.
```

**Rename an agent**

```
In <project>, rename <old name> to <new name> everywhere: the agent file and its name line, every
other agent that mentions them, the ACL, ROLE_OF and DEPARTMENT_OF tables in .claude/comms/comms.py,
DEPARTMENT_OF in .claude/hooks/path_guard.py, and org.config.json. Then update the roster in my
WorkSpace's config/org-people.json. List every file you will change before you change any.
```

**Change a voice**

```
In <project>, make <agent> <more formal / warmer / blunter / funnier>. Change only the "Your voice"
section of their agent file, keep their job the same, and show me the before and after.
```

**Add a department**

```
Add a <department, e.g. mobile or data> department to the org in <project>: a head and two juniors
with names, voices and jobs that fit the rest of the team. Update comms.py (ACL, ROLE_OF,
DEPARTMENT_OF), path_guard.py, org.config.json with the folders it owns, Tim's file so he routes to
it, and my WorkSpace roster in config/org-people.json. Show me the new agents before saving.
```

**A smaller team**

```
My project is small. Shrink the org in <project> to <who you want to keep>. Remove the others'
files and their entries in comms.py, path_guard.py and org.config.json, tell Tim who is left, and
update my WorkSpace roster.
```

**The team for personal use**

```
I use Claude for personal projects, not a software company. Keep the org's structure but rewrite
James's and Tim's files so they talk to me as <how you want to be addressed> and plan my
<kind of personal projects>. Show me the changes first.
```

---

## Specialists

A specialist is one agent for one kind of recurring work, with its own fences (what it never does),
its own workflow skills and its own reference notes. Lesson GS-09 builds your first one.

**Build one** (the long version is in lesson GS-09)

```
Interview me, one question at a time, about a job I do over and over: <the job>. Then build a
specialist agent for it: an agent file in ~/.claude/agents with a name, a voice, what it owns, what
it must never do, and how it checks its own work; two or three workflow skills in ~/.claude/skills,
each one repeatable job with clear steps and a "done when"; and a reference notes file with the
facts about my work it needs, each with where it came from. Show me everything before you save it.
```

**Teach it from a mistake**

```
My specialist <name> got this wrong: <what happened>. Find the line in its agent file or skills that
let it happen, propose one small change that would have prevented it, and show me before saving.
Add the case to its reference notes so it doesn't happen again.
```

**Give it a new skill**

```
Add a workflow skill to <name>: <the job>. Write it in ~/.claude/skills/<name>-<job>/SKILL.md with
clear steps, the checks it does, and a "done when". Then do one practice run on a made-up example
and show me the result.
```

**Give it a teammate**

```
<name> needs a teammate for <the part it is bad at>. Design a second specialist for that part, set
out who hands what to whom, and update both agent files so they work together. Show me first.
```

**Put it in the office**

```
Add my specialist <name> (agent file <slug>.md) to the roster in config/org-people.json. Give it an
office in the Agents' wing: an entry in config/agents.json with its name, title, one-line job,
status, the machine it runs on, match words, and brand colours that suit it (and its logo in
public/agents/ if I have one). Then make a Work project for it in projects/<slug>/ with a PROJECT.md
and its first three real orders as steps. Show me each file before saving.
```

**Give its office a door to its dashboard**

```
My specialist <name> has a dashboard at <http://127.0.0.1:port/path> on <machine>. Set door.local to
that address in its config/agents.json entry, and a probe on that port with a path that does not
hand out a login token (the home page is usually right). If I want it on my phone too, walk me
through publishing it with tailscale serve on another port, then set door.phone to that address.
```

---

## The Work page

**A project from a to-do list**

```
Turn this into a project on my Work page: <paste your list>. Make projects/<short-name>/PROJECT.md
(kind: project) and one step file per item in projects/<short-name>/steps/, numbered, each with an
id, a title, a "Why", a "What to do" and a "Done when" checklist.
```

**Your own course** (to train a teammate the way this course trains you)

```
Write a short course for my Work page that teaches <who> how to <what>. Use projects/getting-started
as the model: kind: course, five lessons, each with "What you'll get", "Do this" with the prompts to
paste, "What you should see", "If something's off" and "Done when". Put it in
projects/<short-name>/ and keep it plain English.
```

**Where am I**

```
Run node bin/work.js list and tell me what I've finished, what is next, and how long it should take.
```

---

## How sessions work

**Add the workflow rules to every chat**

```
Show me permissions/CLAUDE.workflow.md, replace <workspace> in it with this folder's full path, and
after I say yes, add it to the end of my ~/.claude/CLAUDE.md without changing what is already there.
```

**A night run that keeps going**

```
I'm leaving this project to run on its own until <time>. Turn on walkaway mode in it until then
(.claude/WALKAWAY with until=YYYY-MM-DDTHH:MM), then work through <the task or the Work project>
step by step. Ask me anything you need on the office with ask-owner, keep going on other steps while
you wait, and write .walkaway/EXIT with one line when you are truly done.
```

**Always ask before a deploy**

```
I deploy with <your command>. Add it to the ask list in my user settings so it always asks me, even
in bypass mode, and show me the rule first.
```

---

## Company use

**A teammate's own office**

```
Write a one-page guide for a new teammate to set up their own WorkSpace from this repo: clone it,
run "set up my WorkSpace" with their own name and computer, install the hooks, and join our tailnet
as a spoke of <hub machine>. Leave out anything from my own workspace.config.json.
```

**Who can reach the hub**

```
Other people share our Tailscale account. Help me write an access rule so only <my devices / these
people> can reach the office on <hub machine>, following https://tailscale.com/kb/1018/acls.
Explain it in plain words before I paste it into the admin console.
```

**Company brand in one go**

```
Brand my office for <company>: set the office name, the company name, our two brand colours and our
logo (file at <path>), make the Home Screen icons match, and add our product names to
config/plain-names.json. Show me each change before you make it.
```
