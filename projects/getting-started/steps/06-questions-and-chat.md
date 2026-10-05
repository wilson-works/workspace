---
id: GS-06
title: Questions and the group chat
minutes: 15
---
Sometimes a session needs a decision only you can make. Instead of waiting in a chat you may not be looking at, it puts the question on the office's **Questions** tab, together with what it would do. You answer with one tap, from your computer or your phone.

The **Chat** tab is the other half: one group conversation between you and every running session.

## What you'll get

- A question asked by a session, answered by you with one tap.
- A look at why technical questions are turned away.
- A message from you to every session at once, and a post from a session.

## Do this

**1. Have a session ask you something real.** In a chat in the WorkSpace folder, paste:

```
I want to practice the Questions tab. Pick a small real decision about my WorkSpace setup, such as whether the office should start by itself when I log in. Ask me on the office with node bin/ask-owner.js, written the way you'd ask someone who doesn't code, with your recommendation after --recommend. Run it with --wait in the background so you're woken when I answer. When my answer comes back, tell me what you'd do next, but don't change anything yet.
```

**2. Answer it.** Open the **Questions** tab in the office, or on your phone. You'll see the question and the session's recommendation, with three choices:

| Choice | What it means |
|---|---|
| Go with it | Do what you recommended. |
| Let the org decide | I don't need to decide this one. Let the team of agents settle it. |
| Answer myself | Type your own answer. |

The org is the team of 18 Claude agents that ships with WorkSpace. You meet it in GS-07.

**3. Watch the answer arrive.** Your answer goes back to the session as a note, and the session carries on from there.

**4. See a technical question refused.** Paste:

```
Now try to ask me this on the office, exactly as written, and show me what happens: node bin/ask-owner.js "Should fetchUser in api/users.js retry after a timeout?" --recommend "Yes, three retries"
```

The office turns it away, with a message telling the session to take it to the org. Engineering questions go to John, the Chief Engineer.

**5. Understand why.** You're the owner. A question for you should be about a choice and what happens either way, in words anyone would understand. A question with file names, code or jargon is an engineering question, and the org can answer it without you. That keeps your Questions tab short, and every question on it is one only you can answer.

Two more rules keep questions quick to answer: each one must be under 300 characters, and each one must come with a recommendation, so you can say yes with one tap.

**6. Talk to everyone at once.** Open the **Chat** tab and send:

```
Hello team. Reply with one sentence about what you're working on.
```

Every running session gets your message as a note.

**7. Have a session post.** In a chat, paste:

```
Post a short hello in the office group chat with node bin/office-say.js, saying in one sentence what you're working on. Then tell me whether it posted.
```

## What you should see

- Your question on the Questions tab with the session's recommendation, and the question leaving the tab once you answer.
- The session picking up your answer and saying what it would do next.
- The technical question refused, with a message sending it to the org.
- Your message on the Chat tab, then posts from your sessions.

## If something's off

- **A plain question was refused.** The message says what looked technical, such as a slash between words or a word with a capital letter in the middle. Ask the session to reword it and try again.
- **A session didn't post in the chat.** The chat has limits so sessions don't flood it: up to 500 characters a post, and at most one post a minute and six an hour from each session. A session also waits a minute after a group message that wasn't meant for it. The refusal says when it can post again.
- **Sessions didn't reply to your message.** Sessions reply when they're addressed, asked or affected. An idle session wakes to read your message; a busy one reads it the next time it uses a tool.
- **Your answer didn't reach the session.** Type anything in that session's chat. The note is handed over along with your message.

## Done when

- [ ] A session asked you a question, and you answered it from the Questions tab or your phone.
- [ ] You saw a technical question refused, and you know why.
- [ ] You posted on the Chat tab, and a session posted too.

When you've finished, tap **Mark done** at the top of this lesson, or ask Claude to run `node bin/work.js mark getting-started GS-06 done`.
