/**
 * Regression: a file the composer turns away for being over its ceiling says so above the card —
 * naming the file and the number it was measured against — instead of leaving only a six-second
 * notification.
 *
 * The refusal is silent by construction: an oversize pick is rejected from `File.size` before
 * anything is read, so no chip appears and nothing was ever added to the draft. While the reason
 * lived in a toast, the screen six seconds later read exactly as it had before the pick, with a
 * chip row that simply lacked the file — nothing said which file it was, or what the limit is
 * (7.19's rule: the sentence belongs where the attempt was made, and here the picker is one click
 * from the same list). The line now draws above the card
 * (`attachment-refusal.ts`, `data-testid="attachment-refusal"`).
 *
 * Two intakes, because the ceilings are three different numbers: the inline-image ceiling
 * (INLINE_IMAGE_MAX_MB, 20) is compiled in, and one drop can be refused against two of them at
 * once (an image at 20MB, a clip at 32MB) — that second case is the reason the line is built per
 * ceiling rather than per file.
 *
 * Nothing here calls a model: the cases are about what the composer does before any request. The
 * Project still gets the mock as its model so the onboarding overlay stays off the composer.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const MODEL = { provider: "custom", modelId: "claude-4-8" };
/** Inline ceilings, compiled into the server (`attachment-limits.ts`). */
const IMAGE_MAX_MB = 20;
const VIDEO_MAX_MB = 32;
const MB = 1024 * 1024;

const refusal = (page) => page.getByTestId("attachment-refusal");
const notifications = (page) => page.getByRole("region", { name: "通知" });
/** The staged-file remove buttons (one per chip, whatever kind of file), none when nothing landed. */
const chips = (page) => page.getByRole("button", { name: /^移除(文件|图片|视频)/ });

/** A user with the mock as the Project's model, and the composer of a fresh draft in view. */
async function openComposer(page, userId) {
  await provisionAndLogin(page.request, userId, P);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
    data: {
      defaultModel: MODEL,
      models: [{ ...MODEL, apiKey: "sk-mock", baseUrl: MOCK, contextWindow: 200000 }],
    },
  });
  expect(put.ok(), "put models").toBeTruthy();
  await page.goto(`${BASE}/chat/new`);
  await expect(page.locator("textarea")).toBeVisible();
  return projectId;
}

/** A file of `mb` megabytes, as the picker would hand it over. Filler bytes: nothing reads them. */
const filler = (mb) => Buffer.alloc(mb * MB);

test("a picked image over its own ceiling keeps its reason above the card, past six seconds", async ({
  page,
}) => {
  await openComposer(page, "attach_refusal_img");

  await page
    .locator('input[type="file"][accept="image/*"]')
    .setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: filler(IMAGE_MAX_MB + 1) });

  // One line, above the card, naming the file and the ceiling the composer measured it against.
  const sentence = `shot.png 超过 ${IMAGE_MAX_MB}MB 上限，未添加。`;
  await expect(refusal(page)).toBeVisible();
  await expect(refusal(page)).toHaveText(sentence);
  await expect(page.getByRole("alert")).toHaveCount(1);
  // The reason is the composer's, not a notification's.
  await expect(notifications(page)).not.toContainText(`超过 ${IMAGE_MAX_MB}MB`);
  // Nothing was staged, and the draft itself is untouched.
  await expect(chips(page)).toHaveCount(0);
  await expect(page.locator("textarea")).toHaveValue("");

  // Past the six seconds a toast lived: the sentence is still there.
  await page.waitForTimeout(7000);
  await expect(refusal(page)).toHaveText(sentence);

  // The next pick that fits clears it and stages the file — the line belongs to one intake, not
  // to a timer.
  await page
    .locator('input[type="file"][accept="image/*"]')
    .setInputFiles({ name: "small.png", mimeType: "image/png", buffer: filler(1) });
  await expect(refusal(page)).toHaveCount(0);
  await expect(chips(page)).toHaveCount(1);
});

test("one drop over two ceilings says so in one line, and what fits still lands", async ({
  page,
}) => {
  const projectId = await openComposer(page, "attach_refusal_drop");
  const sess = await (
    await page.request.post(`${BASE}/api/projects/${projectId}/agents/default_agent/sessions`, {
      data: { ...MODEL, approvalMode: "allow-all" },
    })
  ).json();
  await page.goto(`${BASE}/chat/${sess.session.sessionId}`);
  // The drop zone lives on the chat column, which only a Session page mounts.
  const box = page.getByPlaceholder(/输入消息/);
  await expect(box).toBeVisible();

  // An OS drag: the files are built in the page (the bytes are never read — every one of the two
  // oversized files is refused from its size), and the event goes to the composer, inside the
  // chat area the window-level listeners hit-test against.
  await box.evaluate(
    (target, sizes) => {
      const dt = new DataTransfer();
      const add = (name, type, bytes) =>
        dt.items.add(new File([new Uint8Array(bytes)], name, { type }));
      add("shot.png", "image/png", sizes.image);
      add("clip.mp4", "video/mp4", sizes.video);
      add("notes.txt", "text/plain", 1024);
      target.dispatchEvent(
        new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }),
      );
    },
    { image: (IMAGE_MAX_MB + 1) * MB, video: (VIDEO_MAX_MB + 1) * MB },
  );

  // One line, one sentence per ceiling, each naming its own file and number.
  const line = refusal(page);
  await expect(line).toBeVisible();
  await expect(line).toContainText(`shot.png 超过 ${IMAGE_MAX_MB}MB 上限，未添加。`);
  await expect(line).toContainText(`clip.mp4 超过 ${VIDEO_MAX_MB}MB 上限，未添加。`);
  await expect(notifications(page)).not.toContainText("上限");
  // The file that fits was staged all the same: a refusal is about the two that did not.
  await expect(chips(page)).toHaveCount(1);
  await expect(page.getByText("notes.txt")).toBeVisible();
});
