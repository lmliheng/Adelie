# A plugins page that fails to load says why, instead of standing empty

- **Date:** 2026-11-02
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-02-plugins-read-refusal.zh.md)

Settings → Plugins draws one card per configuration entry, and draws nothing at all until
`GET /api/admin/plugin-config` answers. On this server that read failing left a blank page and the
reason in a toast, which was gone six seconds later — after that, nothing on screen said the page
was empty because it could not be read. A picked machine already said so on the page itself; this
server did not.

Both cases now draw the reason where the cards would be, and no longer as a toast: a strip with
`role="alert"`, the machine's name when a machine is the one that could not answer, this server's
own words when it is this server. It stays until another machine is picked or the page is left and
opened again — a remount re-reads, and that is the retry. The page has no retry button of its own.

## Details

- `packages/web/src/features/settings/plugin-config-read.ts` (new): `pluginConfigUnreadable(name,
  reason)` — the sentence a failed read becomes, naming a picked machine and speaking of this
  server without printing the picker's bare "This server" as if it were a machine's name.
- `packages/web/src/features/settings/plugins-section.tsx`: a failed hydration adopts an empty
  list and keeps the sentence, for this server as well as for a machine; the strip is drawn
  whenever there is one, with `role="alert"`, and the read path no longer uses `toastError`. What
  a machine's failure says is unchanged.
- `packages/web/src/lib/strings{,-en}.ts`: `plugins.thisServerUnreadable`, beside the existing
  `machineUnreadable`.

## Tests

- `packages/web/test/plugin-config-read.test.ts` (new, 4 cases): a machine is named, this server
  is not, the reason travels through as given, and the sentence follows the interface's language.
- `packages/web/e2e/plugins-read-refusal.spec.mjs` (new, one case on a real server): with the read
  refused — one sentence on the page, no cards, no toast at all, still there after seven seconds;
  leaving the page and coming back (a remount is the retry) clears it and draws the cards.

## Compatibility

- No interface, request or storage change: the same `GET /api/admin/plugin-config`. Only where the
  reason is drawn on failure has moved.
