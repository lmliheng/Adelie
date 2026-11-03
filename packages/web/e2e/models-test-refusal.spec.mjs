/**
 * Regression: the model config dialog's "test connection" button says why a probe did not get
 * through — in the dialog, under the row of buttons that asked — instead of leaving the form
 * exactly as it was with the reason in a notification that dismissed itself after six seconds.
 *
 * The button runs the form's unsaved values past the server and writes nothing, so every failed
 * probe is a form that looks untouched plus one sentence the reader has to keep while fixing it
 * (a wrong key, a base URL that answers nothing). Six seconds later that sentence used to be gone,
 * and the form carried no sign the button had been pressed at all.
 *
 * The probe route is stubbed rather than travelled: what this spec is about is what the page does
 * with the answer. Both shapes the route can send are exercised — an answer that failed upstream
 * (`{ok:false,message}`) and a request that failed on the way out (a coded error) — because they
 * reach the dialog's line through different rules.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const P = "password123";

/** The group and model the tests work with; unique enough to appear nowhere else. */
const GROUP = "probetest";
const MODEL = "probe-test";
const NAME = "Probe Test";
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

/** The line the dialog draws under the button row. */
function line(dialog) {
  return dialog.getByRole("alert");
}

/** The notification area's dismissible entries: what a refusal used to be. */
function toasts(page) {
  return page.getByRole("region", { name: "通知" }).getByRole("button");
}

test("a refused probe leaves its reason under the button row, where it stays", async ({ page }) => {
  await projectWithModel(page, "r190test");

  const dialog = await openModelDialog(page);
  const detail = "connect ECONNREFUSED 127.0.0.1:9";
  const posts = [];
  await page.route("**/api/projects/*/models/test", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    posts.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, message: detail }),
    });
  });

  await dialog.getByRole("button", { name: "测试连通性" }).click();

  // The route's own words, behind the sentence's lead-in, in the dialog — not in a toast.
  await expect(line(dialog)).toHaveText(`连通失败：${detail}`);
  await expect(toasts(page)).toHaveCount(0);
  expect(posts).toHaveLength(1);

  // The probe saved nothing: the form is exactly as it was seeded.
  await expect(dialog.getByLabel("自定义 base URL")).toHaveValue(BASE_URL);

  // And the reason is still on screen after the toast that used to carry it would have gone.
  await page.waitForTimeout(7000);
  await expect(line(dialog)).toHaveText(`连通失败：${detail}`);

  // An edit retires it: the sentence described the form the probe was sent, and that form is no
  // longer the one on screen.
  await dialog.getByLabel("自定义 base URL").fill("http://127.0.0.1:9/v2");
  await expect(line(dialog)).toHaveCount(0);
});

test("a request that failed on the way out reads in the app's words, and the retry clears it", async ({
  page,
}) => {
  await projectWithModel(page, "r190retry");

  const dialog = await openModelDialog(page);
  const posts = [];
  let refuse = true;
  await page.route("**/api/projects/*/models/test", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    posts.push(route.request().postDataJSON());
    if (!refuse) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, latencyMs: 1200 }),
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

  await dialog.getByRole("button", { name: "测试连通性" }).click();
  // The code's own sentence, not the server's English.
  await expect(line(dialog)).toHaveText("连通失败：服务器内部错误，请稍后重试。");
  await expect(toasts(page)).toHaveCount(0);
  expect(posts).toHaveLength(1);
  // What was probed is the draft, not the stored row.
  expect(posts[0]).toMatchObject({
    provider: GROUP,
    modelId: MODEL,
    apiKey: "sk-probe",
    baseUrl: BASE_URL,
  });

  // The button is the retry, and a probe that connects leaves nothing behind: its numbers go to the
  // toast the dialog has always used for them.
  refuse = false;
  await dialog.getByRole("button", { name: "测试连通性" }).click();
  await expect(line(dialog)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "通知" })).toContainText("连通正常（1200 ms）");
  expect(posts).toHaveLength(2);
});
