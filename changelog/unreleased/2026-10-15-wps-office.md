# Adelie can now read and edit the WPS document you are looking at

- **Date:** 2026-10-15
- **Type:** feat
- **Scope:** `plugins`

[中文版](2026-10-15-wps-office.zh.md)

New plugin: **WPS** (`@adelie/use-wps-office`). It puts an Adelie conversation inside WPS Writer —
a side panel opened from a button in the ribbon — and puts the document that is open on your screen
under the agent's hands: nine operations (summary, read, search, replace, insert, delete, insert a
break, create, reveal) are exposed to a Session as `mcp__wps__*` tools.

The runtime is one dependency-free Node file (`kit/serve.mjs`), and it stays on the machine: the
bridge binds `127.0.0.1`, Adelie is reached over loopback, and no port is opened to the network. The
bridge plays four parts and nothing else — it hosts the add-on's page, sends document commands to the
panel that executes them, talks to Adelie on the panel's behalf, and registers the add-on with WPS
through WPS's own local publish service (`127.0.0.1:58890`). A bridge is needed at all because the
panel runs in WPS's embedded browser on a different origin, and Adelie deliberately enables no CORS.

Editing goes through the person: panel Sessions start `read-only`, so reads run freely while every
write is an approval the person answers in the panel. `replace_paragraph` and `delete_paragraph`
take an optional `expect` — the paragraph's current text — and refuse when it no longer matches
("the paragraph changed, read it again"), because the numbers a model read can go stale.

Commands are one at a time, in order: two writers on one document would make both unreadable. A
command the panel never answers fails with a readable message instead of hanging the turn.

`install.mjs` writes the settings, registers the add-on with WPS, registers the bridge as one MCP
server in the agent's config and self-checks the connection, leaves a launcher in the Windows login
Startup folder, and starts the bridge. Every step is idempotent, so running it again is also the
repair; `uninstall.mjs` is its mirror. Settings, state and `bridge.log` live under
`<data root>/wps-bridge/`, never in the plugin directory, which is replaced wholesale on update.

**Not verified:** the WPS side itself. The panel and the bridge are tested here (bridge, install
and add-on hosting under `node --test`; fourteen browser tests driving the real panel against a
stub WPS), but the ribbon button, the task pane and the document API only exist on a machine with
WPS installed — that first run has to happen on Windows, with WPS open.
