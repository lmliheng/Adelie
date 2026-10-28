# A pushed platform boots on an older runtime again

- **Date:** 2026-10-28
- **Type:** fix
- **Scope:** `server`
- **Breaking:** no

[中文](2026-10-28-platform-config-candidates.zh.md)

Ported from PenguinHarness `64aebf0f` (`#1058`).

A hot push replaces the platform, never the runtime. Because `penguinGoOrigin` was listed among the
config members a platform claims, every installed runtime that predates that member — anything
before the Go-provider work — refused the handshake, so a compatible platform could not be pushed
to it, and each refused push could still restart the server. The same rule now also covers
`modelscopeBridgeUrl`, which the handshake never required but whose consumer had no fallback and
could read `undefined` on such a runtime.

A config member added after runtimes shipped no longer enters the claimed list: it is optional on
`ServerConfig`, and its consumer supplies the production default when the runtime publishes none —
the same shape `cliEntry` already had.

## Details

- `packages/server/src/hmr/capabilities.ts`: `penguinGoOrigin` leaves `HMR_INTERFACES.config`, with
  the rule written above the list naming `cliEntry`, `penguinGoOrigin` and `modelscopeBridgeUrl` as
  the members that must stay out.
- `packages/server/src/config.ts`: both members are optional on `ServerConfig` and say why.
- `packages/server/src/services/{platform,modelscope}-auth-service.ts`: the providers fall back to
  `normalizePenguinGoOrigin(undefined)` / `normalizeModelScopeBridgeUrl(undefined)` — the
  production origin and bridge — instead of passing `undefined` on.
- `packages/server/test/hmr-resources.test.ts`: one regression case — no member added after
  runtimes shipped is named, and a runtime claiming today's list without them still claims.

## Compatibility

- No API, wire-format or stored-data change: the same values are published to a current runtime,
  and an older runtime now gets the handshake instead of a refusal.
