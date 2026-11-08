# The Hub fence: temp files and one job at a time

Added with the Hub fence (`install.js --fence`), and taken out with it (`install.js --remove`). These rules add to the
Hub's CLAUDE.md.

1. **Temp files stay in the Hub.** Scratch files, downloads a job needs for a moment and test output go in `Temp/` at
   the Hub root, never the computer's own temp folder. Keep nothing there you need: it may be emptied whenever no
   chat is open.
2. **One job at a time.** This Hub is a daily driver: a session works on one job at a time, with at most one helper
   agent at a time, and starts no background, scheduled or all-night runs. Split a bigger job into smaller ones.
