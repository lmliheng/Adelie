/**
 * A reply's pictures are fetched from where they actually live.
 *
 * A model names the pictures it made the way a README would — `![预览](shot.png)`, relative to the
 * Workspace it works in. Before this, the browser resolved that src against the SPA's own route
 * (`/chat/shot.png`), so every Workspace picture in a reply was a broken image, and the image
 * plugin's skill had to tell the agent never to use Markdown image syntax at all. The transcript
 * now sends such a src to the Session's own file route, while a src that names another site keeps
 * its own and one that resolves to nothing stays exactly as written.
 *
 * Seeded through the API against the mock model (mock-llm.mjs, branch "image reply test"), with a
 * real PNG written into the Session's Workspace first — the picture has to load, not merely
 * render an <img>.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const U = "replyimage";
const P = "password123";

/** A 2×2 PNG: small enough to inline, real enough that a browser decodes it (naturalWidth > 0). */
const PNG_2X2 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVQIW2P8z8Dwn4GBgYGJAQ0AAB6nAgHkPj0eAAAAAElFTkSuQmCC";

test("a picture of the Workspace renders, and only that src is rewritten", async ({ page }) => {
  await provisionAndLogin(page.request, U, P);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;

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

  // A Workspace of the test's own, already holding the picture the reply will name.
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-reply-image-"));
  fs.writeFileSync(path.join(workspace, "shot.png"), Buffer.from(PNG_2X2, "base64"));

  const sess = await (
    await page.request.post(`${BASE}/api/projects/${projectId}/agents/default_agent/sessions`, {
      data: { provider: "custom", modelId: "claude-4-8", workspace },
    })
  ).json();
  const sessionId = sess.session.sessionId;
  expect(sess.session.workspace, "the Session runs in the test's Workspace").toBe(workspace);

  await page.goto(`${BASE}/chat/${sessionId}`);
  const ta = page.getByPlaceholder(/输入消息/);
  await ta.waitFor();
  await ta.fill("image reply test, please");
  await page.getByRole("button", { name: "发送" }).click();

  const images = page.locator(".md-body img");
  await expect(images).toHaveCount(3, { timeout: 30_000 });

  // 1. The Workspace picture: fetched from the Session's file route, and actually decoded.
  const own = images.nth(0);
  await expect(own).toHaveAttribute(
    "src",
    new RegExp(`/api/sessions/${sessionId}/files/content\\?path=shot\\.png`),
  );
  await expect(own).toHaveAttribute("alt", "the picture");
  await expect(own).toHaveAttribute("loading", "lazy");
  await expect
    .poll(() => own.evaluate((img) => img.complete && img.naturalWidth > 0), { timeout: 15_000 })
    .toBe(true);

  // 2. A src that resolves to nothing keeps what the Markdown wrote — the browser's own broken
  //    image, never a request for a file outside the Workspace.
  await expect(images.nth(1)).toHaveAttribute("src", "../../outside.png");
  expect(await images.nth(1).evaluate((img) => img.naturalWidth)).toBe(0);

  // 3. Another site's picture is left alone: no file route is involved.
  await expect(images.nth(2)).toHaveAttribute("src", "https://example.com/remote.png");

  // The stylesheet caps an oversized picture instead of widening the transcript (this one is 2px,
  // so the assertion is about the rule being in force, not about the clamp itself).
  const box = await own.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.width ?? 0).toBeLessThanOrEqual(1280);

  // 4. A click puts that picture on a layer of its own, whole; Esc gives the conversation back.
  //    Asserted in the browser rather than only in the unit tests because what fails here is the
  //    browser's: a `fixed` layer inside a transcript's overflow-hidden ancestors, the natural
  //    size read off a picture the overlay has really loaded, and Esc reaching the shared
  //    escape-layer stack. All three srcs are thumbnails of buttons — a broken picture is one too,
  //    since whether it loads is not known when the Markdown renders (see prose.tsx).
  await expect(page.locator(".md-body button img")).toHaveCount(3);
  const scrim = page.locator(".ui-scrim");
  await expect(scrim).toHaveCount(0);
  await own.click();
  await expect(scrim).toHaveCount(1);

  // The overlay shows the same file the thumbnail fetched from the Session's route.
  const whole = scrim.locator("img");
  await expect(whole).toHaveAttribute(
    "src",
    new RegExp(`/api/sessions/${sessionId}/files/content\\?path=shot\\.png`),
  );
  await expect(whole).toHaveAttribute("alt", "the picture");
  // The badge reads the picture that loaded, not the box it happens to be drawn in.
  await expect(scrim.getByText("2 × 2")).toBeVisible();
  // Saving keeps the name the route carries in `path=`, not its own `content` segment.
  await expect(scrim.getByRole("link", { name: "下载" })).toHaveAttribute("download", "shot.png");
  // One picture is not a batch: there is nowhere to step, so no stepping buttons are drawn.
  await expect(scrim.getByRole("button", { name: "上一张图片" })).toHaveCount(0);
  await expect(scrim.getByRole("button", { name: "下一张图片" })).toHaveCount(0);

  // Esc closes the overlay alone; the pictures of the conversation are still there.
  await page.keyboard.press("Escape");
  await expect(scrim).toHaveCount(0);
  await expect(images).toHaveCount(3);
});
