# Tickets: a refused write keeps its question — and the reason

- **Date:** 2026-10-25
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-25-ticket-refusal.zh.md)

A ticket's writes are asked in confirmation cards: saving an edited section, lifting a block, and
moving the ticket — the last one from the dialog's footer and, with the same card, from a card
dropped on another column of the board. Every one of them closed before its write landed, so a
refusal put the server's words in a toast that dismissed itself after a few seconds, over a panel
that had not changed: the button came alive again and nothing said why the ticket was still as it
was.

Each card now closes only on the path where its write landed; a refusal draws the server's words
inside the card, right above the button that retries it (`ConfirmModal`'s `refusal` slot, the
app's existing "Refused:" lead-in). Opening a card again drops the previous reason, which belonged
to the attempt it named; a write in flight takes one press only, and cancelling decides nothing.

## Details

- `features/company/ticket-dialog.tsx`: `run()` takes an optional `refuse` callback — a write with
  a card behind it reports the server's words back into that card, and a write with none (a
  progress note) keeps the toast. One `refusal` state serves the three cards (they cannot be up
  together, and each is cleared before it is raised). `commitSave`, `commitMove` and the new
  `commitUnblock` close their card inside the write instead of before it, so success is the only
  path that dismisses it, and `MoveTicketConfirm` grew the optional `refusal` it hands to the slot.
- `features/company/tickets-page.tsx`: the board's own `confirmMove` keeps a refusal in
  `moveRefusal` instead of a toast, closes the card only once the move landed, and clears the
  previous reason when a card is dropped on a new column.
- New browser tests `e2e/ticket-refusal.spec.mjs` (four: save, move from the dialog, unblock, move
  from the board): with the write refused at `page.route` 500, the card, its sentence and the
  ticket file on the server all stay (nothing in the notification region carries the words);
  cancelling and reopening shows no stale reason; the retry on the same card really writes — the
  card closes and the ticket takes the new title / column / block state.

## Compatibility

- No interface, wire-format, stored-data or dependency change: only *when* these cards close and
  *where* the reason is drawn. No new copy beyond the existing `S.common.refused` lead-in.
