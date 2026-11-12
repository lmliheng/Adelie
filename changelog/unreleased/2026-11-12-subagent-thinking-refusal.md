# A refused thinking-level pin in the subagent panel keeps its reason, and the picker stays on the level the child runs

- **Date:** 2026-11-12
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-11-12-subagent-thinking-refusal.zh.md)

The subagent panel's thinking-level picker adopted the clicked level before the `PATCH` went out and
then only toasted the failure. A refused write therefore left two lies at once: a picker reading
`高` for a child that was still running at `中`, and a reason that dismissed itself after six
seconds. The main composer has never behaved this way — the draft picker and the session picker both
adopt the level only once the write has landed, and draw the refusal above the card — and this panel
pins a child Session through the same route, so it now does the same: the level is adopted when the
`PATCH` resolves, and a refusal puts `没能切换思考等级：<reason>` in the composer's thinking-refusal
slot until the next attempt.

## Details

- `packages/web/src/features/chat/subagents-view.tsx`: `pinChildLevel` adopts the level in
  `.then(...)` and records the refusal in a `levelRefusal` state; that state is handed to the child
  composer as `thinkingRefusal` (the slot the main composer already uses). The `toastError` — and
  with it the `apiErrorText` import — is gone: the sentence above the card is the whole account.
- `packages/web/src/features/chat/thinking-level-refusal.ts`: the module comment now names the
  panel as the third caller of `thinkingLevelRefused`, so the "adopt only once the write landed"
  rule it describes covers every picker.

## Tests

- `packages/web/e2e/subagent-thinking-refusal.spec.mjs`: a real server, a real browser and the
  repository's mock model — the child's `PATCH` is stubbed to a 500; the sentence above the child
  composer carries the interface's own words for that code (never the wire's English) and does not
  mention the Agent's default; the picker still reads what the child runs at; nothing is in the
  notification region; it is still there after seven seconds; with the route restored the next pick
  lands, the sentence goes and the child's row carries the pin.
- Unit coverage of the sentence itself is unchanged (`packages/web/test/thinking-level-refusal.test.ts`).

## Compatibility

No wire change, no new dependency, no new string. The panel's pin behaves as before when the write
succeeds; a child's level is still adopted from the next LLM request.
