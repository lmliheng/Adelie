# Plugins: a library plugin the working Agent lacks is offered, not listed as installed

- **Date:** 2026-10-08
- **Type:** fix
- **Scope:** `web`

[中文版](2026-10-08-plugin-market-installed-section.zh.md)

The plugins page filed EVERY library plugin under 已安装的插件, whether or not anything had it. The
card inside that section carries the shelf's state for the Agent the page is working with, so the
same screen said "installed plugins" in the heading and 未安装 on the row: two answers about the
same plugin, one of them wrong.

The two sections are now divided by that same state — `splitPluginRows` — so a row can only be
where its own tag says it is:

- the Agent the page is working with holds the plugin (its tag reads 已安装 or 可更新): the row
  stays in 已安装的插件, with the same one-click update it always had;
- it does not: the row moves to 可安装, where its 未安装 tag and its 安装 button are what the
  reader sees. Installing it there moves it back, as before (the two sections are one list).

The Project's module plugins are not per-Agent state and stay in the installed section, where the
Project's own plugin table has always been shown. With no Agent selected there is nothing to
compare against — and the cards draw no state tag either — so the library rows keep their place.

The state filter follows: a library row counts under the state its tag shows (可安装 for a plugin
the working Agent lacks), not under a blanket 已安装.

## Web

- `features/plugins/plugins-page.tsx`: `splitPluginRows`, the `market` field on a library row, the
  state facet off it, and the one card both sections draw for a library row.
- `lib/strings.ts`: the two section headers' doc comments.
