# A model with no quota left can still be left inside the conversation

- **Date:** 2026-10-29
- **Type:** feature
- **Scope:** `core`, `server`, `web`
- **Breaking:** no

[中文](2026-10-29-model-switch-drops-dead-context.zh.md)

Switching the model inside a conversation starts by having the **current** model compact the context into a
summary — and that summarize request goes to that same model. So once a model is entirely unusable (quota
exhausted, credential rejected, endpoint down), the conversation is stuck on it: the first step of leaving it
cannot be sent.

The switch dialog now carries a box that is off by default: **switch even if it cannot be compacted**. With it
ticked, a compaction that really cannot run means the context is dropped whole instead, nothing further is
sent, and the conversation moves to the target model. The failed summarize's event pair is followed by a
`discard` pair, so what happened is visible in the transcript. The box says what it costs: the summary is gone —
the transcript stays, but the new model does not inherit that working memory.

A caller can ask for the same thing directly: `POST /api/sessions/:id/switch-model` with
`onCompactionFailure: "discard"`. Leaving it out is the old behaviour (the switch fails and stays put). An
abort is not a compaction failure and never drops a context.

## Details

- `packages/core/src/engine/context-engine.ts`: `SwitchFailurePolicy = "stay" | "discard"`, and
  `switchContext(signal?, opts?)` — when a summarize does not complete and the caller asked for `"discard"`, a
  `discard` event pair follows (`discardContext("manual")`, which sends nothing) and the switch completes. Only
  `fatal` / `retryable` failures degrade; `aborted` and a switch that never got to start a compaction are left
  as they were. What rides to the new context is still text alone, matching the switch's existing rule.
- `packages/core/src/session.ts`: `ModelSwitchOptions.onCompactionFailure` is passed through, and the type joins
  core's export list.
- `packages/server/src/runtime/session-manager.ts`: `startSwitch` takes a third argument and passes it on.
  `POST /:sessionId/switch-model` validates the field with `optionalEnum` (anything outside the pair is a 400),
  and `SessionSwitchModelRequest` (`packages/server/src/api/types.ts`) carries it.
- `packages/web/src/features/chat/chat-page.tsx`: the box is offered only on the shape that really compacts (the
  other two run no compaction), off by default, and only a ticked box puts `onCompactionFailure` in the request
  body.
- Copy: one key and its hint in `strings.ts` / `strings-en.ts` (`modelSwitchInSessionDiscardFails`).
- Tests: two in `packages/core/test/model-switch.test.ts` (a failure that degrades rotates onto the target with
  no summary in its file; an abort does not degrade), one in
  `packages/core/test/prompt-cache-invariants.test.ts` (the retry-exhausted kind of failure degrades too, and the
  dead model receives nothing more), two in `packages/server/test/session-switch-model.test.ts` (the field reaches
  core as sent; an invalid value is a 400).
- Docs: the in-session model switch section of `packages/docs/content/sessions-and-traces.{zh,en}.md`.

## Compatibility

- Omitting the field is the old behaviour: a failed compaction keeps the model. Nothing about the on-disk or
  Trace record shapes changes (only the already-existing `discard` pair appears), and AMSP is untouched.
