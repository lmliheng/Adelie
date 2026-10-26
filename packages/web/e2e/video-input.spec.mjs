/**
 * Video input, in a real browser: the composer stages a clip, the model is handed it as a video
 * part, and a reloaded page is served the same clip by reference instead of by value.
 *
 * The model is a Volcengine Ark row of the built-in catalog — the group this was built for — so
 * the whole chain is exercised as shipped: `catalogSupportsVideo` makes the composer offer video
 * input and the task route inline it, AgentHub's patched Chat Completions transformer turns it
 * into the `{"type":"video_url","video_url":{"url":…}}` part the vendor takes, and the mock
 * answers with what it saw. That answer is the load-bearing assertion: if the patch were missing
 * or the clip were quietly filed away as a scratchpad attachment, the reply would say
 * "No video in this request." and the test would fail on the wording, not on a shape.
 *
 * The clip is a real 1-second 32×32 VP8 WebM (base64 below, generated with
 * `ffmpeg -f lavfi -i color=c=navy:s=32x32:d=1 -c:v libvpx -b:v 40k -an clip.webm`), so the
 * browser can actually decode it: the metadata and the first frame are waited for, and the frame's
 * width is asserted — a `<video>` carrying bytes no decoder accepts would render an element while
 * staying at `readyState` 0.
 *
 * The reload half is the windowed-history path: the initial load asks for a tail window
 * (`stream-controller`'s `TAIL_UNITS`), and the server answers a video by reference
 * (`/api/sessions/<id>/trace-video?file=&ordinal=`) — one page of history must not carry tens of
 * megabytes of base64. Fetching that reference returns the clip's bytes.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const U = "videouser";
const P = "password123";
/** A Volcengine Ark row whose card the catalog marks as taking video input. */
const MODEL = { provider: "volcengine", modelId: "doubao-seed-2-1-pro-260915" };

/** 1-second 32×32 navy VP8 clip (1107 bytes), generated with the ffmpeg command in the header. */
const CLIP_BASE64 =
  "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAQjEU2bdLpNu4tTq4QVSalmU6yBoU27i1Or" +
  "hBZUrmtTrIHYTbuMU6uEElTDZ1OsggEeTbuMU6uEHFO7a1OsggQN7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirX" +
  "sYMPQkBNgI1MYXZmNTkuMjcuMTAwV0GNTGF2ZjU5LjI3LjEwMESJiECPQAAAAAAAFlSua8GuAQAAAAAAADjXgQFzxYi0mKpc" +
  "u2I6AZyBACK1nIN1bmSIgQCGhVZfVlA4g4EBI+ODhAJiWgDgibCBILqBIJqBAhJUw2f9c3OgY8CAZ8iaRaOHRU5DT0RFUkSH" +
  "jUxhdmY1OS4yNy4xMDBzc9djwItjxYi0mKpcu2I6AWfIoUWjh0VOQ09ERVJEh5RMYXZjNTkuMzcuMTAwIGxpYnZweGfIokWj" +
  "iERVUkFUSU9ORIeUMDA6MDA6MDEuMDAwMDAwMDAwAAAfQ7Z1QmfngQCjuoEAAICQAgCdASogACAAAEcIhYWIhYSIAgICdaoC" +
  "B/kV3mD+/43k//20D/9tA//bQP/toH+N5vNasQCjlYEAKACxAQABEBAAGAAYWC/0AAhwAKOVgQBQALEBAAEQEAAYABhYL/QA" +
  "CHAAo5WBAHgAsQEAARAQABgAGFgv9AAIcACjlYEAoACxAQABEBAAGAAYWC/0AAhwAKOVgQDIALEBAAEQEAAYABhYL/QACHAA" +
  "o5WBAPAAsQEAARAQABgAGFgv9AAIcACjlYEBGACxAQABEBAUYABhYL/QACHAAKOVgQFAALEBAAEQEAAYABhYL/QACHAAo5WB" +
  "AWgAsQEAARAQABgAGFgv9AAIcACjlYEBkACxAQABEBAAGAAYWC/0AAhwAKOVgQG4ALEBAAEQEAAYABhYL/QACHAAo5WBAeAA" +
  "sQEAARAQABgAGFgv9AAIcACjlYECCACxAQABEBAAGAAYWC/0AAhwAKOVgQIwALEBAAEQEAAYABhYL/QACHAAo5WBAlgAsQEA" +
  "ARAQABgAGFgv9AAIcACjlYECgACxAQABEBAAGAAYWC/0AAhwAKOVgQKoALEBAAEQEAAYABhYL/QACHAAo5WBAtAAsQEAARAQ" +
  "FGAAYWC/0AAhwACjlYEC+ACxAQABEBAAGAAYWC/0AAhwAKOVgQMgALEBAAEQEAAYABhYL/QACHAAo5WBA0gAsQEAARAQABgA" +
  "GFgv9AAIcACjlYEDcACxAQABEBAAGAAYWC/0AAhwAKOVgQOYALEBAAEQEAAYABhYL/QACHAAo5WBA8AAsQEAARAQABgAGFgv" +
  "9AAIcAAcU7trkbuPs4EAt4r3gQHxggGg8IED";
const CLIP = Buffer.from(CLIP_BASE64, "base64");

test("a picked video reaches the model and comes back by reference", async ({ page }) => {
  await provisionAndLogin(page.request, U, P);
  const project = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0];
  // One OpenAI-compatible endpoint for the whole group; the mock stands in for Ark.
  const put = await page.request.put(`${BASE}/api/projects/${project.projectId}/models`, {
    data: {
      defaultModel: MODEL,
      models: [
        {
          ...MODEL,
          apiKey: "sk-mock",
          baseUrl: MOCK,
          clientType: "openai-chat",
          contextWindow: 262144,
        },
      ],
    },
  });
  expect(put.ok(), "put models").toBeTruthy();

  const sess = await (
    await page.request.post(
      `${BASE}/api/projects/${project.projectId}/agents/default_agent/sessions`,
      { data: { ...MODEL, approvalMode: "allow-all" } },
    )
  ).json();
  const sessionId = sess.session.sessionId;

  await page.goto(`${BASE}/chat/${sessionId}`);
  const composer = page.getByPlaceholder(/输入消息/);
  await composer.waitFor();

  // The "+" menu offers the video entry for a model that takes one.
  await page.getByRole("button", { name: "更多输入方式" }).click();
  await expect(page.getByText("上传视频")).toBeVisible();
  await page.keyboard.press("Escape");

  // Stage the clip exactly as the picker would: the hidden input takes `video/*`.
  await page.locator('input[type="file"][accept="video/*"]').setInputFiles({
    name: "clip.webm",
    mimeType: "video/webm",
    buffer: CLIP,
  });
  await expect(page.getByText("clip.webm")).toBeVisible();

  await composer.fill("这个视频里有什么？");
  await page.getByRole("button", { name: "发送" }).click();

  // The model was handed the clip itself, as a video part — the proof that the request carried
  // it and that AgentHub's patched transformer built the shape Ark takes.
  await expect(page.getByText(`Saw a video: video/webm, ${CLIP.length} bytes.`)).toBeVisible();

  // The sent message carries a playable clip: metadata and the first frame really load, and the
  // frame is the one that was picked (the live stream's own copy, inline bytes).
  const sent = page.locator("video");
  await expect(sent).toHaveCount(1);
  const liveSrc = await sent.getAttribute("src");
  expect(liveSrc?.startsWith("data:video/webm;base64,")).toBe(true);
  await expect.poll(async () => sent.evaluate((v) => v.readyState)).toBeGreaterThanOrEqual(1);
  expect(await sent.evaluate((v) => v.videoWidth)).toBe(32);
  expect(await sent.evaluate((v) => v.duration)).toBeGreaterThan(0);

  // Reload: the windowed history page hands the same clip over by reference, not by value.
  await page.reload();
  const replayed = page.locator("video");
  await expect(replayed).toHaveCount(1);
  const ref = await replayed.getAttribute("src");
  expect(ref).toMatch(new RegExp(`^/api/sessions/${sessionId}/trace-video\\?`));
  await expect.poll(async () => replayed.evaluate((v) => v.readyState)).toBeGreaterThanOrEqual(1);

  // The reference serves the very bytes that were picked.
  const fetched = await page.request.get(`${BASE}${ref}`);
  expect(fetched.status()).toBe(200);
  expect(fetched.headers()["content-type"] ?? "").toContain("video/webm");
  expect(Buffer.from(await fetched.body()).equals(CLIP)).toBe(true);
});
