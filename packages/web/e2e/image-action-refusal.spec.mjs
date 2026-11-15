/**
 * Regression: a reply picture's "split into layers" that does not get out keeps its reason under
 * the picture's own bar, instead of in a notification that dismisses itself after six seconds.
 *
 * The press posts a turn of the user's own to the Session's Agent (the App has no image endpoint),
 * so a refusal writes nothing at all: the conversation is untouched, the picture is still there,
 * and the button that was pressed has not moved — it IS the retry. What used to happen is 7.19's
 * rule failing where it costs most: the press closed the lightbox before running, so the six-second
 * notification landed over a page that read as it had before the click, and both the picture and
 * the button that failed were gone.
 *
 * The lightbox now holds the overlay open for an action that answers with a promise and draws the
 * sentence it resolves to under the bar (`role="alert"`, danger tone, two lines). This file drives
 * that with the route stubbed to 500 and an English wire message (so the interface's own words can
 * be told apart from the raw one), then unstubs it and presses the same button again — the retry
 * that the line claims is there.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const AGENT = "pic_action_refusal_agent";
const MODEL = "claude-4-8";
/** The interface's own sentence for `internal`; the stubbed English message must never reach it. */
const INTERNAL = "服务器内部错误，请稍后重试。";
/** A message that must not reach the page: only the interface's own words may. */
const RAW = "RAW ENGLISH SERVER MESSAGE";
/** The sentence the picture's bar draws under itself (lib/strings.ts, `chat.imageAction.refused`). */
const REFUSED = `没能把这张图拆成图层，这条消息没有发出：${INTERNAL}`;

/** A 2×2 PNG, the same one reply-picture-actions.spec uses: real enough that a browser decodes it. */
const PNG_2X2 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVQIW2P8z8Dwn4GBgYGJAQ0AAB6nAgHkPj0eAAAAAElFTkSuQmCC";

const notifications = (page) => page.getByRole("region", { name: "通知" });
const refusalLine = (page) => page.getByTestId("lightbox-refusal");
const scrim = (page) => page.locator(".ui-scrim");
const composer = (page) => page.getByPlaceholder(/输入消息/);

/**
 * Nothing was raised in the notification region, read once after the refusal's own render landed.
 *
 * `toHaveCount(0)` retries for the whole expect timeout, so it also passes against a toast that
 * simply expired after six seconds — the very behaviour this file is about.
 */
async function expectNoToast(page) {
  await page.waitForTimeout(400);
  expect(await notifications(page).getByRole("button").count()).toBe(0);
}

/**
 * The user, a Project aimed at the mock model, an Agent with the image tool installed, and a
 * Workspace already holding the picture a reply will name. Provisioning is idempotent, so a rerun
 * of this file shares one data root with itself.
 */
async function setUp(page, user) {
  await provisionAndLogin(page.request, user, "password123");
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
  const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
    data: {
      defaultModel: { provider: "custom", modelId: MODEL },
      models: [
        {
          provider: "custom",
          modelId: MODEL,
          apiKey: "sk-mock",
          baseUrl: MOCK,
          contextWindow: 200000,
        },
      ],
    },
  });
  expect(put.ok(), "put models").toBeTruthy();

  const created = await page.request.post(`${BASE}/api/projects/${projectId}/agents`, {
    data: { agentId: AGENT },
  });
  expect(created.ok() || created.status() === 409, await created.text()).toBeTruthy();
  const install = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/${AGENT}/plugins`,
    {
      data: { names: ["use-seedream"] },
    },
  );
  expect(install.ok(), await install.text()).toBeTruthy();
  const skills = await (
    await page.request.get(`${BASE}/api/projects/${projectId}/agents/${AGENT}/skills`)
  ).json();
  expect(skills.skills.map((s) => s.name)).toContain("seedream");

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-image-action-refusal-"));
  fs.writeFileSync(path.join(workspace, "shot.png"), Buffer.from(PNG_2X2, "base64"));
  const sess = await (
    await page.request.post(`${BASE}/api/projects/${projectId}/agents/${AGENT}/sessions`, {
      data: { provider: "custom", modelId: MODEL, workspace },
    })
  ).json();
  return { projectId, sessionId: sess.session.sessionId };
}

/** Send the message the mock answers with three pictures, then open the first one. */
async function openReplyPicture(page, sessionId) {
  await page.goto(`${BASE}/chat/${sessionId}`);
  const box = composer(page);
  await box.waitFor();
  await box.fill("image reply test, please");
  await page.getByRole("button", { name: "发送" }).click();

  const pictures = page.locator(".md-body img");
  await expect(pictures).toHaveCount(3, { timeout: 30_000 });
  const picture = pictures.nth(0);
  await expect
    .poll(() => picture.evaluate((img) => img.complete && img.naturalWidth > 0), {
      timeout: 15_000,
    })
    .toBe(true);
  await picture.click();
  await expect(scrim(page)).toHaveCount(1);
  return picture;
}

test("a refused layer split keeps its reason under the picture's bar, past six seconds", async ({
  page,
}) => {
  const { sessionId } = await setUp(page, "imageactionrefusal");
  await openReplyPicture(page, sessionId);

  const writes = [];
  await page.route("**/api/sessions/*/tasks", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    writes.push(route.request().url());
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal", message: RAW } }),
    });
  });

  const layers = scrim(page).getByRole("button", { name: "拆图层" });
  await expect(layers).toBeVisible();
  await layers.click();

  // The overlay stays up — the picture is where the gesture started, and the button under it is
  // still the one to press again — and the reason is drawn under the bar in the interface's words.
  const line = refusalLine(page);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(REFUSED);
  await expect(line).not.toContainText("RAW");
  await expect(scrim(page)).toHaveCount(1);
  await expectNoToast(page);
  expect(writes).toHaveLength(1);

  // Where it sits: under the capsule bar that holds the button it came from.
  const lineBox = await line.boundingBox();
  const barBox = await layers.boundingBox();
  expect(lineBox.y).toBeGreaterThan(barBox.y + barBox.height - 1);

  // Six seconds later the sentence is still there — that is the whole point of the slot.
  await page.waitForTimeout(7_000);
  await expect(line).toHaveText(REFUSED);
  expect(await notifications(page).getByRole("button").count()).toBe(0);

  // —— The retry: same button, nothing stubbed now. The turn really goes out, the overlay closes
  // with it, and the conversation shows what was posted ——
  await page.unroute("**/api/sessions/*/tasks");
  await layers.click();
  await expect(scrim(page)).toHaveCount(0);
  await expect(page.getByText("使用技能：seedream", { exact: false })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("拆成图层（--layers）", { exact: false })).toBeVisible();

  // Reopening the picture is a fresh look: the earlier refusal does not come back with it.
  const pictures = page.locator(".md-body img");
  await pictures.nth(0).click();
  await expect(scrim(page)).toHaveCount(1);
  await expect(refusalLine(page)).toHaveCount(0);
});
