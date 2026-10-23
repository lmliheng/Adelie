# Project settings: a refused delete keeps its question — and the reason — instead of toasting

- **Date:** 2026-10-23
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-23-project-delete-refusal.zh.md)

Deleting a Project from Project settings asks first. A refusal used to arrive as a toast only: the
card did stay open (nothing had been deleted, and the Project was still on the server), but the
reason landed in a notification that dismissed itself after six seconds and sat above the card,
outside it. After those six seconds the user was left looking at the same question, with no
reason on screen for why the delete had not happened.

Now the card closes only once the delete landed. A refusal leaves it open with the server's words
drawn under its sentence (`ConfirmModal`'s `refusal` slot, same "Refused:" lead-in as the other
cards in the app), so the retry is the same button; opening the card again drops the previous
reason, which belonged to the attempt it named.

## Details

- `components/layout/project-dialogs.tsx` (`GeneralSection`): `doDelete` no longer toasts and
  returns — it hands the failure to `deleteRefusal`, which the confirmation renders through
  `S.common.refused`. `setConfirmDelete(false)` moved to after the write landed, and a `deleteBusy`
  guard keeps a double click from sending a second DELETE (the second one would have earned a 404
  toast over a card that was already closing).
- The delete row's button clears `deleteRefusal` as it opens the card.
- New browser test `e2e/project-delete-refusal.spec.mjs` (two): a delete refused with `page.route`
  500 keeps the card, its sentence and the Project (nothing to dismiss in the notification region),
  and reopening shows no stale reason; the retry after the refusal writes it — card gone, settings
  dialog gone with it, Project gone from the server and from the switcher. The probe Project is
  created through the API because the delete row is hidden for `default_project` and for an
  account's last Project.

## Compatibility

- No interface, wire-format, stored-data or dependency change: only *when* the card closes, *where*
  the reason is drawn, and that a second click while the delete is in flight is ignored. No new
  copy beyond the existing `S.common.refused` lead-in.
