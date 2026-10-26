---
name: seedance
description: Generate a video from a prompt with Volcengine Ark's Doubao Seedance models — submit an asynchronous video-generation task, poll it, and save the resulting mp4 into the workspace, driven by a vault-stored API key.
---

# Seedance (Doubao video generation)

Volcengine Ark's video generation API turns a prompt — and, if you have them, reference images —
into an mp4. It is **asynchronous**: you submit a task, get a task id back, and poll that task until
it succeeds; only then does the answer carry the video's URL. `kit/seedance.mjs` is one
dependency-free Node script that does all three steps and saves the video into the workspace, so a
single command covers the whole job.

```
POST /contents/generations/tasks          -> { "id": "cgt-…" }
GET  /contents/generations/tasks/{id}     -> { "status": "…", "content": { "video_url": … } }
```

## Before you start

If the message only names this skill (e.g. "use seedance") with no video to make, ask what the
video should show — and, when the answer sounds like it wants a specific look, offer to generate
from a still the user already has (a reference image) rather than from text alone.

**A take costs money.** Video generation is billed by the second and the resolution, so the prompt
is worth a glance before it is submitted: read it back to the user when the request was vague, and
do not send a batch of variants "to see which one looks better" unless they asked for one.

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
node <skill dir>/kit/seedance.mjs --prompt "<what the video should show>" --out <name>.mp4
```

The script prints progress lines on stderr and **one line of JSON on stdout**:

```json
{"ok":true,"path":"/abs/path/<name>.mp4","bytes":2314213,"task_id":"cgt-…","model":"doubao-seedance-2-5-260628","video_url":"https://…","elapsed_ms":74210}
```

`--out` defaults to `seedance-<UTC timestamp>.mp4` in the working directory, and the video is
written through a temporary file that only gets its final name once the download finished — so a
half-written file never looks like a complete video. Read `path` (absolute) out of the JSON rather
than rebuilding the name yourself.

Options:

| Option | Meaning |
| --- | --- |
| `--prompt <text>` | required; Chinese up to ~500 characters, English up to ~1000 words |
| `--out <path>` | where to save the mp4 (default: `./seedance-<timestamp>.mp4`) |
| `--model <id>` | Ark Model ID (default `doubao-seedance-2-5-260628`) |
| `--image <url\|path>` | first-frame image: an http(s)/data URL, or a local file inlined as base64 |
| `--last-frame <url\|path>` | last-frame image; needs `--image` (the pair is 首尾帧) |
| `--reference-image <url\|path>` | reference image, repeatable (Seedance 2.5 全模态参考) |
| `--duration <seconds>` | 4–30s on Seedance 2.5, 4–15s on the 2.0 line; the service default when omitted |
| `--ratio <ratio>` | e.g. `16:9`, `9:16`, `1:1`, `adaptive` |
| `--resolution <size>` | `480p`, `720p`, `1080p` |
| `--seed <integer>` | fix the take, for a result you can reproduce |
| `--watermark` | keep the service watermark (otherwise it is the service default) |
| `--generate-audio` | let the model generate the soundtrack |
| `--poll-interval <seconds>` | first gap between polls (default 5, backing off to 20) |
| `--max-wait <seconds>` | give up after this long (default 900) |

Only the options you pass are sent, so every default stays the service's own. An unknown option, a
missing value or a bad number is an error — never a silently ignored argument.

An example with a still the user already has as the first frame, a 16:9 take:

```bash
node <skill dir>/kit/seedance.mjs \
  --prompt "the cat stretches and looks into the camera, camera slowly pulls back" \
  --image ~/pictures/cat.jpg --duration 5 --ratio 16:9 --resolution 720p \
  --out cat-stretch.mp4
```

## Statuses, waits and failures

The task's `status` is one of `queued`, `running`, `cancelled`, `succeeded`, `failed`, `expired`.
The script polls until a terminal one, and its exit code says which way it ended:

| Code | Meaning | What to do |
| --- | --- | --- |
| 0 | `succeeded`, video saved | read `path` from the JSON |
| 2 | bad command line | fix the flags; the message says which one |
| 3 | `ARK_API_KEY` missing | ask the user for the key (see above) |
| 4 | the API refused the request — HTTP status and the service's own text are in `upstream` | `401` → wrong or missing key; `403 OperationDenied.ServiceNotOpen` → the model is not activated for this account; `403 …ServiceOverdue`/`AccountOverdueError` → the account is out of credit; `429` → rate or concurrency limit, wait rather than retry-looping; `400 InvalidParameter*` → an option the model does not accept |
| 5 | the task ended as `failed`, `cancelled` or `expired` — `error_code` and `error.message` carry the service's reason | report it; a task-type complaint usually means the prompt and the images disagree about what kind of task this is |
| 6 | still `queued`/`running` after `--max-wait` | the task keeps running on the service: the JSON carries `task_id`, and the task record survives 7 days, so poll it later instead of resubmitting and paying again |
| 7 | the video did not download | the URL the task returned (valid 24 hours) is unreachable or refused; nothing is left at the output path |

Never retry a submission on a failure you do not understand — a paid task may already be running.
Raise `--max-wait` for a long prompt (a 10-second 1080p take commonly takes minutes), and read the
`upstream` field before saying anything about the cause.

## Handing the result to the user

The chat does not play video, so give the user the file, not a base64 blob:

- Save it into the workspace (the default output already does) and name it in your reply by its
  workspace-relative path in backticks, with the size and the model that made it.
- If a still would help them decide, extract one frame next to it and offer that as the preview:
  `ffmpeg -y -i <file>.mp4 -frames:v 1 <file>-frame.png` (ffmpeg, when it is installed). Take the
  first frame rather than seeking — a `-ss` past the end of a short take writes nothing and still
  exits 0, which reads as success until nobody finds the file.
- Keep the `task_id` in your reply when the take is one they may want redone: the same seed plus the
  same options is a reproducible take.

## The three interfaces behind the script

All under `https://ark.cn-beijing.volces.com/api/v3`, authenticated with
`Authorization: Bearer $ARK_API_KEY`:

- **Submit** — `POST /contents/generations/tasks` with `{"model": …, "content": [{"type": "text",
  "text": …}, {"type": "image_url", "image_url": {"url": …}, "role": …}]}` and optional
  `duration` / `ratio` / `resolution` / `seed` / `watermark` / `generate_audio`. Answers the task id
  and nothing else.
- **Query** — `GET /contents/generations/tasks/{id}`; on success `content.video_url` holds the mp4
  (valid **24 hours**, and Seedance 2.5's URLs allow at most 100 downloads), and `content.last_frame_url`
  appears only if the task asked for `return_last_frame`.
- **Cancel / delete and list** — `DELETE /contents/generations/tasks/{id}` cancels a `queued` task
  (it becomes `cancelled`) and deletes the record of a `succeeded`, `failed` or `expired` one; a
  `running` task cannot be stopped through it. `GET /contents/generations/tasks` lists recent tasks
  in `items[]`. The script does not use these; reach for them with curl when a job must be stopped or
  its history inspected:
  https://docs.volcengine.com/docs/ark/cancel-or-delete-video-generation-tasks-api?lang=zh

Model IDs, the per-model option ranges and the error catalogue live in the docs, which are the
source of truth for anything this file does not state:
https://docs.volcengine.com/docs/ark/create-video-generation-task-api?lang=zh,
https://docs.volcengine.com/docs/ark/get-video-generation-task-api?lang=zh,
https://docs.volcengine.com/docs/ark/model-list?lang=zh

`ARK_BASE_URL` overrides the endpoint. It exists so the script can be pointed at a local stub when
it is being tested — leave it unset for real work.
