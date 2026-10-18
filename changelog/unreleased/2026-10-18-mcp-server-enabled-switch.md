# An MCP Server can be switched off without deleting it

- **Date:** 2026-10-18
- **Type:** feature
- **Scope:** `core`, `web`, `docs`, `plugins`
- **Breaking:** no — an entry without `enabled` behaves exactly as before

[中文版](2026-10-18-mcp-server-enabled-switch.zh.md)

The MCP Servers block in the agent settings now has a per-row on/off switch. Switched off, the
entry and every field of it stay in the config, but no turn connects that server and its
`mcp__*` tools leave the tool list. Until now the only way to stop a server from being connected
on every turn was to delete its entry and type it in again later — which is why an installed
plugin's bridge (the WPS add-in's, for one) kept showing up in every conversation even when the
plugin was not being used.

## Details

- The switch writes `enabled: false` into the entry's `config`; turning it back on removes the
  key, so an active entry keeps following the default. The same field can be set by hand in
  `system_config.yaml`, and the docs (`/docs/tools` § MCP Servers) describe it in both languages.
- Core's resolver drops a switched-off entry **before** it looks at the transport: a parked entry
  whose target no longer exists (an uninstalled plugin's bridge) produces no warning on every
  session, and cannot fail one.
- `enabled` must be a boolean. A quoted `"false"` is rejected instead of silently reading as on.
- `POST /config/mcp-test` still probes a switched-off entry, so a server can be tested before it
  is turned on; the probe does not save anything.
- The WPS add-in's bridge no longer reconnects forever when the session it remembers is gone: a
  404/410 on a session stream now stops the subscription and logs one line at info level. It used
  to treat every failure as transient and write a warning every 10 seconds, indefinitely.
