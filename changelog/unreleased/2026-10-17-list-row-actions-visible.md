# List rows keep their actions in view, however long their text

- **Date:** 2026-10-17
- **Type:** fix
- **Scope:** `ui`, `ui-gallery`

[中文版](2026-10-17-list-row-actions-visible.zh.md)

Ported from upstream PenguinHarness (#1157, commit `ef12d442`), together with one layout hunk of `#1133` (`5d01f6a4`) that #1157 rests on and this fork had not taken.

In Agent settings → Memory, upstream found that one memory with a long description laid every row of its section out wider than the card, so the card clipped the view, edit and delete buttons on every row, the short rows' too; a longer description pushed the date off as well. The fix sits in the shared list row and the collapsible section (`packages/ui`), so every list built on them holds the same way.

## Details

- `CollapsibleSection` holds its body to the card's width (`min-width: 0` on the fold's grid item, as `Fold` already did). Its body's `auto` column grew to the item's minimum width, where a line that truncates with `nowrap` counts at its full length.
- `ListRow` no longer asks its container for its text's width: title and description sit in a one-column `minmax(0, 1fr)` grid, so a row's narrowest width is its mark, date and actions, whatever container it is in. Title and description still truncate to one line each and show whole on hover.
- The meta and the actions keep their width and take a line of their own once they no longer fit beside the text (`flex-wrap` on the row, `basis-40` on the text, and one wrapping, right-aligned group holding the date and the actions). That layout came with `#1133`; #1157's own gallery check measures it at the largest text size, where three action buttons in a 220 px card are otherwise clipped.
- `ListRow` puts at most 1,000 characters of a string title or description on the page, ending in an ellipsis, and carries the whole string in the line's hover hint, so a description of any length costs a row the layout of a thousand characters at most.
- The component library's data board gained a section of memory rows with very long text, and the gallery a Playwright check (`pnpm --filter @lmliheng/penguin-ui-gallery test:e2e`) that measures every row and action against its card in each theme and language at the board's width and narrowed to 360, 280 and 220 px. The gallery keeps that spec out of vitest by scoping vitest to `test/**/*.test.ts`.
- Two assertions in `test/list-row.test.ts` follow the row's new markup: its own class string, and the date and the actions sitting in their own group outside the opening button.

## Differences in this fork

- The fold still clips on the body box (`overflow-hidden`), not on the grid (`overflow-clip`, which arrived with a later upstream change this fork has not taken). `overflow: hidden` already zeroes that item's automatic minimum size, so this tree never showed upstream's symptom of the *card* growing wide: on a real server and browser (Agent settings → Memory, three memories, two of them with descriptions of several hundred characters) the rows and their actions stay inside the card in both states at 1280 / 1024 / 768 / 390 / 320 px. What the port changes here is the width a row *asks for* — its min-content drops from 5417 / 5576 / 513 px to 120 px, and from 6759 / 6958 / 629 px to 138 px at 390 px with the largest text size.
- `ListRow` has no `SettingsList` sibling here (that arrived with upstream's Workbench work, which this fork has not taken), so the port adds the row's own changes alone.
- The gallery's example memory that quotes a version names Adelie, not the upstream product.
