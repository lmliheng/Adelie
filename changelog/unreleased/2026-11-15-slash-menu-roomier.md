# The / command menu above the composer: long descriptions are readable, and cover nothing

- **Date:** 2026-11-15
- **Type:** fix
- **Scope:** `ui`

[中文版](2026-11-15-slash-menu-roomier.zh.md)

Typing `/` in the composer lists the commands and the installed skills. Those descriptions are **sentences** ("Deliver correct data-analysis artifacts with bounded verification."), while the panel was 320px wide and gave each one a single line — so most entries showed half a sentence and an ellipsis, and a long name like `/penguin-orchestration` squeezed its description down to a handful of characters. Reading the rest meant hovering, and the panel that hover opened covered the very rows below the one being pointed at.

The panel is now 416px wide and the description takes a **second line** before it ellipsizes. All 24 commands were measured row by row: none is cut off any more (16 of 24 were, before), the longest fit within two lines, and the hover panel no longer opens at all.

## Details

- `packages/ui/src/components/chat/composer/composer.tsx`: the panel goes from `w-80` to `w-[26rem]` (a narrow viewport is still caught by `max-w-[calc(100vw-2rem)]`), and the description goes from `truncate` to `line-clamp-2 break-words` with `leading-snug`.
- The command gains `max-w-[60%]`: a skill is named by its author and could in principle outgrow the row; past that the command ellipsizes itself (rather than squeezing the description away), keeps its whole text in the DOM, and comes back in full on hover.
- Wrapping the description instead of relying on the hover panel is deliberate: the description is there to be read, and the hover panel in this menu covers the candidate rows underneath.

## Tests

- `packages/ui/test/composer.test.ts`: the panel's width, the description's two-line clamp, and the command's cap and ellipsis.
- Measured in a real browser: at the old 320px the rows reported `clientWidth/scrollWidth` pairs like `174/228`, `118/395` and `110/261` (cut); now all 24 rows have `clientWidth === scrollWidth` and `scrollHeight === clientHeight`, and hovering `/agent-initialization` opens no panel.

## Compatibility

Styles and one max-width attribute only: no new props, no behaviour change.
