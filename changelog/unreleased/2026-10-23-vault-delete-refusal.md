# Both vault tables' delete confirmations keep their question — and the reason — when the delete is refused

- **Date:** 2026-10-23
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-23-vault-delete-refusal.zh.md)

The two vault tables — an Agent's own keys (Agent settings › 密钥保险柜) and the account's global ones
(the account menu's 用户密钥) — delete a row by sending the whole table back without it. Both
confirmations closed unconditionally after that write returned: when it was refused, the key was still
in the table on the page and on the server, yet the reason arrived as a toast that dismissed itself
after six seconds and sat above the dialog.

Both now close only once the write landed. A refusal leaves the confirmation open with the server's
words drawn inside it — under its own sentence — so the retry is the same button.

## Details

- The rule is the one the model library, the plugin cards, the Skills / Hooks / MCP tabs, session
  deletion, the schedules page and the two bulk-update confirmations already follow (`ConfirmModal`'s
  `refusal` slot, 7.19 — 7.30): the reason is drawn in the card that asked for the write.
- `features/agents/vault-tab.tsx` and `components/account/user-vault-dialog.tsx`: `confirmRemove` no
  longer raises the error as a toast and close afterwards. It hands the message to a
  `deleteRefusal` state, which the confirmation draws with the app's own "操作被拒绝：" lead-in
  (`S.common.refused`), and `setDeleting(null)` runs only on a written delete.
- Opening the card again (after cancel) clears the previous reason first: that sentence belonged to the
  key the last attempt named.
- An Add that is refused is unchanged: its error lands on the form that produced it, which stays open
  underneath the overwrite confirmation.
- New browser test `e2e/vault-delete-refusal.spec.mjs` (two: the Agent's table and the account's): a
  refusal keeps the dialog, its sentence and the key, leaves the notification region without a toast, and
  reopening does not carry the old reason; only the retry that lands closes the card, and the write it
  sends is the table without that row. Both seeds and both refusals go through the API / `page.route`,
  so the page's contract with the server is what is checked.

## Compatibility

- No interface, wire-format, stored-data or dependency change: only *when* the card closes and *where*
  the reason is drawn. No new copy beyond the existing `S.common.refused` prefix.
