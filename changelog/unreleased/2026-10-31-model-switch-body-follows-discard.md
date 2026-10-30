# The switch dialog's sentence follows its "switch even if it cannot be compacted" box

- **Date:** 2026-10-31
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-31-model-switch-body-follows-discard.zh.md)

In-conversation model switching compacts the context on the model being left first, and that model
is the one that has to write the summary — so a model whose every request fails (quota exhausted, a
rejected credential) could never be left. The confirm dialog therefore carries one opt-in box,
"switch even if it cannot be compacted": with it ticked a failed compaction drops the context and
the conversation moves anyway.

The dialog's own sentence did not follow that box: ticked, it still promised *"if the compaction
fails, it stays on the current model"* — the exact opposite of what the box says one line below and
of what the switch then does. Two promises in one dialog, and the wrong one read first.

The body now follows the box: unticked it keeps the original promise, ticked it says the
conversation moves to the target and gives up the summary. Nothing else about the switch changed.

## Details

- `packages/web/src/lib/strings.ts` / `strings-en.ts`: one new key pair,
  `modelSwitchInSessionBodyDiscard(from, to)` — the compacting body for the ticked case.
- `packages/web/src/features/chat/chat-page.tsx`: the dialog's body moves out of the JSX into one
  `modelSwitchBody` value that reads the shape and the box; a comment says why the plain sentence
  cannot stand beside a ticked box.

## Tests

- `packages/web/test/model-switch.test.ts`: the new sentence is exact in Chinese, and neither
  locale's discard body still promises to stay.
- `packages/web/e2e/model-switch-discard.spec.mjs` (new, three browser cases against the mock
  model): unticked, the box starts off, the body promises to stay, and the request carries only
  `{provider, modelId}`; ticked, the body switches to the discard sentence and the request carries
  `onCompactionFailure: "discard"`; a conversation with nothing to compact offers no box at all
  (its dialog reads 切换).
- Counter-proof: reverting just `chat-page.tsx` and rebuilding the Web bundle turns exactly the
  ticked case red — red on "the body still says it stays on the current model" — with the other
  two green.

## Compatibility

- No API, on-disk or request-shape change; the switch itself and its refusals are untouched.
