---
name: Demo app
summary: A tiny tip-splitting app the CTO org practices on, with four real work orders.
kind: project
order: 2
---
The Demo app is practice for your CTO org. You use it in lesson GS-07 (Meet your team).

It's a small page called Tip splitter. You type a bill, a tip and how many people are paying, and it tells each person what to pay. The code is in `projects/demo-app/starter/`: three small files, with nothing to install.

Don't work on it here. Copy it to your own code folder as a new git repository, install the org into that copy, and give these orders to James. GS-07 walks you through it.

The app has one bug on purpose. Order DA-02 describes what a user sees, not the fix, so the team has to find the cause.

| Order | What it is | Who |
|---|---|---|
| DA-01 | A small feature: quick tip buttons and a tip line | Gavin, frontend |
| DA-02 | A bug a user reported | Gavin, frontend |
| DA-03 | Tests for the bill math | Rachel, QA |
| DA-04 | Polish the look and make it usable for everyone | Gavin, frontend |

Who owns what (you set this up in GS-07): `index.html`, `style.css` and `app.js` belong to Gavin's frontend team, and `tests/` belongs to Rachel's QA team. There's no server, database or API in this app, so Cindy, Diana and Josh sit this one out.

Mark an order's progress from its page, or from the WorkSpace folder:

```
node bin/work.js mark demo-app DA-01 doing
```
