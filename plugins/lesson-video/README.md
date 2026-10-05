# lesson-video

Narrated **vertical lesson videos** (1080×1920, Douyin / Reels ready) from a written script — plus the cover art and the publishing copy that goes with them.

The whole thing rests on one idea: **the picture is a pure function of time `t`**. You write what is said, edge-tts speaks it and hands back word-level timings, and every frame is then *computed* from that timeline. Voice, subtitles and slides line up by construction, so there is nothing to edit afterwards.

```
script.json  ──tts.py──▶  narration.wav + lesson.json  ──render.mjs──▶  30fps JPEG frames  ──build.py──▶  mp4 + srt
covers.json  ──cover.mjs──▶  1080×1920 video cover + 1080×1440 profile cover
```

## Why it exists

- **Safe areas for real phones.** App buttons and status bars cover the edges of a portrait screen, so the layout keeps the sides and the top empty by design: content lives inside 745 × 1170 px, and the subtitle band starts at y = 1470.
- **A pre-render self-check.** `render.mjs --check` fails *before* spending minutes on frames: content past the subtitle safe line, code lines clipped by the card, and titles left with a one-character orphan line.
- **No editing software, no GPU.** Headless Chrome + `imageio-ffmpeg`; a three-minute episode renders in about five minutes on CPU, and re-rendering after a script fix is one command.
- **No baked-in branding.** Watermark, brand mark, CTA and every caption come from the data files — the templates ship with nothing of anyone's hard-coded.

## What's inside

| Path | What it is |
| --- | --- |
| `skills/lesson-video/SKILL.md` | The skill: script schema, the three commands, the layout rules, the pitfalls |
| `skills/lesson-video/kit/` | The toolkit — `tts.py`, `render.mjs`, `build.py`, `deck.html`, `cover.mjs`, `cover.html`; copy it into a project as `lib/` |
| `skills/lesson-video/example/` | A skeleton `script.json` (four scene types) and `covers.json` |

## Requirements

| Need | Install |
| --- | --- |
| Python packages | `pip install edge-tts imageio-ffmpeg` (the ffmpeg binary comes with the second one) |
| Playwright core | any usable `playwright-core`; point `PLAYWRIGHT_MODULE` at it |
| A browser | any Chrome / Chromium; point `CHROME_PATH` at it |

## Quick start

```bash
cp -r <skill>/kit/* <project>/lib/
mkdir -p <project>/lessons/ep01

# 1. write <project>/lessons/ep01/script.json   (see the skill for the schema)

PYTHONUTF8=1 python lib/tts.py lessons/ep01
node lib/render.mjs --dir lessons/ep01 --check          # 10s: safe area, clipped code, orphan titles
PLAYWRIGHT_MODULE=… CHROME_PATH=… node lib/render.mjs --dir lessons/ep01
PYTHONUTF8=1 python lib/build.py lessons/ep01           # out/ep01.mp4 + out/ep01.srt
```

## License

Apache-2.0
