# Agent API: a refused off-switch, keyless switch or key delete keeps its question — and the reason

- **Date:** 2026-10-24
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-24-agent-api-refusal.zh.md)

The API tab of an Agent's settings asks three questions: turn the API off, allow keyless access,
delete a key. All three used to close first and write second, so a refusal changed nothing on the
page or on the server (the switch stayed on, the key stayed listed) yet the reason arrived as a
toast that dismissed itself after six seconds and sat above the card. The user was left looking at
the state as it had been, with nothing on screen saying why the write did not happen.

Now each card stays until its write lands; a refusal leaves it open with the server's words drawn
under its sentence (`ConfirmModal`'s `refusal` slot, same "Refused:" lead-in as the other cards in
the app), so the retry is the same button. While the write is in flight the card's two buttons are
disabled, and opening a card again drops the previous reason, which belonged to the attempt it
named.

## Details

- `features/agents/api-tab.tsx`: the three confirmations (`AgentApiOffConfirm`, `KeylessOnConfirm`,
  `DeleteKeyConfirm`) no longer call `onClose()` before writing — they hand the outcome on, and the
  tab closes the card only on the landing of the write. Each refusal gets its own state
  (`offRefusal` / `keylessRefusal` / `deleteRefusal`) rendered through `S.common.refused`; the key
  delete hands the server's words on via `onRefused` where it used to toast. The three openers (the
  API switch, the keyless switch, a row's trash button) clear their refusal as they open.
- The controls without a question of their own (turning the API on, the approval mode, keyless off)
  still report a refused write as a toast: there is no card to keep, and the control stays on the
  value the server holds.
- New browser test `e2e/agent-api-refusal.spec.mjs` (three): an API-off, a keyless switch and a key
  delete each refused at `page.route` 500 keep the card, its sentence and the state the server
  holds (nothing to dismiss in the notification region), and reopening shows no stale reason; the
  retry on the same card writes it — the card closes, and the server answers with the new state.

## Compatibility

- No interface, wire-format, stored-data or dependency change: only *when* the cards close, *where*
  the reason is drawn, and that the card's buttons are disabled while its write is in flight. No new
  copy beyond the existing `S.common.refused` lead-in.
