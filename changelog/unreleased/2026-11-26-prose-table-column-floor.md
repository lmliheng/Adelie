# A reply's table no longer squeezes to one character a line on a narrow screen

- **Date:** 2026-11-26
- **Type:** fix
- **Scope:** `ui`

[中文](2026-11-26-prose-table-column-floor.zh.md)

The Markdown table rule said a wide table scrolls sideways inside the body instead of pushing the
page wide, and did half of it: table layout first shrinks every column towards its min-content
width and only overflows once it cannot shrink further. A CJK string's min-content is **one
character**, so on a phone a four-column table pressed its last column into a ribbon one glyph
wide (measured at 390px: 32px and 36px columns, eleven lines tall) while the body had nothing to
scroll — nothing had overflowed yet.

Cells now keep a 6rem floor. A column stops shrinking there, the overflow finally happens, and the
scroll box is the thing the reader uses. The floor sits on the cells rather than as a width on the
table so a table that already fits is laid out exactly as before (its widths come from the
content), and a cell holding a paragraph still wraps. Measured at 390px: 36px / 11 lines became
96px / 4 lines with the table scrolling; at 1280px the table still fills the body and does not
scroll.

## Details

- `packages/ui/src/components/content/prose/prose.css`: `min-width: 6rem` in
  `.md-body :where(th, td)`, with the comment saying why the table's scroll box alone is not
  enough.
- `packages/ui/test/prose.test.ts`: one new case pinning the pair — the scroll box on the table
  and the floor on its cells; dropping either half is a regression.

## Compatibility

Typography only. On a wide screen the visible difference is that no column is narrower than 6rem;
the scroll box itself was already there and behaves as it did. The docs site keeps its own
stylesheet and is unaffected.
