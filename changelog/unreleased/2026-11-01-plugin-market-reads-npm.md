# The plugin market lists the plugins published to npm, not only the ones this build carries

- **Date:** 2026-11-01
- **Type:** feature
- **Scope:** `server`, `web`, `plugins`, `docs`
- **Breaking:** no

[中文](2026-11-01-plugin-market-reads-npm.zh.md)

Until now the shelf was whatever a build carried: a plugin reached the market only by being added to
the repository and shipped with a release. A plugin `@adelie/gpu-model-serving` had to be collected
into the build for that reason alone. The shelf now has a second side that is read from npm, so a
package reaches it with its next version.

The rule is the package's own declaration: a package scoped `@adelie/` and carrying the
`adelie-plugin` keyword is on the shelf. The scope is what makes the keyword safe to read — anyone
may publish a package with a keyword, nobody outside the project can publish under that scope.
Every plugin package in `plugins/` now carries the keyword (the four `sandbox-*` ones stay out:
they are `private` and never reach npm), so a release is all it takes for them to appear there too.

What a published entry offers is one action, **Add to the library** — the npm import an operator
would otherwise type into the download dialog themselves, an admin's action like every other write
into the plugin directory. Once it lands, the plugin is like any other: install it on an agent to
put it to work. An entry this build already carries is the build's own, with the version installed
here; the published side is for plugins that got to npm without a release.

## Details

- `packages/server/src/plugin/registry.ts`: `npmPluginRegistry` reads npm's search API
  (`keywords:adelie-plugin`, restricted to the `@adelie/` scope) and maps each result to a shelf
  entry — name, version, description, authors, license, the package's npm page as `homepage`, its
  repository with npm's `git+`/`.git` stripped, keywords and publish date. A result the registry
  described incompletely is left out rather than shown as a nameless row. One listing serves every
  caller and is cached for ten minutes (two after a failure, which serves the previous one); a
  readme is the package's own, read from its packument, cached per name including the miss.
- `packages/server/src/http/routes/plugins.ts`: the registry routes now assemble the shelf from two
  sources — what the build carries first, then the published side — deduplicated by name, with the
  readme taken from the first source that has one.
- `packages/web/src/features/plugins/plugins-page.tsx`: a row per published entry that neither the
  build nor the library holds, filed under **Available** whatever agent the page is working with,
  its verb **Add to the library**. A 409 opens the same overwrite confirmation the import dialog
  raises, and the answer re-sends the request with `overwrite`.
- `ADELIE_PLUGIN_MARKET=off` turns the outbound lookup off, leaving the shelf local — what an
  offline or closed network wants. The server's automatic outbound calls are now two: the update
  check and this one.
- `plugins/*/package.json`: sixteen public plugin packages gain the keyword (eight already had it).
- `packages/docs/content/skills.{zh,en}.md` and `configuration.{zh,en}.md`: the second side of the
  shelf, what an entry on it offers, and the new variable.

## Compatibility

- No interface changed: the registry response and the shelf UI gained rows, not fields.
- A deployment with no route to npm sees what it saw before — the library, the plugin directory and
  the plugins this build carries. The lookup never fails a page load.
- The keyword arrives on npm with each package's next release; until then those packages are still
  on the shelf whenever a build carries them.
