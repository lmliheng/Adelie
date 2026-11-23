# The model library gains a Tencent TokenHub group

- **Date:** 2026-11-23
- **Type:** feat
- **Scope:** `core`, `web`, `docs`

[中文](2026-11-23-tokenhub-group.zh.md)

The model library now has a **Tencent TokenHub** group. Paste one key from TokenHub's console and
its Hy presets are ready to pick in a Session.

It is a group of its own rather than more rows on the existing Tencent Hunyuan entry, because it is
a different service: TokenHub (腾讯云大模型服务平台) is Tencent Cloud's model gateway, with its own
console and its own key — the Hunyuan direct endpoint answers a TokenHub key with `invalid_api_key`
(checked 2026-11-23). Besides Tencent's own Hy models the gateway also resells Kimi, GLM, DeepSeek
and MiniMax; only its first-party Hy chat models are catalogued here, since a resold model already
has a group that is the seller for it.

## Details

- `packages/core/src/state/model-catalog.ts`: new `MODEL_PROVIDERS` entry `tokenhub` (label
  "Tencent TokenHub", OpenAI-compatible `gatewayBaseUrl`, the vendor's key and model-list document
  pages — the console's key page sits behind a login and could not be read from here) placed after
  `tencent`; new `TOKENHUB_BASE_URL = "https://tokenhub.tencentmaas.com/v1"`; a new `MODEL_CATALOG`
  cluster of three presets, each `clientType: "openai-chat"` with the endpoint inlined. Windows are
  the model-list document's "maximum input" (the catalogue's single window cannot also carry its
  separate maximum output) and the vision flags follow each row's documented capability line: the
  Hy4 pair reads images, Hy3 does not.
- Prices: only `hy4` has a rate that could be read — models.dev's generated Tencent TokenHub entry,
  whose USD figures are Tencent's round CNY ones at the 7:1 convention this catalogue stores (cache
  hit 0.29 / input 5.84 / output 17.5 ¥ per million). `hy4-flash` and `hy3` are left **unpriced**
  rather than borrowed from a neighbouring model: the vendor's own price page is client-rendered
  and its price-list PDF is gone, so nobody here has read them.
- `packages/web/test/model-grouping.test.ts`: the default group order now expects `tokenhub` after
  `tencent`.
- `packages/core/test/model-catalog.test.ts`: asserts the provider entry, the group's base URL, and
  each of the three presets (id, window, vision, protocol and inlined endpoint).
- `packages/docs/content/models.{zh,en}.md`: the provider table and the preset list each gain a row,
  and a new "Tencent TokenHub" section explains the group and where the prices come from.

## Compatibility

One group and three presets are added to the catalogue; the data root, the Trace format and the API
shapes are unchanged. Nothing is sent to TokenHub until a key is entered.
