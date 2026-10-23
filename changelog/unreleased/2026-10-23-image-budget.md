# A conversation full of pictures no longer fails whole — only the newest four go out

- **Date:** 2026-10-23
- **Type:** fix
- **Scope:** `core`, `docs`
- **Breaking:** no

[中文](2026-10-23-image-budget.zh.md)

Abliteration accepts at most four images in one request and refuses the whole request beyond
that (`400 … media_count_exceeded`). A conversation replays its images on every later request,
so a Session that had read five pictures failed every turn from then on — the same error sitting
in the chat no matter what was typed next.

Each request is now trimmed to the model's own limit: the **oldest** images are replaced with a
one-line `[image omitted: …]` placeholder and the newest four stay (images in the new input take
their share first). The stuck conversation works again, and nothing is lost from the
conversation or its Trace.

## Details

- **The limit lives in the catalog.** `ModelCatalogEntry` gains `maxImages`; Abliteration's four
  rows carry 4, and `catalogImageLimit()` reads it by `(provider, model_id)`. Models without the
  field — every other row in the catalog — behave exactly as before.
- **Trimmed before the request** (`core/src/llm/generative-model.ts`): `streamGenerate` calls
  `fitReplayedImages` before opening the upstream stream. The new input's images are counted
  first, the remaining budget goes to the history newest-first, and when it does not fit,
  `capHistoryImages` rebuilds the history and hands it to AgentHub's `setHistory` (the objects
  `getHistory` returns are never mutated in place). A tool result's images are trimmed inside its
  own `images` array with the placeholder appended to its text. When the new input alone fills
  the budget, every replayed image becomes a placeholder.
- **The input is trimmed too when it overflows by itself.** Five pictures read in one turn are
  merged into a *single* input message, and an interrupted turn is resent as new input when the
  Session continues — trimming only the history would leave that request carrying five and
  refused again. The input is now capped first (the newest four stay, older ones become the
  placeholder), the history takes what is left of the budget, and `fitReplayedImages` hands back
  the message to send instead of mutating the caller's.
- **The Session model carries it** (`core/src/agent.ts`): `buildLLM` looks the limit up in the
  catalog and passes it as `GenerativeModelConfig.maxImages`. A context rebuilt after compaction,
  or for a switched model, goes through the same constructor.
- Tests: `core/test/image-budget.test.ts` (counting, per-message trimming, tool-result trimming,
  no mutation of the originals, a zero budget, the untouched path with no limit, the wiring that
  counts the new input, an input that overflows by itself keeping only the newest four, and the
  placeholder naming the seller's cap rather than the leftover budget) and `core/test/model-catalog.test.ts` (the four rows carry 4; no
  other model and no id outside the catalog does).
- Docs: the Abliteration section of `models.zh.md` / `models.en.md` states the limit and what
  the trimming does.

## Compatibility

- No new configuration and no stored data rewritten: the limit comes from the built-in catalog,
  and an existing Session works around it on its next request.
- Models with no limit send exactly what they sent before; only the four catalogued rows carry
  one.
