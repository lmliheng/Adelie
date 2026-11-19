# A self-hosted model with no address says so at once, instead of 20 seconds of raw English

- **Date:** 2026-11-20
- **Type:** fix
- **Scope:** `server`, `web`

[中文](2026-11-20-model-test-no-endpoint.zh.md)

The vLLM, Custom and user-defined groups preset **no** endpoint — the address lives on each model entry. So
a row there with a key but an empty base URL pressed "Test connection" and went like this: the probe had
nowhere to go, the SDK fell back to its own default for the protocol (`api.openai.com` for an
OpenAI-protocol row), burned the full 20-second timeout there and returned a raw network error in English:
`Connection error.: fetch failed: AggregateError (ETIMEDOUT)`. The reader saw "connection error" with no way
to know the address was what was missing.

The server now recognises it **before dialing**: with no address in the draft, on the stored entry, preset by
the group, or in the environment, the route answers with a machine-readable reason
(`cause: "no_endpoint"`) and the dialog says it in the reader's own words — "this group is self-hosted and
has no address of its own; fill in the base URL of your own service, then test again."

## Details

- `packages/server/src/services/project-config-service.ts`, `testModel`: one check before the client is
  built — no base URL in the draft or on the stored entry (`baseUrl: null` is the form's "cleared", and
  counts as cleared), no `gatewayBaseUrl` on the group, no `*_BASE_URL` in the environment (which the probe
  would read itself), and a protocol the row actually has (an explicit `client_type`, or the group's pin,
  as vLLM pins `openai-chat-vllm-adapter`) — then `{ ok: false, cause: "no_endpoint", message: … }`, naming
  the empty field.
- Three kinds of group keep their old behaviour, because a row without an address does have somewhere to
  go there: vendor groups (the routed client's default endpoint is that vendor's own), gateways (the group
  presets the endpoint), and groups that inline the address on every row (Xiaomi). A row with no protocol
  at all is left to the SDK's own `is not supported. Supported client types: …`, which is the accurate
  thing to say there.
- `packages/server/src/api/types.ts`: `ModelTestResponse` gains an optional `cause?: "no_endpoint"`. The
  sentence a person reads belongs to the interface (in both languages); the wire carries the reason.
- `packages/web/src/features/models/model-test-refusal.ts`: that reason gets the interface's own line
  (`models.testNoEndpoint` in `strings.ts` / `strings-en.ts`) instead of the server's English.

## Tests

- Probe (a temporary instance on the freshly built server plus the repo's own mock model, ports 8966/8933):
  - Before: vLLM with a key and no address → `200 (2143ms) {"ok":false,"message":"Connection error.:
    fetch failed: AggregateError (ETIMEDOUT)"}`; Custom and a user-defined group, the same after ~2s.
  - After: the same three inputs → `200 (12–16ms) {"ok":false,"cause":"no_endpoint","message":"Model
    vllm/Qwen/Qwen3.5-9B has no base URL, and its group has none of its own: …"}`.
  - Unchanged: with an address → `ok:true` (connected in 76ms, latencyMs 61); address but no key → still the
    credential refusal; a vendor group (deepseek) with no address → still dialed, and the vendor's own 401
    comes back.
- `packages/server/test/models.test.ts`: two new cases — the self-hosted groups (vLLM / custom /
  user-defined), three inputs and both spellings (omitted and `baseUrl: null`), must answer
  `cause: "no_endpoint"` **with no request leaving the process**; vendor groups, gateways and the
  address-inlining group still dial and carry no such reason. Two existing cases gained a base URL so each
  keeps testing what it was written for (the credential rule; `clearApiKey` not falling back to the stored
  key).
- `packages/web/test/model-test-refusal.test.ts`: one new case (this reason uses the interface's sentence,
  not the relayed English) plus an English assertion in the language case. 6 files / 71 tests on the server
  and 5 files / 56 on the web pass.
- `tsc --noEmit` passes for both packages; the changed files are clean under `oxlint` (0 warnings) and
  `prettier --check`; both new sentences are present in the built web bundle (`vite build`).

## Compatibility

One optional field on an existing response (older clients ignore it); no config format, stored data or CLI
change. One behaviour is stricter: a test probe on a self-hosted row with a key but no address used to dial
the protocol's default endpoint and report a network error after 20 seconds, and now returns "no address"
at once. That is the probe only (it tests connectivity and writes nothing); no saved configuration's normal
request path changes.
