# Theme library: install a theme from a remote catalogue in one click, and a Trae-CN look to start with

- **Date:** 2026-10-29
- **Type:** feature
- **Scope:** `server`, `web`, `core`, `docs`
- **Breaking:** no

[中文](2026-10-29-theme-registry.zh.md)

Until now another person's theme had to reach you as a file: dropped into the data root's `themes/`,
or uploaded / fetched by an address through the admin's "Import a theme…". The appearance page now
carries one more row — the **theme library**: a remote catalogue the server reads and draws as
cards, where pressing **Import** installs a theme on this machine as exactly the file the manual
route would have written. The first catalogue ships one theme, **Trae CN**: near-black greys with
the brand green, blue links, blue input focus, and four accent presets.

The library is its own repository (`lmliheng/adelie-themes`) and its own npm package
(`@lmliheng/adelie-themes`): `index.json` is the catalogue and `themes/<id>.json` is the theme file,
in the format an installation already imports. Adding a theme is therefore a file and an entry, with
no change to Adelie.

## Details

- `packages/core/src/internal/theme-registry.ts` (new): the catalogue's shape and its reader. An
  index is all-or-nothing — every reason listed, nothing half-read — because a catalogue silently
  missing its author's newest entry reads as "it did not take effect" and nobody can locate that. An
  entry's `file` must be a repository-relative path (absolute URLs, `..` and backslashes refused),
  its swatch may only name `--ui-canvas` / `--ui-surface` / `--ui-fg` / `--ui-accent`, and its values
  pass the theme format's own safety rule (`;{}<>@`, newlines, `url(` refused).
  `resolveRegistryFile(base, file)` is the one way an address is built, shared by both routes.
- `packages/server/src/services/theme-registry.ts` (new): reading the catalogue, caching it (five
  minutes on success, thirty seconds on failure, concurrent reads sharing one request) and choosing
  where to read it. Two default addresses: the npm mirror
  `registry.npmmirror.com/@lmliheng/adelie-themes/latest/files/`, and jsDelivr's GitHub copy
  `cdn.jsdelivr.net/gh/lmliheng/adelie-themes@main/`. The first is fast inside mainland China but
  waits for the mirror to sync a release — measured this round: a brand-new package was still
  missing more than ten minutes after publishing; the second knows a commit at once and is slower.
  The second is tried only when the first fails at the TRANSPORT level: a catalogue that answers and
  does not read is reported as such, because both addresses serve the same file.
  `ADELIE_THEME_REGISTRY` replaces the whole list with one address.
- `packages/server/src/services/theme-download.ts`: `fetchThemeFile` takes `maxBytes`, because a
  catalogue's cap (128KB) is not a theme file's (256KB); the refusal names the cap it enforced.
- `packages/server/src/http/routes/themes.ts`: `GET /api/themes/registry` (any signed-in user: the
  catalogue, each entry marked installed or not, and the reason when it could not be read) and
  `POST /api/themes/registry/import` (admin, `{id, overwrite?}`). An import is the address import
  again — the same `fetchThemeFile`, the same `installTheme` — so the private-host guard, the size
  cap and the 409 `theme_exists` behave identically; it adds one check: a file whose own id is not
  the one the catalogue listed it under is refused BEFORE anything is written
  (`registry_mismatch`).
- `packages/web/src/features/settings/theme-registry-section.tsx` (new): the cards on the appearance
  page, drawn for an admin only (the one action a card offers is an import, and importing is the
  admin's). Each card paints what the theme looks like in light and in dark — canvas, surface, ink,
  accent — beside its author, version and one-line description. A library that cannot be read is a
  line, not an empty page; a successful import refreshes the theme list above and then re-reads the
  catalogue, so "installed" follows the server's reading rather than a guess.
- Copy: `packages/web/src/lib/strings{,-en}.ts` carry the library's words; the error mapping in
  `features/settings/theme-import.ts` gained the library's five codes
  (`registry_theme_not_found`, `registry_mismatch`, `registry_unusable`, `registry_unavailable`,
  `registry_invalid`), because the server's own sentence is English-only.
- Tests: `packages/core/test/theme-registry.test.ts` (11: the shape, optional fields, six bad `file`
  values, duplicate ids, unknown swatch names, unsafe values, one bad entry failing the lot, an empty
  catalogue, a missing `themes`, address joining); `packages/server/test/theme-registry.test.ts` (16:
  catalogue and cards, the login requirement, unreachable / unreadable / one bad entry, the cache, the
  fallback address with the file fetched from it, install, 409 and overwrite, unknown id, mismatched
  id, non-admin); `packages/web/test/theme-import.test.ts` pins the new codes' sentences.
- The content repository `lmliheng/adelie-themes`: `index.json`, `themes/trae-cn.json` (33 light
  tokens, 31 dark, four accent presets), a README with both formats' field tables and the "add a
  theme" steps, Apache-2.0. It is `@lmliheng/adelie-themes@1.0.0` on npm.
- Docs: `packages/docs/content/settings.{zh,en}.md` gained a paragraph on the library after the one
  on imported themes.

## Compatibility

- No breaking change to a protocol, the disk or the API: two routes and two DTOs are added; the
  `themes/` folder, the file format and the stylesheet are untouched.
- With no `ADELIE_THEME_REGISTRY` the defaults above apply; an address that is not http(s) is
  reported as `registry_unusable` rather than silently falling back, so a page never shows a
  catalogue from a host nobody chose.
- Verified against the real addresses: the catalogue read from jsDelivr (one entry), its
  `themes/trae-cn.json` fetched (3130 bytes) and recognised by core's reader (33 light tokens). The
  npm package took more than ten minutes to appear on `registry.npmjs.org` and had not synced to
  npmmirror at all by the end of this round — which is why the second address is load-bearing rather
  than a spare.
