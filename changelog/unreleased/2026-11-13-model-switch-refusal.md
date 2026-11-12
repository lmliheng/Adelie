# The in-session model switch keeps a refused switch's reason inside the card

- **Date:** 2026-11-13
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-11-13-model-switch-refusal.zh.md)

The session toolbar's model picker asks before it writes — "compact on the current model, then
switch", with an optional escape hatch that drops the context when that compaction cannot complete.
The card closed itself on the answer either way, and a refusal (the session is busy, the target
model is not configured or unavailable, the Project has no compaction configured) was reported only
as a notification that dismissed itself after six seconds. The conversation stayed on the model it
was on, so what was left was a card that had vanished and a sentence nobody had time to read.

The card now stays open with the server's words inside it, in the shared card's `refusal` slot —
`操作被拒绝：<reason>` under the sentence it answered, above the same button that retries the very
same switch (the sentence, the target model and the escape hatch's tick are untouched: a refused
write changed nothing). The reason is cleared at the start of the next attempt, on a fresh pick, and
when the user closes the card.

## Details

- `packages/web/src/features/chat/chat-page.tsx`: a `modelSwitchRefusal` state beside
  `modelSwitchAsk`. `confirmModelSwitch` fills it from `apiErrorText` on a refusal instead of
  toasting, clears it when an attempt starts, and closes the card itself on the two success paths
  (it used to close in `finally`, i.e. whatever the answer). The card passes the state to `refusal`
  and clears it in `onClose`.
- Nothing else about the switch moved: the three shapes of its sentence, the discard checkbox, the
  busy/disabled rule, the request body, and the toasts that report a switch that started or landed.

## Tests

- `packages/web/e2e/model-switch-refusal.spec.mjs` (new, two cases, real server + the repository's
  mock model + a real browser): a refused switch keeps the card and the sentence in it past the six
  seconds a notification lived, nothing in the notification region, and the Session is still on the
  model the dialog promised to leave — then the same button retries and lands; and a 409 whose code
  the interface has its own words for reads those words, with cancel dropping the sentence for the
  next pick.
- Run against the page as it was before the change (`HEAD`'s source, rebuilt), both cases fail on
  the card's missing `role="alert"`.

## Compatibility

No wire change, no new dependency, no Project config change, no new copy: the sentence is the
existing app-wide `操作被拒绝：<reason>`. Successful switches, the compaction notices and every other
notification are untouched.
