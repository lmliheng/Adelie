# The model library gains a Venice AI group

- **Date:** 2026-11-22
- **Type:** feat
- **Scope:** `core`, `web`, `docs`

[中文](2026-11-22-venice-ai-group.zh.md)

The model library now has a **Venice AI** group. Paste one key from
<https://venice.ai/settings/api> into the group and its presets are ready to pick in a Session.

It is catalogued for its **uncensored** line, so the nine presets are that curation rather than the
130-odd rows the vendor's full list carries: its own `venice-uncensored-*` models, plus the
abliterated and "uncensored" fine-tunes of other vendors' models it serves (DeepSeek V4.1 Flash
Uncensored, GLM 5.3 Flash Uncensored, Qwen 3.6 Plus Uncensored and the like).

Every preset reaches the models through the generic Chat Completions client and carries
`https://api.venice.ai/api/v1` inline. Venice's ids are the seller's own spellings; the ones that
happen to carry a vendor substring (`deepseek-v4…`, `glm-5…`) would otherwise be routed to that
vendor's dedicated client, whose request shape assumes the vendor's own service.

## Details

- `packages/core/src/state/model-catalog.ts`: new `MODEL_PROVIDERS` entry `venice` (label
  "Venice AI", OpenAI-compatible `gatewayBaseUrl`, key page and model-list URLs) placed after the
  abliteration group; new `VENICE_BASE_URL`; new `MODEL_CATALOG` cluster of nine presets, each
  `clientType: "openai-chat"` with `baseUrl` inlined. Window, vision/video flags and the three
  per-million-token USD rates come from the vendor's own list endpoint
  (`https://api.venice.ai/api/v1/models?type=text`, read 2026-11-22 through the models.dev
  provider set, which is generated from it). `cache_write` repeats the input rate except on
  `qwen-3-6-plus`, whose list publishes a genuine write premium — the same rule the other gateway
  clusters follow.
- `packages/web/test/model-grouping.test.ts`: the default group order now expects `venice` after
  `abliteration`.
- `packages/core/test/model-catalog.test.ts`: asserts the provider entry, the group's base URL,
  and each of the nine presets (id, window, vision, three rates, pinned protocol and inlined
  endpoint, the video flag).
- `packages/docs/content/models.{zh,en}.md`: the provider table and the preset list each gain a
  row; a new "Venice AI" section explains the group, why the protocol must be pinned, and where
  the prices come from.

## Notes on the curation

- `gemma-4-uncensored` is left out: the vendor's own list still carries it but marks it
  **deprecated**, so it is not preset for a later cleanup.
- `qwen-3-6-plus` is billed more above a 256K prompt (input 2.5 / output 7.5 per million). This
  catalog cannot express a tiered rate, so the row stores the base rate.

## Compatibility

One group and nine presets are added to the catalogue; the data root, the Trace format and the API
shapes are unchanged. Nothing is sent to Venice until a key is entered.
