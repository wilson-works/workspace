# The Hub

The Hub is one folder on each computer that holds all your work. Inside it are numbered zones, a short rule book
(`CLAUDE.md`) and a plain-English map (`NAV.md`). Claude reads the rule book and the map, so it finds things the way
you would, and every computer you use is laid out the same way.

```
<Hub>/
  CLAUDE.md        the rules every Claude session here follows
  NAV.md           the map: plain English to path (made for you; do not edit it)
  .hub/hub.json    marks this folder as the Hub: this computer's name and role, and where its code lives
  .hub/nav.json    the map's plain-English rows (yours to edit)
  00-Inbox/        downloads and anything not sorted yet; emptied every week
  10-Business/     one folder per company or client: its documents, never its code
  20-Coding/       Projects/ holds one git clone per project; _Caches/ holds package caches
  30-Media/        photos, video, music, brand files; new media comes in through _Ingest/
  40-Personal/     personal documents and media
  50-AI/           the office (workspace/), the skills pack, your agents (agents/), fleet-ops/
  90-Archive/      cold storage; _DumpQueue/ holds what waits for your yes to be deleted
```

Each zone has a `README.md` that says what goes there, what never does, and one example.

## The commands

Run them from the workspace folder (`50-AI/workspace` in your Hub):

| To | Run |
|---|---|
| Make a Hub, or add what is missing to yours | `node hub/bin/hub.js init --root <folder> --machine DESK --role command --owner Alex` |
| See what that would do, writing nothing | add `--dry-run` |
| Rebuild the map after you add things | `node hub/bin/hub.js nav` |
| Start a new code project | `node hub/bin/hub.js new-project garden-planner` |
| Check the Hub for anything out of place | `node hub/bin/hub.js doctor` |
| See where the Hub is and how it was found | `node hub/bin/hub.js where` |

`init` prints one line per thing: `+` it adds it, `~` it changes it, `=` it is already there, `!` yours is different,
so it is kept. It never replaces a file of yours unless you say yes when it asks; with `--yes` the answer is always
no. Run it twice and the second run changes nothing.

## How Claude finds its way (the navigation rules)

1. **Read `NAV.md` first.** It turns "my code", "stuff to sort" or a company's name into a path.
2. **Bounded paths only.** Never a recursive search or listing from the Hub root, a drive root or the user folder.
   Find the zone in `NAV.md`, then work inside that one folder. `NAV.md` itself is made the same way: it lists each
   zone and the folders directly inside it, and never looks deeper.
3. **The map is made, not written.** `hub nav` builds `NAV.md` from `.hub/nav.json`, plus one row for every project in
   the code zone (with its GitHub name), every company folder in `10-Business` and every agent in `50-AI/agents`. It
   rewrites the file only when something changed. To add a row of your own, edit `.hub/nav.json` and run `hub nav`.
4. **Each project has its own short `CLAUDE.md`.** `hub new-project` writes one from a template: what the project is,
   how to run, build and check it, where things are, its branch rules, and what not to touch. It adds to the Hub's
   rules and never contradicts them. Keep it short: delete anything Claude can read from the code.
5. **Two values may differ from one computer to the next, and only two:** the Hub root, and the code zone
   (`20-Coding/Projects`, or `20-Coding/Active` on a computer that only keeps the branches it is working on). No script
   writes either one into its code. `hub/lib/root.js` finds the root each time (the `HUB_ROOT` variable, else walking
   up from the current folder to `.hub/hub.json`, else the usual places such as `~/Hub` or `<drive>:\Hub`) and reads the code
   zone from `.hub/hub.json`. If it finds nothing, it stops and says where it looked.
6. **Everything has a home.** Code in the code zone, business files in `10-Business/<Company>/`, never mixed. A file
   whose home you do not know goes to `00-Inbox/`, never into a "misc" or "sort later" folder.

## What the doctor checks

`hub doctor` changes nothing. It checks that `.hub/hub.json` is there and complete, that every zone and `CLAUDE.md`
are there, and that `NAV.md` still matches the Hub. A `NAV.md` that no longer matches is stale once it is more than 8
days old; one that still matches is fine however old it is, since `hub nav` would not change it. It lists anything at
the Hub root that is not a zone, `CLAUDE.md`, `NAV.md`, `.hub` or `.claude`, folders named like dump piles
(`Migration-*`, `_work`, `sort-later`, `misc`), projects in the code zone that are not git repositories, and names with
spaces (except in `00-Inbox`, where downloads wait to be sorted and renamed). It looks at the Hub root, the folders
directly inside each zone and the code zone, and no deeper. It exits with 1 when there is something to fix.
