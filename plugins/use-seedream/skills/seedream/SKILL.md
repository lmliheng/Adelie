---
name: seedream
description: Generate images from a prompt with Volcengine Ark's Doubao Seedream models — one synchronous request that answers with image URLs or inline base64, saved into the workspace through temporary files, with optional reference images, groups and layer decomposition, driven by a vault-stored API key.
---

# Seedream (Doubao image generation)

Volcengine Ark's image generation API turns a prompt — and, if you have them, reference images —
into pictures. It is **synchronous**: one POST answers with the images themselves, as URLs to
download or as inline base64. `kit/seedream.mjs` is one dependency-free Node script that builds
the request, fetches or decodes every image and saves them into the workspace, so a single command
covers the whole job.

```
POST /images/generations -> { "data": [ { "url": …, "size": …, "output_format": … } ],
                              "usage": { … } }
```

## Before you start

If the message only names this skill (e.g. "use seedream") with no picture to make, ask what the
image should show — and, when the answer sounds like it wants a specific subject or look, offer to
generate from a reference image the user already has rather than from text alone.

**Every image costs money.** Generation is billed per image, so a group of three (`--count 3`) or a
layer split is three or more billed images, not one. Read a vague prompt back to the user before
submitting, and do not fire a batch of variants "to see which one looks better" unless they asked
for one.

Then check the credential:

```bash
[ -n "$ARK_API_KEY" ] && echo ok || echo missing
```

If it is missing (also visible in your Vault Keys section), ask the user to add `ARK_API_KEY` to
this agent's **key vault** — gear icon on the agent card → settings → key vault tab. The key comes
from the Ark console (https://ark.volcengine.com/region:cn-beijing/apikey); vault values reach your
shell environment on the next task. Nothing else is needed: the script reads the key from the
environment and never writes it to disk.

## Generate

```bash
node <skill dir>/kit/seedream.mjs --prompt "<what the image should show>" --out <name>.png
```

The script prints progress lines on stderr and **one line of JSON on stdout**:

```json
{"ok":true,"model":"doubao-seedream-5-0-pro-260628","size":"2K","request_id":"0217…","elapsed_ms":18342,"paths":["/abs/path/<name>.png"],"usage":{"generated_images":1}}
```

`--out` defaults to `seedream-<UTC timestamp>.<ext>` for one image and `seedream-<UTC timestamp>/`
for several, in the working directory. Every file is written
through a temporary file that only gets its final name once the write finished — so a half-written
image never looks like a complete one. Read `paths` (absolute) out of the JSON rather than
rebuilding the names yourself.

When the answer carries several images — `--count`, `--layers`, or simply more images than one —
`--out` is a **directory**, and the files are named `<NNN>-z<z_index>-<name>.<ext>`: a running
number, the layer's stacking index when it has one, and the cleaned-up name the service gave
(non-ASCII names clean to nothing, so `base` / `layer` stands in). Layers are always PNG.

Options:

| Option | Meaning |
| --- | --- |
| `--prompt <text>` | required; what the picture should show |
| `--out <path>` | file for one image, directory for several (default `./seedream-<timestamp>`) |
| `--model <id>` | Ark Model ID (default `doubao-seedream-5-0-pro-260628`) |
| `--image <url\|path>` | reference image, repeatable up to **14**; a local file is inlined as base64 |
| `--size <1K\|2K\|4K\|WxH>` | output size, e.g. `2K` or `2048x2048` |
| `--count <n>` | a group of n images (1–15) in one request |
| `--layers` | split the result into a base image plus up to **16** transparent PNG layers |
| `--transparent` | transparent background instead of opaque |
| `--format <png\|jpeg>` | output file format |
| `--seed <integer>` | fix the take, for a result you can reproduce |
| `--watermark` | keep the service watermark (otherwise it is the service default) |

Only the options you pass are sent, so every default stays the service's own. An unknown option, a
missing value or a bad number is an error — never a silently ignored argument. A `WxH` size is
checked locally against the service's pixel window (**at least 1280×720, at most 4096×4096 total
pixels**) and a too-small or too-large one is rejected with the bound it broke.

An example with a reference image, a 2K take:

```bash
node <skill dir>/kit/seedream.mjs \
  --prompt "the same cat, now sitting in a sunbeam, soft morning light" \
  --image ~/pictures/cat.jpg --size 2K --out cat-sunbeam.png
```

## Layers and groups

- **Layers** (`--layers`) come back as one base image plus at most **16** layers, each with
  `name`, `z_index`, `description` and a `bounding_box` (absolute and normalized). The base image
  is saved first, then the layers in ascending `z_index`; the JSON's `layers[]` repeats each
  layer's `path`, `z_index`, `name`, `size` and `bounding_box` so a caller can reassemble them.
  Layers are always **transparent PNG**, whatever `--format` says. If the service fails to
  produce any one layer, the whole request fails — nothing is delivered.
- **Groups** (`--count n`) ask for n images in one request (`sequential_image_generation: auto`
  with `max_images`). The service may return fewer than asked for; `paths` always lists what
  actually landed.

## Failures

| Code | Meaning | What to do |
| --- | --- | --- |
| 0 | images saved | read `paths` from the JSON |
| 2 | bad command line | fix the flags; the message says which one (including more than 14 `--image` or a size outside the pixel window) |
| 3 | `ARK_API_KEY` missing | ask the user for the key (see above) |
| 4 | the API refused the request — HTTP status and the service's own text are in `upstream` | `401` → wrong or missing key; `403 …ServiceNotOpen` → the model is not activated for this account; `403 …ServiceOverdue` → the account is out of credit; `429` → rate or concurrency limit, wait rather than retry-looping; `400 InvalidParameter*` → an option the model does not accept |
| 7 | an image did not download or decode | the URL was unreachable or answered empty; nothing is left at that path (the temporary file is removed), and `paths` lists the images that did land |

Never retry a submission on a failure you do not understand — a request that reached the service
may already have been billed. Read the `upstream` field before saying anything about the cause.

## Handing the result to the user

Give the user the files, not a base64 blob — and give them as paths, not as Markdown images:

- Save them into the workspace (the default output already does) and name each one in your reply
  by its workspace-relative path in backticks, with the model that made it. Markdown image syntax
  (`![](relative.png)`) does **not** resolve in the chat — it points at the web app's own origin,
  not at the workspace — so the user opens the file from the Files panel instead.
- For a layer split, show the base image as the preview and mention that the transparent layers
  sit beside it — a PNG viewer that stacks by filename order will not reassemble them, so say the
  layers are separate files.
- Keep `request_id` in your reply when the user may ask about the request later; the same seed
  plus the same options is a reproducible take.

## The interface behind the script

Under `https://ark.cn-beijing.volces.com/api/v3`, authenticated with
`Authorization: Bearer $ARK_API_KEY`:

- `POST /images/generations` with `{"model": …, "prompt": …, "image": … , "size": …, …}` and
  `response_format: "url"`. `image` is a string for one reference image and an array for several
  (a local file goes in as a `data:<mime>;base64,…` URL); the synchronous answer carries
  `data[]` — `url` and `output_format` when `response_format` is `url`, `b64_json` when it is
  `b64_json` — plus `usage`. The script sends `url` and downloads, but decodes `b64_json` if that
  is what comes back.

Model IDs and the per-model option ranges live in the docs, which are the source of truth for
anything this file does not state:
https://docs.volcengine.com/docs/ark/image-generation-api?lang=zh,
https://docs.volcengine.com/docs/ark/model-list?lang=zh

`ARK_BASE_URL` overrides the endpoint. It exists so the script can be pointed at a local stub when
it is being tested — leave it unset for real work.
