# Calendar: a refused save or delete keeps its question — and the reason

- **Date:** 2026-10-24
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-24-calendar-refusal.zh.md)

The organization calendar asks before every write: saving an event rewrites its schedule file, and
deleting one removes it from the rota. The save card used to close on the way into its request's
`catch` — the event was still the one stored, but the reason arrived as a toast that dismissed
itself after a few seconds and sat over the card rather than in it. The delete card stayed open,
yet its reason went into that same toast.

Both cards now close only once their write landed. A refusal leaves the card standing with the
server's words drawn under its sentence (`ConfirmModal`'s `refusal` slot, the app's existing
"Refused:" lead-in), so the retry is the button that was pressed; cancelling lands back on the form
with the values that were refused, and opening either card again drops the previous reason, which
belonged to the attempt it named.

## Details

- `features/company/calendar-page.tsx`: `save()` no longer calls `setConfirmSave(false)` in its
  `catch` — it keeps the server's words in `saveRefusal`, and `remove()` keeps its own in
  `deleteRefusal`; both are rendered through `S.common.refused` into the card that asked. Both
  writes bail out while one is in flight (the cards' buttons are already disabled by `busy`). The
  form's Save and Delete buttons clear the refusal of the card they are about to open.
- New browser test `e2e/calendar-refusal.spec.mjs` (2 cases, one per card): with the write refused
  at `page.route` 500, the card, its sentence and the stored event all stay (nothing to dismiss in
  the notification region); reopening shows no stale reason; the retry on the same card writes it
  — the card and the form close, and the server shows the edit / the missing event.

## Compatibility

- No interface, wire-format, stored-data or dependency change: only *when* the two cards close and
  *where* the reason is drawn. No new copy beyond the existing `S.common.refused` lead-in.
