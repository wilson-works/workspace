# 20-Coding

**What goes here:** code. On this computer every project is one git clone in `{{code_zone}}/<kebab-name>/`, with its
own short CLAUDE.md. `_Caches/` holds package caches (npm, pip and the like), so they are easy to see and to clear.

**What never goes here:** business documents (they go in `10-Business/`), loose files, and second copies of a project
such as `garden-planner-old` or `garden-planner (2)`. Use a branch instead of a copy.

**Example:** `{{code_zone}}/garden-planner/`, made with `node {{workspace}}/hub/bin/hub.js new-project garden-planner`.

Each project shows up in `NAV.md`, with its GitHub name, the next time `hub nav` runs.
