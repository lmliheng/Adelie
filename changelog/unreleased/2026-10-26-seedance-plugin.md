# A new plugin: ask Adelie for a video, get one (Volcengine Ark Seedance)

- **Date:** 2026-10-26
- **Type:** feat
- **Scope:** `plugins`, `docs`
- **Breaking:** no

[中文](2026-10-26-seedance-plugin.zh.md)

The plugin library gains `use-seedance`: tell your Agent to "make a video of … with Seedance" and it
generates an mp4 with Volcengine Ark's Doubao Seedance models, saves it into the workspace and hands
you the file. It is Adelie's first capability that **produces** video — the eleven Ark rows in the
model library understand video, this plugin makes it.

It ships preinstalled. What is missing is the key: collect an API key from the Ark console and add it
to this Agent's **key vault** as `ARK_API_KEY`. Video is billed by the second and the resolution, so
the Agent reads the prompt back to you before submitting rather than firing off a batch of variants.

## Details

- **The plugin** (`plugins/use-seedance/`): `skills/seedance/SKILL.md` is what the Agent reads, and
  `skills/seedance/kit/seedance.mjs` is the whole runtime — one dependency-free Node file that walks
  Ark's asynchronous three steps for it: `POST /contents/generations/tasks` to submit,
  `GET …/tasks/{id}` to poll with a bounded wait and a backing-off interval, and a download of the
  `content.video_url` it ends on. Default model `doubao-seedance-2-5-260628`, with optional first
  frame / last frame / reference images, duration, ratio, resolution, seed, watermark and audio.
- **The key is read from the environment only** (injected from the vault) and never written to disk;
  the download goes through a temporary file that only gets its final name once it finished, so a
  half-written video never wears it. Exit codes classify the outcome (missing key / refused request
  / failed task / timeout / download failure), and stdout carries one JSON line with the path and the
  task id.
- **Registration**: one line each in `packages/{core,cli,desktop}/package.json`
  (`"@adelie/use-seedance": "workspace:*"`), plus a row in the library's category tables, the two
  root READMEs and the docs page's plugin table — which is exactly what
  `packages/core/test/plugins.test.ts` and `packages/docs/test/skills-sync.test.ts` guard.
- Tests: the eight in `plugins/use-seedance/test/seedance.test.mjs` — a stub server stands in for Ark,
  so submit → poll → download → rename runs end to end on this machine, and the key is asserted to go
  to the API only and never to the video URL (a real task returns a signed link).

## Compatibility

- No new runtime dependency (the script is a dependency-free Node file), so the package adds
  practically nothing to an install.
- It is preinstalled for newly created Agents; existing Agents install it from the library once.
  Without a key the script only tells you `ARK_API_KEY` is missing and touches nothing else.
