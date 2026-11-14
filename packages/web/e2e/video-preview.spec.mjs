/**
 * An mp4 in the Files panel: the pane plays it, and a file past the pane's ceiling is refused
 * where it stands.
 *
 * - The content route answers a byte range (`206` with a `Content-Range`) and serves the mp4 as
 *   `video/mp4` — without both, a player under `nosniff` never decodes the bytes it is handed.
 * - Choosing the file in the tree mounts the pane's own `<video>`: the browser really decodes it
 *   (a duration arrives from the metadata) and a seek lands where it was sent.
 * - A video past the panel's 50MB ceiling — the server's own read ceiling, so a player could
 *   never load it — draws the reason instead, with no `<video>` mounted.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const U = "e2evideo";
const P = "password123";

/**
 * A real 2-second 64x64 mp4, about 2 KB, so the pane has bytes a browser will decode rather
 * than a stand-in header. Regenerate with:
 *   ffmpeg -f lavfi -i color=c=black:s=64x64:d=2 -c:v libx264 -crf 51 -preset ultrafast \
 *     -pix_fmt yuv420p -movflags +faststart clip.mp4
 */
const CLIP_BASE64 =
  "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";

/** A Workspace directory of the test's own holding the given files (a Buffer writes raw bytes). */
function workspace(name, files) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "e2e-video-")), name);
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** A Session on `dir`, with the Files panel open on it. */
async function openFiles(page, dir) {
  await provisionAndLogin(page.request, U, P);
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
  const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
    data: {
      defaultModel: { provider: "custom", modelId: "claude-4-8" },
      models: [
        {
          provider: "custom",
          modelId: "claude-4-8",
          apiKey: "sk-mock",
          baseUrl: MOCK,
          contextWindow: 200000,
        },
      ],
    },
  });
  expect(put.ok(), "put models").toBeTruthy();
  const created = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
    { data: { workspace: dir } },
  );
  expect(created.ok(), "create session").toBeTruthy();
  const sid = (await created.json()).session.sessionId;
  await page.goto(`${BASE}/chat/${sid}`);
  await page.getByPlaceholder(/输入消息/).waitFor();
  await page.getByTestId("dock-toggle-right").click();
  await page.getByTestId("dock-pick-workspace").click();
  return { dock: page.getByTestId("dock"), sid };
}

test("an mp4 opens a player the browser decodes, and the route answers a byte range", async ({
  page,
}) => {
  const dir = workspace("clips", { "clip.mp4": Buffer.from(CLIP_BASE64, "base64") });
  const { dock, sid } = await openFiles(page, dir);

  // What a player asks first, and re-asks on every seek: one range, answered in slices.
  const url = `${BASE}/api/sessions/${sid}/files/content?path=clip.mp4`;
  const head = await page.request.get(url, { headers: { Range: "bytes=0-3" } });
  expect(head.status(), "a range is answered with a part, not the whole file").toBe(206);
  expect(head.headers()["content-range"]).toMatch(/^bytes 0-3\/\d+$/);
  expect(head.headers()["content-type"]).toBe("video/mp4");

  await dock.locator('[data-tree-path="clip.mp4"]').click();
  const video = dock.locator("video");
  await expect(video).toBeVisible();
  // Decoded for real: a duration can only come from the file's own metadata.
  await expect
    .poll(() => video.evaluate((el) => el.duration), { timeout: 20_000 })
    .toBeGreaterThan(1);
  const landed = await video.evaluate(async (el) => {
    el.currentTime = 1;
    await new Promise((resolve) => el.addEventListener("seeked", resolve, { once: true }));
    return el.currentTime;
  });
  expect(landed).toBeGreaterThan(0.5);
  expect(await video.evaluate((el) => el.error === null)).toBe(true);
});

test("an mp4 past the pane's ceiling says so instead of mounting a player", async ({ page }) => {
  // 51MB, past the 50MB the content route will read whole — written straight into the
  // Workspace, since the upload route stops at 14MB long before this.
  const dir = workspace("big", { "big.mp4": Buffer.alloc(51 * 1024 * 1024) });
  const { dock } = await openFiles(page, dir);

  await dock.locator('[data-tree-path="big.mp4"]').click();
  await expect(dock.getByText("这个视频超过 50MB，不在页面里预览")).toBeVisible();
  await expect(dock.locator("video")).toHaveCount(0);
});
