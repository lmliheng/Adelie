# Tickets: a refused block keeps the form and what was typed in it

- **Date:** 2026-10-25
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-25-ticket-block-refusal.zh.md)

"Mark blocked" is the form itself in the ticket dialog's footer: one line saying where the work is
stuck and whom it waits on, then the write. It used to close before that write landed, so a
refusal put the server's words in a toast that dismissed itself after a few seconds — the form was
gone, the reason just typed was gone, and a retry meant writing it out again.

The form now closes only on the path where its write landed; a refusal draws the server's words
above the fields (the app's existing "Refused:" lead-in) and leaves the reason and the "waiting on"
exactly as typed, so the retry is one press. Opening the form again drops the previous reason,
which belonged to the attempt it named; a write in flight takes one press only, and cancelling
decides nothing.

## Details

- `features/company/ticket-dialog.tsx`: the footer's inline block write became `commitBlock()`,
  sharing the `refusal` state the dialog's three confirmations already use (they cannot be up
  together, and each is cleared before it is raised); closing the form moved inside the write, so
  success is the only path that dismisses it and clears the fields. The `Modal`'s `onClose` no
  longer answers while a write is in flight, matching the other three cards.
- The existing browser spec `e2e/ticket-refusal.spec.mjs` gains one test (mark blocked): with the
  write refused at `page.route` 500, the form, the reason in its field and the ticket file on the
  server all stay (nothing in the notification region carries the words); cancelling and reopening
  shows no stale reason; the retry on the same form really writes — the form closes, the ticket is
  marked blocked, and the footer offers to lift it.

## Compatibility

- No interface, wire-format, stored-data or dependency change: only *when* this form closes and
  *where* the reason is drawn. No new copy beyond the existing `S.common.refused` lead-in.
