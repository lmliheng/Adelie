# Channels: a refused join keeps its question — and the reason

- **Date:** 2026-10-25
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-25-channel-join-refusal.zh.md)

Joining a channel is asked in one confirmation card reached from two places: the channel view's
"you are not a member" notice and the sidebar row's hover action under "Other channels". Both used
to close the card before the write landed, so a refusal left the server's words in a toast that
dismissed itself after a few seconds and floated above a page that had not changed — the buttons
came alive again and nothing said why the reader was still not in.

The card now closes only on the path where its join landed; a refusal draws the server's words
inside the card, right above the retry button (`ConfirmModal`'s `refusal` slot, the app's existing
"Refused:" lead-in). Opening the card again drops the previous reason, which belonged to the
attempt it named; a write in flight takes one press only, and cancelling decides nothing.

## Details

- `features/company/channel-dialogs.tsx`: the shared `JoinChannelConfirm` takes an optional
  `refusal` and hands it to `ConfirmModal`'s slot (with no reason, the slot is not drawn at all).
- `features/company/channel-view.tsx`: `join()` no longer closes the card before the `await`; the
  success path closes it and clears the reason, a refusal keeps the server's words in
  `joinRefusal`. The notice's Join button clears the previous reason before it opens the card; the
  card's `onClose` stops answering while a write is out (a second line behind the `busy` dimming);
  switching channels clears it too.
- `features/company/channel-sidebar.tsx`: the row's `join()` moves `setPendingJoin(null)` after the
  success as well and keeps a refusal in `joinRefusal`; the row clears the previous reason before
  opening the card, and the card's `onClose` stops answering while a write is out.
- New browser tests `e2e/channel-join-refusal.spec.mjs` (two, one per entry point): with
  `POST …/channels/<channel>/members` refused at `page.route` 500, the card, its sentence and the
  roster on the server all stay (nothing in the notification region carries the words); cancelling
  and reopening shows no stale reason; the retry on the same card really joins — the card closes,
  the roster holds the reader, and both the notice strip and the row's Join action are gone.

## Compatibility

- No interface, wire-format, stored-data or dependency change: only *when* this card closes and
  *where* the reason is drawn. No new copy beyond the existing `S.common.refused` lead-in.
