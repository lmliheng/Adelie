# A plugin card whose save was refused says why, past the toast it used to be

- **Date:** 2026-11-02
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-02-plugin-config-save-refusal.zh.md)

Settings → Plugins saves one card at a time. When the server's schema turns a value down it names
the field, and that sentence renders under it — that half has always been right. A save can fail in
other ways too: the settings group went away under the page (a plugin or a backend was removed,
404 `plugin_config_unknown`), the session expired, the server errored, the machine is unreachable.
None of those names a field, and they only ever reached a notification that dismissed itself after
six seconds — after which every box on the card stood exactly as it was, so the save looked like a
click that did nothing.

Such a failure now stays on the card, just above the Save button that is its retry: `role="alert"`,
danger ink, clamped to two lines with the whole sentence on hover, and the shared "Refused:" lead-in.
It stays until Save is pressed again (which clears it first) or another machine is picked or the
page is opened again (a fresh read).

## Details

- `packages/web/src/features/settings/plugin-config-save.ts` (new): `pluginSaveRefusal(error)` —
  which slot a refused save belongs in: `plugin_config_invalid` whose message opens with
  `"<field>"` hands that field name back (a table cell's `<field>.<row>.<column>` travels as given,
  and the table lists it under itself); everything else belongs to the card. The words still come
  from `refusalText()`: a code the app has a sentence for is said in its words, one it has not in
  the server's.
- `packages/web/src/features/settings/plugins-section.tsx`: a `saveRefusals` map keyed by card
  name — cleared for that card as a save starts, set when a save fails without naming a field, and
  dropped wholesale when the machine changes or the section mounts; `toastError` is gone from this
  path (the install path is untouched). The named-field branch is unchanged; its decision moved
  into the module above.
- No new text, no interface and no dependency: the sentence uses the shared `S.common.refused()`
  lead-in.

## Tests

- `packages/web/test/plugin-config-save.test.ts` (new, 7 cases): a named field; a cell's full name
  travelling as given; `plugin_config_invalid` without a leading name; 404 / 500 / 401 on the card
  (a translated code in the app's words); a failure the client raised itself; nothing to say; the
  active language.
- `packages/web/e2e/plugin-config-save-refusal.spec.mjs` (new, one case on a real server): the read
  stubbed to a card with one text box and the write stubbed to a 500 `internal` — after Save there is
  one sentence on the card, no toast at all, the typed value is still in the box, and it is still
  there seven seconds later; with the refusal lifted, the same Save clears the sentence, sends the
  second request and lands.

## Compatibility

- No interface, request or storage change: the same `PUT /api/admin/plugin-config`. Only where a
  failure that names no field is drawn has moved — from a notification onto the card.
