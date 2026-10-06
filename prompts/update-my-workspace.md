# Update my Workspace

WilsonWorks sends an update as one line to paste into a Claude Code chat opened on your Hub:

```
Update my Workspace with <the branch or tag>, following prompts/update-my-workspace.md.
```

The rest of this page is the procedure Claude follows. [Guide 9](../guides/09-updates.md) explains it
for people.

---

## For Claude

You are merging an update into the person's own copy of the WilsonWorks Workspace. Their pieces must come
through untouched: their settings, their agents, their Hub, their skills, and every change they saved on
their branch, `my-workspace`. Speak plainly, one step at a time, and wait for a yes before anything that
changes a file.

**Never**, in any step: `git reset`, `git push`, `--force` of any kind, `git checkout -- <file>` or
`git restore` on their files, `git clean`, `git stash`. No file of theirs is deleted or set aside. When
something does not fit this page, stop and ask.

`<update>` below is what the person named: a branch (`feature/<name>`) or a tag (`v2.2.0`).

### 1. Find the Workspace and check the ground (read only)

- The Workspace folder is `<Hub>/50-AI/workspace` (this chat is open on the Hub). Run every command below
  from there. If it has no `.git` folder, it is not a git copy: stop and say that updates need one
  (guide 1, "The by-hand way", makes one).
- `git remote get-url origin` should be `https://github.com/wilson-works/workspace.git` (with or without
  `.git`). If it is something else, say what it is and ask before going on.
- `git branch --show-current`:
  - `my-workspace`: good.
  - `main`, or a detached head: say "Your changes will live on a branch of your own, called
    my-workspace, from where you are now," and on yes run `git switch -c my-workspace`.
  - anything else: show it and ask which branch holds their changes.
- `git status --porcelain`. For each changed or new file that git tracks or would track, say in plain
  words what it is. Ask to save them on their branch first: `git add <those paths>` and
  `git commit -m "My changes before <update>"`. If they say no, stop: an update merges only into saved
  work. (Their settings, logo and own projects are ignored by git and never show here.)
- Note the starting point: `git rev-parse --short HEAD`. Say: "Before the update you are at <it>."

### 2. Fetch the update (changes no file)

- A branch: `git fetch origin <update>`. The update is then `origin/<update>`.
- A tag: `git fetch origin tag <update> --no-tags`. The update is then `<update>`.

If the fetch fails, say so in plain words (no internet, or no such branch or tag) and stop.

### 3. Show what it changes, and ask

- `git log --oneline HEAD..<the update>`: the update's commits. Retell them in a few plain lines.
- `git diff --stat HEAD...<the update>`: the files it touches.
- `git diff --name-only <the update>...HEAD`: the files they changed since they last took an update.
  Name any file on both lists: "You and the update both changed `<file>`. Git combines changes to
  different lines on its own; if you both changed the same lines, I'll stop and show you both."
- Ask: "Shall I merge it into my-workspace?"

### 4. Merge

`git merge --no-ff --no-edit <the update>`

- It finishes: go to step 6.
- It says CONFLICT: step 5.

### 5. When two changes meet

`git status` lists each file under "both modified". For each one, one at a time:

1. Show their side (HEAD, their branch) and the update's side in plain words: what each one changes,
   and why, from the commit messages.
2. Propose one version that keeps what they meant and adds what the update brings. For a JSON file in
   `config/`, keep both sets of entries, then check it still reads:
   `node -e "JSON.parse(require('fs').readFileSync('<file>','utf8'))"`.
3. On their yes, write it and `git add <file>`.

`dist/` (the built page) is the one exception: take the update's (`git checkout --theirs -- dist`, then
`git add dist`), and after the merge, if they changed anything in `src/ui/`, build the page again
(`npm install` once, then `npm run build`), check it opens, and commit `dist/` on their branch:
`git add dist` and `git commit -m "Rebuild the page with my look"`.

When every file is resolved: `git commit --no-edit`.

If they want to stop at any point: `git merge --abort`. Everything is back as it was before step 4.

### 6. Show the result

- `git log --oneline -3`, and the merge commit's short id: `git rev-parse --short HEAD`. Say it; going
  back needs it.
- `git diff --stat <starting point>..HEAD`: what the update changed.
- For each file they changed themselves (from step 3), show that their change is still there: the lines
  they added or changed, now in the file.

### 7. Run the installer again

`node install.js --dry-run`, then explain the plan: `+` is something the update needs, `=` already there,
`!` theirs, kept. On their yes, `node install.js --yes`. Then once more with `--dry-run`: it should end
"Dry run: nothing to change."

### 8. Check that everything still answers

- `node bin/office-start.js --restart`, then open the office (`http://127.0.0.1:<office.port>/`, 4316
  unless their settings say otherwise) and ask them to look: their office name, their colours, their
  desks.
- `node agents/bin/agent.js list`: every agent is running, with its door. One that is down:
  `node agents/bin/agent.js start <key>`.

### 9. Tell them, in five lines

What the update brought; that their changes and settings are still there; the merge commit; how to go
back; that the office and their agents answer. Going back is one line:
`git revert -m 1 --no-edit <the merge commit>` (a new commit that takes the update out and keeps
everything else), then step 7 and step 8 again.
