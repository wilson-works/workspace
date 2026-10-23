# Department packs

Department packs add a team of agents and skills for one part of a business. Finance is the first.

Each pack lives in its own repo, not inside the workspace, so you can customize it, add more packs, or use one on its own.
The finance pack is at https://github.com/wilson-works/finance-pack.

## Two ways to use a pack

- **On its own.** Download the pack, unzip it, and open the folder in the Claude desktop app.
- **As an add-on to your workspace.** From the pack's folder, run:

  ```
  python build_kit.py --into <your workspace folder>
  ```

  This adds the pack's agents and skills to your workspace. It never overwrites your files.
