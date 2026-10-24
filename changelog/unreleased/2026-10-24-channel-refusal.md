# Channels: a refused leave or archive keeps its question — and the reason

- **Date:** 2026-10-24
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-24-channel-refusal.zh.md)

A channel's header asks before the two writes that change who is in it and whether it takes
messages: leaving removes the reader from the roster, archiving makes the channel read-only.
Both cards stayed open when the server refused — but the reason went into a toast that dismissed
itself after a few seconds and sat over the card rather than in it, so the reader was left looking
at an unchanged channel with nothing to read.

Both cards now close only once their write landed. A refusal leaves the card standing with the
server's words drawn under its sentence (`ConfirmModal`'s `refusal` slot, the app's existing
"Refused:" lead-in), so the retry is the button that was pressed; cancelling decides nothing, and
opening either card again drops the previous reason, which belonged to the attempt it named.
Un-archiving is a single menu row with no card to keep, so its refusal stays a toast.

## Details

- `features/company/channel-header.tsx`: `leave()` keeps the server's words in `leaveRefusal`
  instead of only toasting them, and closes the card on the success path alone; `setArchived()`
  takes whether it was asked in a card — the archive card's refusal goes into `archiveRefusal`,
  the un-archive menu row's stays a toast. Both writes bail out while one is in flight (the cards'
  buttons are already disabled by `busy`). The leave button and the archive menu row clear the
  refusal of the card they are about to open, and a channel switch clears both.
- New browser test `e2e/channel-refusal.spec.mjs` (2 cases, one per card): with the write refused
  at `page.route` 500, the card, its sentence and the channel's stored state all stay (nothing to
  dismiss in the notification region); reopening shows no stale reason; the retry on the same card
  writes it — the card goes, and the reader is off the roster / the channel reads as archived.

## Compatibility

- No interface, wire-format, stored-data or dependency change: only *when* the two cards close and
  *where* the reason is drawn. No new copy beyond the existing `S.common.refused` lead-in.
