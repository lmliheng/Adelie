# Preset sync: the confirmation closes only after the write lands

- **Date:** 2026-10-19
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-10-19-models-sync-order.zh.md)

The Models library's "update now" opens a confirmation that names every preset the sync would
write — a sync rewrites each entry's context window, pricing, protocol and vision flag from the
built-in catalog, so that sentence is the only warning before the click. It used to close as
soon as the request returned, **whether the write had succeeded or not**. Worse, the refused
merge also stayed in the page's table (`persist` keeps attempted rows so a field edit the user
is still holding is not lost), so the retry computed an empty delta from a table that only
*looked* synced: it answered "presets are already up to date" **without sending a request**,
while the notice above kept naming every entry the server still lacked. Only a reload got out
of that state.

Now the merge is written before the confirmation is dismissed, and a refused one puts the
table back as it was.

## Details

- `syncPresets` returns whether the table in hand now matches what the catalog holds — `true`
  for the no-op too (a toast, no request).
- A refused write restores the table from before the merge and re-probes the notice, so the
  notice names exactly what the server still lacks.
- The confirmation closes only when `syncPresets` answers `true`. On a refusal the sentence and
  the list of refs stay verbatim, the error toast shows the server's own words, and the retry is
  that same confirmation.
- The toolbar button, the model card and the config dialog run the same action without a
  confirmation; they now roll the table back on failure too.

## Compatibility

- No API, wire-format or dependency change: this is only the order of writing and dismissing.
