# Every package this repository publishes moved to the `@adelie` scope

- **Date:** 2026-10-17
- **Type:** refactor
- **Scope:** `core`, `server`, `cli`, `plugins`, `tooling`
- **Breaking:** yes — every published package name changed (see Compatibility)

[中文版](2026-10-17-packages-adelie-scope.zh.md)

The repository's own packages carry `@adelie/` names. The three host packages are `@adelie/core`,
`@adelie/server` and `@adelie/cli`. The packages under `packages/` dropped the `penguin-` prefix —
`@adelie/ui`, `@adelie/web`, `@adelie/ui-gallery`, `@adelie/hmr`, `@adelie/desktop`, `@adelie/docs`.
The twenty plugins kept their names in the new scope (`@adelie/agent-company`, `@adelie/goal`,
`@adelie/use-wps-office`, …) and the four sandbox adapters became `@adelie/sandbox-bwrap`,
`@adelie/sandbox-dsh`, `@adelie/sandbox-seatbelt` and `@adelie/sandbox-wsl`.
`@adelie/amsp` kept the name it was given.

The scope is compiled in, not only written in manifests: `PLUGIN_PKG_PREFIX` in core,
`PLUGIN_SCOPE` in the server, the filter that collects the plugin packages in the desktop packer,
and the check in `penguin update` that recognises a pnpm global install all read `@adelie/` now,
each with the test that pinned it. The generated `ifaces.json` of the server and of the four
sandbox adapters name the new packages, as do the installer scripts, the Dockerfile and the docs.

## Compatibility

Every dependency on a package this repository publishes changes with it: `@lmliheng/penguin-core`
becomes `@adelie/core`, `@lmliheng/penguin-server` becomes `@adelie/server`, and
`@lmliheng/penguin-cli` becomes `@adelie/cli`. Install the CLI as `npm install -g @adelie/cli`;
the command it puts on `PATH` is still `penguin`. A Project that names a plugin in its `[plugins]`
table writes the new name (`@adelie/requirements-box`).

The names the earlier releases used stay on the registry untouched, so an existing installation
keeps resolving what it already pinned; the release that publishes these names deprecates them in
favour of the new ones.

Nothing else was renamed: the `penguin` and `penguin-hmr` commands, the `PENGUIN_*` environment
variables and the repository at `github.com/lmliheng/Adelie` keep the names they had.
