---
name: drake-entry-lookup
description: Find where a form line or a workpaper item is typed in Drake Tax (the screen code and the field), from the kit's Drake screen catalog and mapping records, with the mapping_id cited. Use for "where do I enter this in Drake?", screen codes, MFC numbering or override vs adjustment fields. Invoke with /drake-entry-lookup [form line or item].
---

# Drake entry lookup

You tell a preparer which Drake Tax screen and field takes an amount, and how sure the library is. You work only from
the files in `.claude/library/drake/`. You do not open Drake and you do not type into it.

## Steps

1. **Pin the line.** Name the return type (1040, 1041, 1065, 1120, 1120-S, 990, or a state) and the form line, for
   example "1065 page 1 line 9" or "Schedule C line 11". If you need the line's exact label first, look it up in
   `.claude/library/irs/irs-form-lines-2025.csv`.
2. **Check the screen catalog:** `drake/drake-screen-catalog-2025.csv`. Each row joins a tax line to a Drake screen
   and field, with a source citation and a `verification_status`.
3. **Read the mapping record:** `drake/tax-year-2025/<return type>.json` (for example `1065.json`). Search for the
   form line or the item. Each record has a `mapping_id`, the screen code, the field label, instructions, caveats,
   the Drake knowledge-base links (`kb_refs`) and a `confidence`.
4. **Read the confidence before you trust it:**
   - `kb_explicit`: the cited Drake article names the screen and the field. Use it.
   - `kb_inferred`: the screen or field was worked out, not stated. **Read `drake/tax-year-2025/<return type>.gaps.md`
     first.** If the gaps file lists that item as a conflict or an assumption, say so.
   - `needs_verification_in_software`: say plainly that this has to be checked on the screen in Drake.
5. **Read the conventions** if the answer involves them: `drake/DRAKE_DATA_ENTRY_CONVENTIONS.md` covers the screen
   selector, red and green fields, MFC numbering, the F and ST boxes, and override vs adjustment fields.

## Answer shape

```
<Form line> goes on Drake screen <code> (<screen name>), field "<field label>".
Confidence: <kb_explicit | kb_inferred | needs_verification_in_software>
Caveats: <from the record, or "none">
Cite: mapping_id <id>; Drake KB <url> (updated <date>)
```

## Rules

- Always cite the `mapping_id`. An answer without one did not come from the library.
- A row with no citation is not an answer. Say "the library has no mapping for this" and name the return type's
  `.gaps.md` if it lists the item.
- These mappings are for tax year 2025 (Drake25). For another year, say the screen may have moved and check
  `drake/tax-year-2025/YEAR-CHANGES.json` for what changed into 2025.
- Never put a client's name or numbers in a file you write. Work in `outputs/`.
