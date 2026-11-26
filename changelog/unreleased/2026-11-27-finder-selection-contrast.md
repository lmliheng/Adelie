# The row a folder picker has selected stays readable in a warm or dark theme

- **Date:** 2026-11-27
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-27-finder-selection-contrast.zh.md)

In the hand-drawn theme the workspace picker's selected rows — the folder the finder is in, and the
machine it is browsing — were a near-black block whose own label could not be read (reported as
"你自己看这个颜色" with a screenshot of the picker).

The row's fill was Tailwind's `bg-gray-200`, and an imported theme's palette bridge maps that rung to
`--ui-line`, its **border** colour: in the hand-drawn theme that border is `#3f3a34`, while the ink
beside it (`--ui-fg-emphasis`) is `#211f1b` — two nearly equal colours, a contrast of about 1.06.
The bridge is right (`border-gray-200` should follow the theme's border); the mistake was using a
border rung as a fill.

The selection now uses the same wash the app's own navigation uses, `bg-fg/7` over `text-fg`, so both
the fill and the ink come from the theme. Verified in the browser in four combinations (default and
hand-drawn theme, light and dark): the selected row is a warm, readable wash and the default theme
looks as it did.

## Details

- `packages/web/src/features/chat/workspace-finder.tsx`: the sidebar row's active state
  (`bg-gray-200 text-gray-900 dark:bg-gray-800 dark:text-gray-100` → `bg-fg/7 text-fg`) and the
  file list's unfocused selection (`bg-gray-200 … dark:bg-gray-700 …` → the same). The focused
  selection was already `bg-accent text-accent-fg` and is unchanged.

## Compatibility

Only those two state classes; the finder's markup, keyboard handling and requests are untouched.
