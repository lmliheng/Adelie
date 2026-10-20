# Saving a model's config: the confirmation closes only after the save lands

- **Date:** 2026-10-20
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-10-20-models-save-refusal.zh.md)

The model config dialog asks before it writes: save the changes, make this model the default, or
make it the vision proxy model. That confirmation — and the dialog behind it — used to close as
soon as the request left, **whether the write had succeeded or not**, while `persist` keeps the
attempted rows and the attempted pointer. A refused save therefore left the page showing a model
under the name the server had not accepted, and a refused "set as default" left the card wearing
the 默认 tag while the server still pointed at another model. The sentence naming the change was
gone with the dialogs, and the card that opens them had to be found again to try once more.

Now every one of those actions is written before either dialog is dismissed, and a refused one
leaves the page on the table and the pointers the server still holds.

## Details

- Both dialogs stay open until the table write lands; on a refusal the sentence stays verbatim,
  the draft stays in the form, the error toast shows the server's own words, and the retry is that
  same confirmation.
- A refused write leaves the table and both pointers as they stood before it, so the page never
  claims a change the server declined.
- The confirmation is marked busy while the request is in flight, and the dialog's own confirm
  button locks with it, so a second click cannot start a second write.
- This is the same rule the delete, the group delete, "sync presets" and "clear errors" already
  follow: a dialog is dismissed by the write's outcome, not by the click.

## Compatibility

- No API, wire-format or dependency change: this is only the order of writing and dismissing.
