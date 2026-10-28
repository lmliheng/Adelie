# Agents can generate images: one command, a picture in the workspace

- **Date:** 2026-10-28
- **Type:** feat
- **Scope:** `plugins`, `core`, `docs`
- **Breaking:** no

[中文](2026-10-28-use-seedream.zh.md)

Adelie could make a video but not a picture: Ark's image generation (Seedream) was left out of the model
catalog because a Session cannot hold a conversation on it, and no plugin covered the gap. The new
`use-seedream` plugin fills it — one dependency-free Node script that turns a prompt into images and
saves them into the workspace, next to the `use-seedance` the video side already had.

The same command also covers what makes the Seedream family interesting: up to 14 reference images (a
local file is inlined, so nothing has to be uploaded first), a group of up to 15 images in one request,
a **layer split** — one backdrop plus up to 16 individually editable transparent PNG layers, with each
layer's `z_index`, name and bounding box reported back — and transparent backgrounds.

## Details

- `plugins/use-seedream/skills/seedream/kit/seedream.mjs` (new): the runner. One synchronous
  `POST {base}/images/generations`, options sent only when given (`size`, `sequential_image_generation`,
  `layer_decomposition`, `background`, `output_format`, `seed`, `watermark`), images downloaded from the
  answer's URL or decoded from `b64_json`, every file written through `<name>.part-<pid>` and renamed only
  once complete. A `WxH` size is checked locally against the service's pixel window (1280×720 …
  4096×4096) so a bad one is a usage error, not a 400 from the API. Exit codes match the video plugin:
  `0` saved, `2` bad command line, `3` no `ARK_API_KEY`, `4` the API refused (its own text in `upstream`,
  `ModelNotOpen` included), `7` an image did not download.
- A multi-image answer makes `--out` a directory and names files `<NNN>-z<z_index>-<name>.<ext>` — a
  running number for order, the stacking index when the service gives one, the cleaned-up name it
  reported (`base` / `layer` when it reported none). Layers are always PNG.
- `plugins/use-seedream/skills/seedream/SKILL.md` (new): when to use it, the cost warning (a group or a
  layer split is several billed images), the credential check, and the note that Markdown image syntax
  does not resolve in the chat — results are handed over as workspace paths.
- `plugins/use-seedream/{plugin.json,README.md,icon.svg,LICENSE,package.json}` (new): packaged and
  described like `use-seedance`, `category: office-productivity`.
- `packages/{core,cli,desktop}/package.json` + `pnpm-lock.yaml`: `@adelie/use-seedream: workspace:*`, so
  the plugin is preinstalled like the video one.
- `packages/core/test/plugins.test.ts`: the plugin list gains `use-seedream` (and the count moves to 23);
  `plugins/README.md`, `README.md`, `README.zh.md` and `packages/docs/content/skills.{zh,en}.md` carry its
  one-line entry, which the repository's own tables are checked against.
- `plugins/use-seedream/test/seedream.test.mjs` (new): 10 cases against a local stub — the missing key,
  a single download, a group request's body, a layer split's naming and `layers[]`, a local reference
  image inlined as a data URL, a `b64_json` answer, bad flags, and the service's own words on a refusal.

## Compatibility

- Nothing existing changed shape: a new plugin, one more name in the plugin lists.
- The default model is `doubao-seedream-5-0-pro-260628`; another Seedream id goes in with `--model`.
- The live API has not been called yet: the Ark account in this vault has that model **not activated**
  (`ModelNotOpen`), so everything above is verified against the stub, not against the service.
