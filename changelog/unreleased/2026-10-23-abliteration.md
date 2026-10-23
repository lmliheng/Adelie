# Abliteration's uncensored models are in the model library

- **Date:** 2026-10-23
- **Type:** feat
- **Scope:** `core`, `docs`
- **Breaking:** no

[中文](2026-10-23-abliteration.zh.md)

The model library gains an Abliteration group, sitting just before vLLM. Its four rows are the
"abliterated" — refusal-ablated — models that service sells, and a Project gets them with
**Sync presets** or from its next new Project.

Everything is one OpenAI-compatible endpoint, `https://api.abliteration.ai/v1`, so a key of the
`ak_…` shape pasted into the group header is all it takes: no protocol to pick, no endpoint to
type. The group is closed like every other gateway — its presets arrive with the catalog, and no
model is added by hand.

## Details

- **The rows** (`core/src/state/model-catalog.ts`): `abliterated-model-large-v2` (the vendor's
  recommended default) and `abliterated-model-large` at a 1,000,000-token window, text only;
  `abliterated-model-large-flash` at 1,048,576 with image input; `abliterated-model` at 262,144
  with image input. Read from the service's own `GET /v1/models` on 2026-10-23, which publishes
  the windows, the input modalities and the per-token rates the rows record.
- **Protocol.** None of those ids matches a rule AgentHub routes by, so each row pins
  `openai-chat` and carries the endpoint on itself; that is also what makes the group speak the
  same protocol as its presets for the frontend's dialogs. The endpoint serves `/responses` too,
  so a row can be switched to it by hand.
- **Prices** are the published per-token rates converted to the catalog's USD-per-million
  buckets: input 1 or 3, output 2/3/5, cache hits 0.1 or 0.3. The service publishes no
  cache-write premium, so `cache_write` repeats the input rate. No promotion is running, so a
  Project stores these as the list prices.
- **Credential rule:** unchanged and deliberately unhelpful — a keyless row of this group is
  refused rather than sent the `OPENAI_API_KEY` the generic client would read, because the
  endpoint is not OpenAI's. The key goes on the group or on the row.
- Docs: a row in the provider table plus a short section in `packages/docs/content/models.zh.md`
  and `models.en.md`.
- Tests: `core/test/model-catalog.test.ts` (the group's rows, prices, vision flags, protocol and
  endpoint, plus the group order and the gateway aggregations) and the group order in
  `web/test/model-grouping.test.ts`.

## Compatibility

- No dependency change and nothing stored is rewritten: an existing Project keeps its rows, and
  the new group appears with its four presets after **Sync presets**.
- The group renders as a letter tile, like any group without a brand mark in the UI package.
