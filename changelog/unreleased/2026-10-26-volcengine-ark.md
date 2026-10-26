# Volcengine Ark (ByteDance) joins the model library, Doubao Seed included

- **Date:** 2026-10-26
- **Type:** feat
- **Scope:** `core`, `web`, `ui`, `docs`
- **Breaking:** no

[中文](2026-10-26-volcengine-ark.zh.md)

The model library gains a Volcengine Ark group, sitting just after iFlytek. It carries the eleven
models served by ByteDance's own platform, Ark: seven of the Doubao Seed family, plus the four Ark
resells (GLM, Kimi, two DeepSeek). A Project gets them with **Sync presets** or from its next new
Project.

Everything is one OpenAI-compatible endpoint, `https://ark.cn-beijing.volces.com/api/v3`, so an Ark
console API key pasted into the group header is all it takes: no protocol to pick, no endpoint to
type. Seven of the eleven rows take video input — the six Doubao Seed rows and the resold GLM-5.3-Flash — and
are labelled **Video** on their card.

## Details

- **The rows** (`core/src/state/model-catalog.ts`): `doubao-seed-evolving`, `doubao-seed-2-1-pro-260915`,
  `doubao-seed-2-1-lite-260915`, `doubao-seed-2-1-turbo-260628`, `doubao-seed-2-0-lite-260428`,
  `doubao-seed-2-0-mini-260428`, `doubao-seed-character-260628`, and `glm-5-3-flash-260828`,
  `kimi-k3-1-pro-261024`, `deepseek-v4-1-flash-261017`, `deepseek-v4-pro-ga-260813`. Windows,
  modalities and prices are read from Ark's own model list and pricing page (2026-10-25); the
  published CNY-per-million rates are stored as USD at a fixed 7:1. Ark prices by input length and
  only the base tier is recorded. `deepseek-v4-1-flash-261017`'s peak/off-peak pair matches
  DeepSeek's own, so it reuses that off-peak rule.
- **Protocol and credentials.** Ark has no AgentHub client, so every row pins Chat Completions
  (`openai-chat`) and carries the endpoint on itself; a keyless row is refused rather than sent the
  `OPENAI_API_KEY` the generic client would read.
- **Video input.** `ModelCatalogEntry` gains `supportsVideo` (default **unsupported**; only `true` is
  ever written) and the seven multimodal rows carry it (the six Doubao Seed rows and GLM-5.3-Flash). The
  model list reports it as `video`, which is what the composer reads to decide whether a clip rides to the
  model or lands as a file (see the next change).
- **Brand marks.** `packages/ui`'s provider logos gain real marks for Ark and for Abliteration
  (from each vendor's own site, flattened to one colour, wordmark and plate dropped), so the model
  library and the model picker stop showing a letter tile for them.
- Docs: a row in the provider table, a section per language, a row in the preset table and the
  **Video** card label in `packages/docs/content/models.zh.md` / `models.en.md`.
- Tests: `core/test/model-catalog.test.ts` (group order, gateway set, the rows that carry a base URL,
  the off-peak list) and the group order in `web/test/model-grouping.test.ts`.

## Compatibility

- No dependency change and nothing stored is rewritten: an existing Project keeps its rows, and the
  new group appears with its eleven presets after **Sync presets**.
- The Ark endpoint is only used once a Session is switched to one of these models; existing Sessions
  keep theirs.
