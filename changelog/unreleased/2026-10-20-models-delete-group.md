# Delete group: the confirmation closes only after the delete lands

- **Date:** 2026-10-20
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-10-20-models-delete-group.zh.md)

A user-defined group's "Delete group" asks first, naming the group and how many models — and
their API keys — go with it. It used to dismiss that confirmation as soon as the request left,
**whether the delete had succeeded or not**, while `persist` keeps the attempted rows so a field
edit the user is still holding is not lost. A refused delete therefore left the page *without*
the group while the server still held it — and the group's header carried the only entry point
to this action, so it went with the group: nothing was left to retry from, and the error toast
was the only trace of the refusal.

Now the delete is written before the confirmation is dismissed, and a refused one puts the group
back on the page.

## Details

- The confirmation stays open until the table write lands; on a refusal the sentence and its
  count stay verbatim, the error toast shows the server's own words, and the retry is that same
  confirmation.
- A refused write restores the table from before the delete, so the group and its "Delete group"
  action are still there — and the count in the sentence still matches what the retry would
  remove.
- The confirmation is marked busy while the request is in flight: its buttons are disabled, so a
  second click cannot start a second write.

## Compatibility

- No API, wire-format or dependency change: this is only the order of writing and dismissing.
