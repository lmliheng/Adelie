# A theme can live in your data root now, and the appearance page offers it

- **Date:** 2026-10-23
- **Type:** feat
- **Scope:** `core`, `server`, `ui`, `web`
- **Breaking:** no

[中文](2026-10-23-imported-themes.zh.md)

A theme has always been one thing: a set of values for the UI's token names. Every component reads
those names and not one of them asks which theme is active, so a theme that arrives as data repaints
the whole app — no rebuild, no plugin, no code that runs. Drop a JSON file in `<data root>/themes/`
and the next page load offers it in **Settings › Appearance**, beside the three that ship.

The appearance page also says where to put a file (the exact directory the server read), what a file
got wrong, and which accent presets the chosen theme offers — including a theme's own, taken from the
same file.

`examples/themes/warm-paper.json` is a theme to start from: warm paper surfaces, a terracotta accent,
three presets.

## Details

- **Format.** `{ "schemaVersion": 1, "id", "name", "nameZh"?, "light": {"--ui-…": value}, "dark"?: {…},
  "accents"?: [{ "id", "light", "dark"? }] }`, at most 400 names and 12 presets per file. `light` is
  the base both modes start from, `dark` changes only what differs, and each preset is scoped to its
  own theme. A value is one line, at most 120 characters, and may not contain `;` `{` `}` `<` `\` `@`
  or a newline, nor fetch anything (`url(`, `image-set(`): an imported theme is confined to token
  values, so it cannot add a rule, hide an element or call home.
- **The server** (`server/src/http/routes/themes.ts`): `GET /api/themes` lists what read plus the
  files that did not, behind the login; `GET /api/themes.css` is the same files as one stylesheet and
  is public, because `index.html` links it in `<head>` and the sign-in page is a page like any other.
  Every request re-reads the directory — no restart, no cache — and one broken file costs nobody else:
  it is named with its reason and left out of the sheet. Two files claiming one id reject the later
  one.
- **The rules** (`core/src/internal/external-theme.ts`, so both ends share one reading) are emitted in
  the named layers `ui-theme` and `ui-accent`, on `:root[data-theme="…"]` with the base rule reaching
  both modes — an unlayered rule would beat the user's own font pairing, and the two-selector base
  rule needs no promise about which sheet the browser read first.
- **The app** (`web/src/state/external-themes.ts`) makes the judgement the other two cannot: the token
  names are the UI package's contract, so a name the contract has never heard of is reported (it paints
  nothing) while a name a file leaves out is only listed (it keeps the default theme's value). The
  readers in `state/theme-prefs.ts` — and the pre-paint script in `index.html` — now accept any
  well-formed id instead of a fixed list, so an imported theme's id survives a reload even while its
  file is being read; a malformed one, and an absent value, still read as the default theme.
- Tests: `core/test/external-theme.test.ts` (shape and safety), `server/test/themes.test.ts` (the two
  routes, a broken file, a duplicate id, an edit that lands on the next read), `web/test/external-themes.test.ts`
  (the contract judgement, the swatches, the read), and the updated `web/test/theme-prefs.test.ts` /
  `ui/test/boot-script.test.ts` for the open id space.

## Compatibility

- Nothing stored, wired or built changes: an installation with no `themes/` directory gets one comment
  from the sheet and the same three themes as before. The stylesheet link is a no-op request for it.
- The file format is versioned (`schemaVersion`); an unknown version is refused with the reason rather
  than half-read.
- No dependency change. The three shipped themes are untouched — an imported theme can only paint
  under its own id.
