# gpu-model-serving joins the library: standing up a model service on a rented GPU box

- **Date:** 2026-11-01
- **Type:** feature
- **Scope:** `plugins`, `core`, `docs`
- **Breaking:** no

[中文](2026-11-01-gpu-model-serving-plugin.zh.md)

`gpu-model-serving` lived on npm only (`@adelie/gpu-model-serving`), so it reached an Agent through the
**import from npm** path and appeared nowhere in the plugin market. It ships with the build now, and
both the library and the market carry it.

The skill it brings turns a GPU box into an OpenAI-compatible endpoint: pick the instance and where
the weights live, take an already-quantized checkpoint, build the pip CUDA toolchain, start
`serve.sh` detached, then verify health, the model list, a tool call, streaming and a repeated
prefix. What the first attempt costs is written down as symptom, cause and fix in
`reference/pitfalls.md`; a complete working `serve.sh` with the memory arithmetic is in
`reference/sglang-serve.md`; the console, port mapping and billing of a rented instance are in
`reference/gpu-cloud-console.md`.

Not preinstalled: it goes onto the Agents that serve models, not onto every new one.

## Details

- `plugins/gpu-model-serving/` (new): `plugin.json` (`category: software-development`,
  `preinstall: false`), `package.json`, `icon.svg`, `LICENSE` (Apache-2.0), `README.md`, and
  `skills/gpu-model-serving/SKILL.md` with four reference documents. The content is the published
  npm version (`@adelie/gpu-model-serving@0.1.0`, the plugin's own version `2026.10.30.1`), with two
  additions for the repository's conventions: `package.json` follows the workspace version
  (`0.6.1`), and `SKILL.md` gains the `## Before you start` section every library skill carries.
- `packages/{core,cli,desktop}/package.json` and `pnpm-lock.yaml`:
  `@adelie/gpu-model-serving: workspace:*` — the loader reads plugin names out of the host package's
  dependencies, and a plugin that is not declared there is invisible to the market.
- The market shelf grows from 27 entries to 28 (the four hand-written sandbox backends plus one per
  shipped plugin package); this one is `@adelie/gpu-model-serving`, version `2026.10.30.1`, category
  `software-development`, all read from the package itself.
- `packages/core/test/plugins.test.ts`: the plugin count goes 23 → 24.
- `plugins/README.md`, `README.md`, `README.zh.md` and `packages/docs/content/skills.{zh,en}.md` each
  gain a row — the repository's guards compare those tables against the library entry by entry.
- The user plugin at `<data root>/plugins/gpu-model-serving/` stops taking effect: the built-in copy
  of a name wins (`pluginRoots`). The two are byte-for-byte identical, so that copy can simply go.

## Compatibility

- No interface changed: one more plugin, one more name in the manifest and in the two tables.
- A deployment that installed this plugin from npm gets the built-in copy instead after an upgrade;
  both carry plugin version `2026.10.30.1`, so nothing reports an available update.
