# The catalog gains the four Google Gemini 4 models, and the model dialog shows a built-in row's endpoint

- **Date:** 2026-11-26
- **Type:** feat
- **Scope:** `core`, `web`, `docs`

[中文](2026-11-26-gemini-4-models.zh.md)

The built-in catalog's Google Gemini group gains **Gemini 4**: `gemini-4-carbon`, `gemini-4-argon`,
`gemini-4-neon` and `gemini-4-hydrogen` (all with a 1,048,576-token window, all reading images).
Each pins the same Gemini client (`client_type = "gemini-3.8"`): AgentHub dispatches Gemini on the
`gemini-3` substring of the id, which these four ids do not carry, so an unpinned row fails outright
at run time with "is not supported". Neon and Hydrogen publish a single rate; Carbon and Argon are
the flagship reasoning tier at a list price Google halves through 2026-11-30 (back to list from
2026-12-01), so those two rows store the list price and declare the half-off.

Alongside it, one thing that never lined up: opening **Model config** on a built-in (catalog) model
shows a locked custom base URL field with a note saying the catalog fixes the endpoint — and the
field itself was empty. Direct-vendor rows deliberately store no base URL (the client brings one),
so the dialog asserted an address it never showed. That field now shows the built-in address as its
placeholder: `https://generativelanguage.googleapis.com` for the Google group, `https://api.openai.com/v1`
for OpenAI, a gateway's preset endpoint for a gateway. vLLM and Custom stay empty — their address is
yours.

## Details

- `packages/core/src/state/model-catalog.ts`: four `gemini-4-*` rows in the `google` group, each with
  `clientType: "gemini-3.8"`. Windows, modalities and rates come from Google's own model and pricing
  pages and were checked against models.dev's `google` provider (2026-11-26); the file header's
  verification date notes it.
- `packages/core/test/model-catalog.test.ts`: the `google` group's id-order pin takes the four rows;
  the "direct-vendor groups carry no client_type / base_url" case lists them as exceptions (beside
  `glm-4.7-flash`) and asserts each pin; price assertions cover Carbon / Argon's list price and
  half-off, and Neon / Hydrogen's single rate.
- `packages/web/src/features/models/official-endpoint.ts` (new): `officialEndpoint(info)` — a
  gateway's `gatewayBaseUrl`, else the first host in `VENDOR_ENDPOINTS` (the same table the
  credential fallback reads); `undefined` for the two addable groups, `custom` and vLLM. Four cases
  in `packages/web/test/official-endpoint.test.ts`.
- `packages/web/src/features/models/models-page.tsx`: the locked base URL input uses that address as
  its placeholder when the row stores none, instead of "Leave empty to use the provider default".
- `packages/docs/content/models.{zh,en}.md`: the preset list takes the four ids, a section explains
  the pin, why the endpoint is not on the rows and how long the Carbon / Argon promotion runs, and
  the prices section follows.

## Compatibility

Only new presets and one read-only hint; interfaces, the data root, protocols and existing groups'
rows are untouched. A Project in use picks the four up with **Sync presets**; a new Project has them
from the start. Carbon's and Argon's promotion is kept in the server database, the same way every
other Gemini promotion is.
