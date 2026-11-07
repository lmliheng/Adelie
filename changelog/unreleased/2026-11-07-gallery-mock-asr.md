# The component gallery speaks too: the four speech endpoints are no longer missing from its mock

- **Date:** 2026-11-07
- **Type:** fix
- **Scope:** `ui-gallery`
- **Breaking:** no

[中文](2026-11-07-gallery-mock-asr.zh.md)

Every page of the component gallery runs against one in-memory demo world, and that world's mock has to
answer every endpoint the Web App calls — a test walks the wrappers in
`packages/web/src/api/endpoints.ts` one by one and names any it cannot route. Speech input arrived in the
Web App with 0.6.5, so `getAsrConfig`, `putAsrConfig`, `testAsrConfig` and `asrTranscribe` came with it,
while the mock kept answering them with `gallery_unmocked`: the microphone and "test connection" did
nothing in the demo, and the package's suite went red on it.

All four endpoints are answered now. The read is masked the way the server's is — `hasKey`, never the key;
a save writes the address and the model into the demo world and records the key as stored when one is
given; the connectivity check answers from the fields the form would save (an omitted one falling back to
what is stored) and names the endpoint it used; a transcription says plainly that it is the demo's
stand-in text. The demo world therefore carries one configured speech model, so the settings page opens
on a filled form.

## Detail

- `packages/ui-gallery/src/app/mock/routes.ts`: the four routes, right after `/api/admin/settings` (the
  order `endpoints.ts` keeps); `asrEndpoint()` derives the endpoint by the server's `asrWebSocketUrl` rule.
- `packages/ui-gallery/src/app/mock/fixtures.ts`: one `DemoFixtures.asrConfig` row (the default gateway,
  its one model, `hasKey: true`), typed by the server's `AsrConfig` DTO so a DTO change fails here first.
