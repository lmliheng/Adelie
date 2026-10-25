# Import a theme from the app: pick a file, or paste an address

- **Date:** 2026-10-25
- **Type:** feat
- **Scope:** `core`, `server`, `web`
- **Breaking:** no

[中文](2026-10-25-import-themes.zh.md)

A theme could always be installed by dropping it in the data root's `themes/` directory. Now the
line in **Settings › Appearance** that names that directory gives an admin one more thing — "Import
a theme…": pick a `.json` file, or paste an address for the server to fetch, the same two ways the
plugin library has always imported plugins. Importing is not a second kind of install: the same
file lands in the same directory and is read by the same reader.

The file is written under the name the theme gives itself (`Warm Paper` → `warm-paper.json`), so
importing the same theme again is an update rather than a second copy: it asks first, and confirming
replaces the file that provides it — whatever that file happens to be called. A file that does not
read writes nothing at all, and the reader's own words come back with it: which field, which value it
cannot take, for whoever has to fix it.

## Details

- **The server** (`server/src/http/routes/themes.ts`) gets two routes: `POST /api/themes/upload`
  (the file as base64 in the body — the shape the plugin, skill and hook imports all take) and
  `POST /api/themes/download` (fetched by the server; a local or private address is refused). Both
  are admin-only and answer 403 `admin_required` otherwise; 409 `theme_exists` means a file already
  provides that theme's id, and resending with `overwrite: true` replaces it.
- **"Fetched by the server" is one bounded request**: a 30s deadline, a cap enforced while streaming
  (a `content-length` is a claim, and a chunked body makes none), and a re-check of the host that
  actually answered, because a redirect may have left the network the URL declared. The host guard
  is the plugin download's own (`isBlockedHost` in `services/plugin-download.ts`) — imported, not
  copied.
- **The cap is the format's own**: `MAX_THEME_FILE_BYTES` (256KB, in core). The directory reader,
  the decoded upload and the downloaded body all read that one number, because accepting a byte more
  would install a theme the reader then refuses to paint.
- **The appearance page** (`features/settings/appearance-section.tsx`, `theme-import-dialog.tsx`):
  the directory line gains one entry for an admin, and it opens one dialog — a two-way switch (a
  local file / an address), the field that switch implies, and a single confirm. Nobody else gets a
  word there: the server refuses them anyway, so the entry is drawn only for who can use it.
- **Tests**: `server/test/themes.test.ts` grows by 9 (the file on disk and visible to both reads at
  once, a 409 then an overwrite that leaves one file, replacing the file that claimed the id under
  another name, a bad file refused with its reasons and nothing written, the 413, a member refused
  before any request is made, an address import, a download that is not a theme / 404 / unreachable
  / not http, a private address and both ways past the cap), and `web/test/theme-import.test.ts`
  holds the failure copy and the two copies of the cap equal.

## Compatibility

- No interface breaks: the two read routes are untouched and `/api/themes` answers exactly as it did.
- An admin who would rather not use the dialog changes nothing: a hand-placed file is still the whole
  install, and importing is that step moved into the interface.
- A theme is still values for token names only — it cannot add components, layout or rules.
- No dependency change, no version bump.
