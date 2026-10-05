---
id: GS-05
title: Reach it from anywhere (optional)
minutes: 30
---
So far your office only opens on this computer. In this lesson your phone, and any other computers you use, join it through Tailscale: an app that links your own devices into a private network that only they can join. Your office stays off the public internet, but your phone can open it, and it buzzes when a session has a question for you.

This lesson is optional. Skip it if you use one computer and don't need the office on your phone. You can come back to it any time.

## What you'll get

- Your office on your phone, as an icon on its Home Screen.
- A buzz on your phone when a session asks you a question.
- Optional: a second computer's sessions on the same floor.

## Do this

**1. Have Claude walk you through the guide.** The steps are in `guides/02-tailscale.md`. Some happen on this computer, some on your phone, and some in a web browser.

Do this on your hub: the computer that's switched on the most. The hub keeps the group chat, and it's the one your phone and other computers talk to. In a chat in its WorkSpace folder, paste this:

```
Walk me through guides/02-tailscale.md one step at a time. Before each step, tell me in one or two sentences what it does and why. Wait for me to say "done", then check that it worked before moving on. If a step is something you can run on this computer, ask me first, then run it. At the end, tell me the exact address to open on my phone.
```

**2. Open the office on your phone.** With Tailscale on and connected on your phone, open the address Claude gave you in your phone's browser. You should see the same floor as on your computer.

**3. Add it to your Home Screen.** On an iPhone, tap the Share button, then Add to Home Screen. On other phones, open the browser's menu and choose Add to Home screen or Install. From now on, open the office from that icon.

**4. Turn on the buzz.** Open the office from the Home Screen icon and tap the bell in the bar at the top. Allow notifications when your phone asks. On an iPhone this only works from the Home Screen icon, not from the browser.

**5. Test it.** Back on your computer, paste:

```
Ask me a test question on the office with node bin/ask-owner.js "Did your phone buzz when this question arrived?" --recommend "Yes, so tap Go with it if it did". When my answer comes back, tell me what I chose.
```

Your phone should buzz within a few seconds. Tap the notification to open the Questions tab, and answer there. Your answer comes back to the session on your computer as a note.

**6. Add a second computer (optional).** On the other computer, install WorkSpace with `guides/01-install.md`, install Tailscale and sign in with the same account. Then open a chat in that computer's WorkSpace folder and paste:

```
This is my second computer. Walk me through the part of guides/02-tailscale.md about adding another computer to my office, one step at a time, and check each step worked before moving on. When we're done, tell me the name this computer will show on the office floor.
```

## What you should see

- The office on your phone, opened from its own Home Screen icon.
- A notification on your phone when the test question arrived, and the Questions tab opening when you tapped it.
- Your answer arriving in the chat on your computer.
- With a second computer: its sessions on the floor too, tagged with its name, within about 15 seconds.

## If something's off

- **The phone can't open the office.** Check that Tailscale is on and connected on both devices, signed in to the same account, and that your hub computer is awake. A sleeping computer can't show the page.
- **No buzz on an iPhone.** Open the office from the Home Screen icon, not the browser, and tap the bell again. Check that notifications are allowed for it in the phone's Settings.
- **No buzz at all.** Only questions that arrive after you turn the bell on cause a buzz, and questions that land within two minutes of each other share one buzz. Ask a fresh test question.
- **The second computer's sessions don't appear.** Ask Claude on that computer: "Check the office's log files and tell me in plain words why this computer can't reach my main office."
- **You're stuck partway through the guide.** Tell Claude exactly what you see on the screen. It can't see your phone, so describe it.

## Done when

- [ ] The office opens on your phone from a Home Screen icon.
- [ ] Your phone buzzed for the test question, and you answered it from the phone.
- [ ] (Optional) A second computer's sessions show on the floor.

When you've finished, tap **Mark done** at the top of this lesson, or ask Claude to run `node bin/work.js mark getting-started GS-05 done`.
