# The theme picker is a row of cards, each painted with its own colors

- **Date:** 2026-10-27
- **Type:** feat
- **Scope:** `web`, `docs`
- **Breaking:** no

[中文](2026-10-27-theme-picker-cards.zh.md)

Choosing a theme used to be a row of buttons with one word each — **Primer**, **Frost**, **Console** — and
once a machine imported a few themes that row either wrapped into a block of chips or scrolled sideways.
Either way you were choosing between names you could not see: what separates Frost from Console is
something you learned by switching to it. The themes are cards now. Each card paints that theme's own
canvas, surface, a line of ink and an accent chip, with the name underneath; the three the package ships
sit under **Built in**, the ones files brought under **Imported**, and a group appears only when it has
something in it.

The block under the picker changed with it. It used to be a paragraph — the themes directory's absolute
path, what a file looks like, how to refresh, that an admin can import too — with **Read again** and
**Import…** hanging off the end of it. That paragraph is worth reading once and was scrolled past on
every later visit. It is now the two things one can actually do (**Read again**, and an admin's
**Import a theme…**) beside one line naming the folder, with the path and the file format behind the "?"
next to them. An imported theme that sets only part of the values is one line per theme — "203 tokens
keep the default" — that opens to the names, instead of the wall of `--ui-` names it printed before.

## Details

- `packages/web/src/features/settings/theme-picker.tsx` (new): `ThemePicker` and the card. The shipped
  three themes' four colors are spelled out in `BUILTIN_PREVIEW`, because their rules answer
  `:root[data-theme="…"]` one theme at a time and drawing three at once would repaint the page per card;
  an imported theme's colors come from its own file. Each card shows the mode the page is drawn in.
- `packages/web/src/state/external-themes.ts`: `ImportedThemeView` gains `preview`, the four colors of an
  imported theme in each mode, filled in from the default theme for names the file leaves out.
- `packages/web/src/features/settings/appearance-section.tsx`: the theme row becomes a full-width
  `ThemePicker` (a grid needs the row's whole width to wrap into); the note becomes the folder line with
  its "?" and two actions, and the problem list becomes one collapsible line per theme.
- `packages/web/src/features/settings/theme-import-dialog.tsx`: the import entry is a secondary button
  beside **Read again** rather than a line of small text under the paragraph.
- Strings: `themeBuiltin` / `themeImportedGroup` / `importedThemeUnknownShort` /
  `importedThemeMissingShort` / `importedThemeDetails` / `importedThemesHelp` (`importedThemesDir` is gone).
- Docs: the Appearance section of `packages/docs/content/settings.{zh,en}.md` — its "Theme: Light / Dark /
  System" row was wrong (that is **Color mode**), so the two are separate rows now, with a paragraph on
  imported themes.

## Compatibility

- No API, on-disk or configuration change: same theme format, same directory, same `data-theme` attribute.
