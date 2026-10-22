# A refused hook-package uninstall keeps its confirmation and the reason in it

- **Date:** 2026-10-22
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-10-22-hook-uninstall-refusal.zh.md)

The Hooks tab of an Agent's settings asks before it uninstalls a package, and that card used to close in a
`finally` — whatever the answer. When the DELETE was refused, the package was still installed, on the page and
on disk, yet the reason arrived as a toast: six seconds, floating above the card, and the retry meant finding
the row again.

The card now closes only once the uninstall landed: a refusal draws the server's words under the card's
sentence, so the retry is the same button; the uninstall that succeeded closes it, toasts, re-reads the
installed list and refreshes the Agent list. Opening the card from a row's uninstall button clears the previous
reason first.

## Details

- The rule follows the model library, scheduled tasks, evaluation center, plugin market, conversation deletion,
  plugin settings, MCP Server and Skills-tab rounds (`ConfirmModal`'s `refusal` slot): the reason is drawn inside
  the card that asked, not in a toast that dismisses itself and sits above it.
- `features/agents/hooks-tab.tsx`: `confirmRemove` keeps the card open when `uninstallAgentHook` rejects and
  hands the message to a new `removeRefusal` state that the confirmation draws (`S.common.refused(...)`); a
  success clears the pending name, toasts, re-reads the tab and refreshes the Agent list provider. The row
  buttons and the card already carry `busy` while the request is in flight, so nothing can be pressed twice.
- New browser spec `e2e/hook-uninstall-refusal.spec.mjs` (two tests) against the package a fresh Agent ships
  (read from the API): a refused uninstall keeps the card, its sentence and the package, raises no toast, and
  reopening it does not carry the old reason over; confirming again with the request allowed closes the card,
  removes the row, and the server's installed list no longer holds it.

## Compatibility

- No API, wire-format, stored-data or dependency change: this is only when the card closes and where the reason
  is drawn.
- The import and overwrite flows on the same tab already report a rejection inside their own dialogs
  (`uploadError`), so nothing there changed.
