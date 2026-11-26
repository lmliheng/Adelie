# A hint wraps a long unbreakable run inside its panel

- **Date:** 2026-11-26
- **Type:** fix
- **Scope:** `ui`

[中文](2026-11-26-tooltip-wrap-long-words.zh.md)

Ported from upstream PenguinHarness (#1893, commit `20b9715a3`).

The shared hover hint has three panels by purpose: `label` (a control's name), `code` (a
truncated command line) and `text` (truncated prose). The panel's width is capped, so long text
ought to wrap at that width — but `label` had no `overflow-wrap` at all. A run with no space in
it (a file path, a long unspaced identifier) had nothing to break at, so the whole string ran out
of the rounded panel and over whatever was behind it, leaving the panel itself unreadable. `text`
used `wrap-break-word`, which does not count as a break opportunity when the intrinsic width is
computed, and so disagreed with "grow to the cap, then wrap".

All three kinds now use `overflow-wrap: anywhere`: the panel's edge is a break point, ordinary
words still stay whole. The gallery's tooltips board gains a long-path example as the case to
look at.

## Details

- `packages/ui/src/components/overlays/tooltip/tooltip.tsx`: `contentClass`'s `label` changes
  from `""` to `wrap-anywhere` and `text` from `wrap-break-word` to `wrap-anywhere`, with the
  rule written into the type's comment — a run with no break opportunity breaks at the panel's
  edge, ordinary words stay whole.
- `packages/ui-gallery/src/library/boards/tooltips.tsx`: the "truncated line" group gains a
  long-path `data-tooltip` (a `label` panel, marked `data-tooltip-extra`) beside the existing
  `code` command.
- `packages/ui/test/tooltip.test.ts`: one new case reads the three class rows out of the source's
  `contentClass` table, requires `wrap-anywhere` on each, and asserts `wrap-break-word` is gone —
  dropping any one kind is a regression.

## Compatibility

Typography only: no interface, stored data or dependency changes. The panel's maximum width, its
placement and its open/close timing are as before; the only difference is whether the text runs
past the panel.
