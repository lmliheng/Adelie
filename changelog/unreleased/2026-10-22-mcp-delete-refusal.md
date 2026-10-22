# A refused MCP Server removal keeps its confirmation and the reason in it

- **Date:** 2026-10-22
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-10-22-mcp-delete-refusal.zh.md)

The Tools tab's MCP Server table asks before it removes a row, and that card used to close as soon as the
request returned — whether or not the write landed. When the write was refused, the list was exactly as it
was, on the page and on the server ("remove one row" is that whole list PUT back without it), yet the reason
arrived as a toast: six seconds, floating above the card, and the retry meant finding the row again.

The card now closes only after the write landed: a refusal draws the server's words under the card's sentence,
so the retry is the same button, and the one write that succeeded closes it and drops the sentence. Opening the
card from a row's Remove button clears the previous reason first.

## Details

- The rule follows the model library, scheduled tasks, evaluation center, plugin market, conversation deletion
  and plugin settings rounds (`ConfirmModal`'s `refusal` slot): the reason is drawn inside the card that asked,
  not in a toast that dismisses itself and sits above it.
- `features/agents/mcp-servers-section.tsx`: `confirmDelete` only calls `setDeleting(null)` when `persist`
  came back clean; otherwise the message goes to a new `deleteRefusal` state that the confirmation draws
  (`S.common.refused(...)`). The card already carries `busy` while the write is in flight, so neither button
  can be pressed twice.
- New browser spec `e2e/mcp-delete-refusal.spec.mjs` (two tests): a refused removal keeps the card, its
  sentence and the row, raises no toast, and reopening it does not carry the old reason over; confirming again
  with the write allowed closes the card, removes the row, and the server's list no longer holds it.

## Compatibility

- No API, wire-format, stored-data or dependency change: this is only when the card closes and where the reason
  is drawn.
- The add / edit dialog in the same block already keeps the server's 400 inside itself (`modalError`), and the
  on/off switch has no card to keep; neither changed.
