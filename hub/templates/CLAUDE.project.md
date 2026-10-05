# {{name}}

Made {{date}}. This file adds to the Hub's CLAUDE.md and never contradicts it.
Keep this file short: delete any line Claude could read from the code itself. Fill in the `<...>` parts.

## What this is

<One or two sentences: what {{name}} does, and who it is for.>

## Run, build and check

| Job | Command |
|---|---|
| Run it | `<command>` |
| Build it | `<command>` |
| Check it (tests, lint) | `<command>`. Read the summary line of the output, not only the exit code. |

## Map

| Where | What is there |
|---|---|
| `<folder>/` | <what lives there> |

## Branch rules

- `main` is production. Never commit to it directly.
- Work on a branch, push it, merge it through a pull request, then delete the branch here and on GitHub.

## Do not touch

- `.env` and any file that holds a key, a password or a token. Never commit one.
- <generated files, copied-in code, anything another project owns>
