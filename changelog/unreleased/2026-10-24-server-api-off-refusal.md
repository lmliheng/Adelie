# Agent API: a refused server-wide off-switch keeps its question — and the reason

- **Date:** 2026-10-24
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-24-server-api-off-refusal.zh.md)

Settings › Server › Agent API carries the admin's server-wide switch: while it is off, every program
calling any Agent is refused. Turning it off asks first, in the danger tone. That question used to
close the moment its confirm button was pressed and write afterwards, so a refusal was reported
under the switch the card had already left behind: the retry meant opening the card again, and the
line that explained the failure read as page-level news rather than as part of the question.

The card now stays until its write lands; a refusal leaves it open with the server's words drawn
under its sentence (`ConfirmModal`'s `refusal` slot, same "Refused:" lead-in as the other cards in
the app), so the retry is the same button. While the write is in flight the card's buttons are
disabled, and opening the card again drops the previous reason, which belonged to the attempt it
named.

## Details

- `features/settings/agent-api-section.tsx`: `AgentApiServerOffConfirm` no longer calls `onClose()`
  before writing — it hands the outcome on, and the page closes the card only when the write landed
  (`settleOff`). A refusal sets `offRefusal`, rendered through `S.common.refused`; the switch goes
  back to the value the server still holds. The card takes `busy` (both buttons disabled while the
  write is in flight) and `refusal`, and the switch's own opener clears the refusal as it opens.
- Turning the switch **on** has no question of its own and keeps its old report: a refused write
  puts the knob back on the stored value and says why under it.
- New browser test `e2e/server-api-off-refusal.spec.mjs`: with the write refused at `page.route`
  500, the card, its sentence and the server's `agentApiEnabled: true` all stay (nothing to dismiss
  in the notification region); reopening shows no stale reason; the retry on the same card writes
  it — the card closes, the switch flips, and the server answers `false`. The switch is left on at
  the end, since the other specs call Agent APIs with it on.

## Compatibility

- No interface, wire-format, stored-data or dependency change: only *when* the card closes, *where*
  the reason is drawn, and that its buttons are disabled while the write is in flight. No new copy
  beyond the existing `S.common.refused` lead-in.
