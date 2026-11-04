/**
 * Regression: the model config dialog's vision probe says why it decided nothing — in the dialog,
 * under the switch it was asked about — instead of leaving the form exactly as it was with the
 * reason in a notification that dismissed itself after six seconds.
 *
 * The probe spends the user's credential on one tiny image request. Two of its outcomes move the
 * switch (accepted → on, refused → off) and that movement is the whole account of the press. The
 * third learned nothing and leaves the switch alone, so the sentence is the only thing that says
 * the button was pressed — and the fields it is about (the key, the base URL, the model id) are all
 * in the same dialog. As a notification it was gone six seconds later.
 *
 * A second wrong it fixes: those two sentences used to be protocol detection's ("could not detect
 * the protocol, check the API key and the base URL") although the press was about images.
 *
 * The probe route is stubbed rather than travelled — it bills a real provider — because what this
 * spec is about is what the page does with the answer.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const P = "password123";

/** The group and model the tests work with; unique enough to appear nowhere else. */
const GROUP = "probevision";
const MODEL = "probe-vision";
const NAME = "Probe Vision";
const BASE_URL = "http://127.0.0.1:9/v1";

/** The row the model is, as this file seeds it: a hand-added model of a user-defined group. */
const ROW = {
  provider: GROUP,
  modelId: MODEL,
  displayName: NAME,
  contextWindow: 32000,
  clientType: "openai-chat",
  baseUrl: BASE_URL,
  maxTokens: 4096,
};

/** The table entry a `ModelInfo` came from: every field the response reports, sent back as-is. */
function toEntry(m) {
  const entry = { provider: m.provider, modelId: m.modelId };
  for (const key of [
    "displayName",
    "contextWindow",
    "clientType",
    "vision",
    "maxTokens",
    "fastMode",
    "pricing",
  ]) {
    if (m[key] !== undefined) entry[key] = m[key];
  }
  if (m.credential?.baseUrl !== undefined) entry.baseUrl = m.credential.baseUrl;
  return entry;
}

/**
 * Provision the user and seed their Project with the model, through the table PUT so nothing here
 * depends on the built-in catalog. Idempotent: a rerun on the same data root rewrites the row the
 * tests expect rather than trusting it.
 */
async function projectWithModel(page, user) {
  await provisionAndLogin(page.request, user, P);
  const { projects } = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects[0].projectId;
  const read = async () =>
    (await page.request.get(`${BASE}/api/projects/${projectId}/models`)).json();

  const table = await read();
  const current = table.models.find((m) => m.provider === GROUP && m.modelId === MODEL);
  if (!current || (current.displayName ?? "") !== NAME) {
    const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
      data: {
        defaultModel: table.defaultModel,
        models: [...table.models.filter((m) => m.provider !== GROUP).map(toEntry), ROW],
      },
    });
    expect(put.ok(), "seed the model through the table PUT").toBeTruthy();
  }
  expect(
    (await read()).models.find((m) => m.provider === GROUP && m.modelId === MODEL),
    "the Project holds the model",
  ).toBeTruthy();
}

/**
 * Open the model's config dialog. The list is filtered rather than scrolled: a user-defined group
 * sits far below the built-in ones, and a search force-opens every group it leaves visible.
 */
async function openModelDialog(page) {
  await page.goto("/models");
  await page.locator('input[placeholder*="搜索"]').first().fill(NAME);
  const card = page.getByText(NAME, { exact: true }).first();
  await expect(card).toBeVisible();
  await card.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "删除模型" })).toBeVisible();
  return dialog;
}

/** The probe trigger beside the vision switch — "检测", not the base URL's "检测协议". */
function detectButton(dialog) {
  return dialog.getByRole("button", { name: "检测", exact: true });
}

/** The line the dialog draws under the vision switch. */
function line(dialog) {
  return dialog.getByRole("alert");
}

/** The notification area's dismissible entries: what a failed probe used to be. */
function toasts(page) {
  return page.getByRole("region", { name: "通知" }).getByRole("button");
}

test("a probe that learned nothing leaves its reason under the vision switch", async ({ page }) => {
  await projectWithModel(page, "r192test");

  const dialog = await openModelDialog(page);
  const posts = [];
  await page.route("**/api/projects/*/models/detect-vision", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    posts.push(route.request().postDataJSON());
    // What the route sends when the provider answered nothing usable: the truncated upstream text.
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ outcome: "failed", message: "401 Unauthorized: invalid api key" }),
    });
  });

  await detectButton(dialog).click();

  // One sentence, in the dialog, naming what was probed plus the provider's own words.
  await expect(line(dialog)).toHaveText("视觉检测失败：401 Unauthorized: invalid api key");
  await expect(toasts(page)).toHaveCount(0);
  expect(posts).toHaveLength(1);
  // The probe asked about the form as it stands, and wrote nothing back into it.
  expect(posts[0]).toMatchObject({ provider: GROUP, modelId: MODEL, baseUrl: BASE_URL });

  // And the reason is still on screen after the toast that used to carry it would have gone.
  await page.waitForTimeout(7000);
  await expect(line(dialog)).toHaveText("视觉检测失败：401 Unauthorized: invalid api key");

  // An edit retires it: the sentence described the endpoint that was probed, and that endpoint is
  // no longer the one in the field.
  await dialog.getByLabel("自定义 base URL").fill("http://127.0.0.1:9/v2");
  await expect(line(dialog)).toHaveCount(0);
});

test("a request that failed on the way out reads in the app's words, and the retry clears it", async ({
  page,
}) => {
  await projectWithModel(page, "r192retry");

  const dialog = await openModelDialog(page);
  const posts = [];
  let refuse = true;
  await page.route("**/api/projects/*/models/detect-vision", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    posts.push(route.request().postDataJSON());
    if (!refuse) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ outcome: "supported" }),
      });
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal", message: "RAW ENGLISH MESSAGE" } }),
    });
  });

  // A key typed but not yet saved: the probe asks about it, which is why its refusal belongs on the
  // form rather than in a notification.
  await dialog.getByLabel("API key").fill("sk-probe");

  await detectButton(dialog).click();
  // The code's own sentence, not the server's English, and not protocol detection's advice.
  await expect(line(dialog)).toHaveText("视觉检测失败：服务器内部错误，请稍后重试。");
  await expect(toasts(page)).toHaveCount(0);
  expect(posts).toHaveLength(1);
  // What was probed is the draft, not the stored row.
  expect(posts[0]).toMatchObject({ baseUrl: BASE_URL, apiKey: "sk-probe" });

  // The button is the retry, and a verdict leaves no line behind: vision is switched on and the
  // outcome travels in the toast the dialog has always used for it.
  refuse = false;
  await detectButton(dialog).click();
  await expect(line(dialog)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "通知" })).toContainText(
    "该模型接受图片输入，已开启视觉",
  );
  await expect(dialog.getByRole("switch", { name: "支持视觉" })).toBeChecked();
  expect(posts).toHaveLength(2);
});
