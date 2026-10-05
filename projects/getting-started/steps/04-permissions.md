---
id: GS-04
title: Let it work without babysitting
minutes: 20
---
By now you've seen Claude ask "may I run this?" many times. Those questions are permission prompts. They keep you in control, but a long job stalls every time Claude waits for your yes. This lesson sets things up so routine work goes through, risky work still stops for you, and the worst commands are blocked outright.

## What you'll get

- A **deny list**: commands Claude may never run, like ones that destroy work.
- An **ask list**: commands that always need your yes, like deploys (publishing an app to the live internet).
- **Walkaway mode**: a switch you turn on in one project so a session can keep working while you're away.
- A backup of your old settings, made before anything changes.

## Do this

**1. Look before you change anything.** In a chat in the WorkSpace folder, paste this:

```
Run node bin/install.js permissions without --apply, so it only shows the plan. Then explain it to me in plain words: what goes on the deny list, what goes on the ask list, what the walkaway hooks do, and which settings files it would change. Don't change anything.
```

The plan also turns the never-read folders you named in GS-02 into deny rules, so no session can open or change them, and it refuses wholesale deletes of your code folders.

**2. Weigh the trade-offs.** Read these before you decide:

- **Prompts on, as now.** Safest, and slowest. Long jobs stop and wait for you.
- **This setup applied.** The guard rails go in: commands on the deny list are refused in every mode, and commands on the ask list always stop for your yes. On its own it doesn't remove the everyday prompts. Those go away three ways: walkaway mode in one project (step 6), bypass mode (below), or answering a prompt with the option that tells Claude not to ask again for that command.
- **Bypass mode.** Claude Code also has a mode, called Bypass permissions, where Claude acts without asking you at all. This setup doesn't turn it on; it's a separate switch you turn on yourself. With it on, the deny list and the hooks are the only guard rails. Use it only in folders where every change can be undone, such as a code folder tracked by git (the tool that keeps a history of every change). `guides/03-permissions.md` explains when it makes sense.
- **No list catches everything.** A deny list blocks the commands on it, not every possible way to do damage. Keep backups of anything you can't afford to lose.

**3. Apply it.** When you're happy with the plan, paste:

```
Apply the permission setup with node bin/install.js permissions --apply. Tell me where it saved the backup of my old settings and how I'd put them back if I wanted to. Then tell me to close this chat and open a new one.
```

**4. Start a new chat.** Settings are read when a chat starts, so the new rules apply from the next chat on.

**5. Check the guard rails.** In the new chat, paste:

```
Read your current permission settings and tell me in plain words, without trying any of these, what would happen if you were asked to: force push over a shared code history, delete a folder and everything in it, deploy an app, and edit a file in this folder. When you're done, list which of those you'd do on your own, which would stop to ask me, and which are blocked.
```

**6. Try walkaway mode.** Walkaway mode is a file named `WALKAWAY` inside a project's `.claude` folder. While it's there, a session in that project may do everything except the actions that can't be undone: force pushing, deleting repositories, deploying, deleting everything under a top-level folder, and editing your Claude settings.

A walkaway session also may not end its turn with nothing scheduled. Before it stops, it has to leave something set up to wake it again, so it keeps working instead of sitting idle while you're out.

The first line of the file can say when walkaway mode ends: `until=` followed by the date and time, like `until=2026-11-02T18:00`. Practice in the WorkSpace folder:

```
Turn on walkaway mode in this folder until 6 pm today. Create .claude/WALKAWAY with one line: until= followed by today's date and 18:00, in the form YYYY-MM-DDTHH:MM. Then tell me in plain words what you're now allowed to do on your own, what you still can't do, and how I turn it off. Don't start any other work.
```

**7. Turn it off.** Delete the file, or paste:

```
Turn off walkaway mode in this folder by deleting .claude/WALKAWAY, and confirm it's gone.
```

## What you should see

- The plan printed before anything changed, and Claude's plain-words summary of it.
- The same everyday "may I?" questions as before, until you turn on walkaway mode or bypass mode. The guard rails are what changed.
- Claude telling you that force pushing, deleting whole folders and deploying are blocked or need your yes.
- The `WALKAWAY` file appearing in the `.claude` folder, then going away.

## If something's off

- **The plan says Python 3 was not found.** The walkaway hooks are written in Python. Install Python 3 (the message says where from), then run the plan again. The deny and ask lists work without it.
- **Nothing changed in the new chat.** Check the apply step finished without errors and that you opened a new chat. Ask Claude to show you the settings file the installer changed.
- **Claude still asks about everyday commands.** That's expected in a normal chat. Walkaway mode (step 6) or bypass mode takes the prompts away; the deny and ask lists still apply either way.
- **You want your old settings back.** Ask Claude to run node bin/install.js permissions --remove, which takes this setup back out, or to restore the backup made in step 3. Then open a new chat.
- **A walkaway session stopped early.** Check the `until=` line. The date and time must be in the future, written as YYYY-MM-DDTHH:MM.

## Done when

- [ ] You read the plan and understood each part.
- [ ] You applied it, or chose not to for a reason you can name.
- [ ] You know where the backup of your old settings is.
- [ ] You turned walkaway mode on and off once.

When you've finished, tap **Mark done** at the top of this lesson, or ask Claude to run `node bin/work.js mark getting-started GS-04 done`.
