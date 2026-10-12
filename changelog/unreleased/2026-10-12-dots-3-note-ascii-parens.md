# TokenDance's Dots3-Note Preview is named with ASCII parentheses

- **Date:** 2026-10-12
- **Type:** fix
- **Scope:** `core`

[中文版](2026-10-12-dots-3-note-ascii-parens.zh.md)

Ported from upstream PenguinHarness (#996, commit `0e207146`).

The built-in catalog listed `dots-3-note-preview` as **Dots3-Note Preview（Free）** — the full-width
parentheses were copied from the seller's Chinese listing, and since a catalog name is not
translated per UI language, they showed as wide glyphs with no space before them in the English
UI too. The words stay the seller's; only the punctuation changes, to the ASCII form every other
parenthesised row uses (`Nemotron 3 Ultra (free)`, `Gemini 3.1 Pro (Preview)`).

## Details

- A Project that never renamed the row shows the new name at once: a preset model's display name
  is read from the catalog and never written into a Project's configuration. A name the user set
  themselves is stored, and is left alone.
- No API, wire format or stored data changes.
