# Tickets: a refused create keeps the form and everything typed in it

- **Date:** 2026-10-26
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-26-ticket-create-refusal.zh.md)

The board's "new ticket" form asks for ten fields — title, slug, goal, acceptance note, owner,
parent, who to notify, priority, due date. Its write used to report a refusal through a toast
alone: a few seconds later the reason was gone, the board underneath was unchanged, and the button
was live again with nothing saying why, while the form still held everything typed into it.

A refusal now draws the server's words at the top of the form (the app's existing "Refused:"
lead-in) and leaves every field as typed, so the retry is one press. The form only closes once its
write landed — a write in flight also ignores the dialog's own `onClose`, so the form cannot be
dismissed from under the answer it is waiting for. Opening the form again drops the previous
reason, which belonged to the attempt it named.

## Details

- `features/company/tickets-page.tsx`: `CreateTicketDialog` gains the `refusal` state its
  neighbours in the ticket dialog already use; the failed write's message is drawn in a
  `NoticeStrip` above the fields instead of a toast, and is cleared whenever the form is opened.
  The `Modal`'s `onClose` no longer answers while a write is in flight (the cancel button was
  already disabled; this is the second door).
- New browser spec `e2e/ticket-create-refusal.spec.mjs`: with the create refused at `page.route`
  500, the form, the title and the goal in their fields, and the organization's ticket list all
  stay (nothing in the notification region carries the words); cancelling and reopening shows an
  empty form without a stale reason; the retry really writes — the form closes, the board holds
  the ticket, and its own dialog opens on it.

## Compatibility

- No interface, wire-format, stored-data or dependency change: only *when* this form closes and
  *where* the reason is drawn. No new copy beyond the existing `S.common.refused` lead-in.
