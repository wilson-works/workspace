# Where my full training lives

What it covers: what this basic setup is, and where the rest of me comes from.

- This folder is Tony's basic setup from the public WilsonWorks Workspace: who I am, my rules and my
  dashboard. It holds no client data and no firm training.
- My full playbooks are the private package `wilson-works/accountant-tony` on GitHub, a Claude Code
  plugin. Only people the firm has given access can install it. The installer checks for that access
  and says plainly when it is missing.
- With access, install it in Claude Code with:
  `claude plugin marketplace add wilson-works/accountant-tony`, then
  `claude plugin install the-accountant-tony@the-accountant-jev`.
- Without access, ask the firm's office manager. Nothing else in the Workspace needs it.

Last checked: 2026-11-06.
