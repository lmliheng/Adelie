/**
 * Regression: the model config dialog's "detect" button says why a probe found no protocol — in the
 * dialog, under the base URL field it read — instead of leaving the form exactly as it was with the
 * reason in a notification that dismissed itself after six seconds.
 *
 * The button asks the endpoint about the URL the form currently holds and writes nothing. A miss is
 * therefore one sentence the reader has to keep while they fix the two things it names (the API key,
 * the base URL), and both of those fields are in the same dialog. Six seconds after the press that
 * sentence used to be gone, and the form carried no sign the button had been pressed at all.
 *
 * The probe route is stubbed rather than travelled: what this spec is about is what the page does
 * with the answer. Both shapes are exercised — an answer that named no protocol (the same sentence
 * the button has always used) and a request that failed on the way out (which now reads in the
 * app's own words, because the endpoint was never asked and "check your key and URL" would send the
 * reader to fields that may well be fine).
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const P = "password123";

/** The group and model the tests work with; unique enough to appear nowhere else. */
const GROUP = "probedetect";
const MODEL = "probe-detect";
const NAME = "Probe Detect";
const BASE_URL = "http://127.0.0.1:9/v1";

/** The sentence a press that found nothing leaves: the one the button has always used. */
const MISS = "无法检测接口协议，请检查 API Key 与 base URL。";

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

/** The line the dialog draws under the base URL field. */
function line(dialog) {
  return dialog.getByRole("alert");
}

/** The notification area's dismissible entries: what a miss used to be. */
function toasts(page) {
  return page.getByRole("region", { name: "通知" }).getByRole("button");
}

test("a detection that found nothing leaves its reason under the base URL field", async ({
  page,
}) => {
  await projectWithModel(page, "r191test");

  const dialog = await openModelDialog(page);
  const posts = [];
  await page.route("**/api/projects/*/models/detect", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    posts.push(route.request().postDataJSON());
    // What the route sends when none of the three probes matched: no `detected`, no `baseUrl`.
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ probes: [] }),
    });
  });

  await dialog.getByRole("button", { name: "检测协议" }).click();

  // One sentence, in the dialog, naming the two fields it sits between — not in a toast.
  await expect(line(dialog)).toHaveText(MISS);
  await expect(toasts(page)).toHaveCount(0);
  expect(posts).toHaveLength(1);
  // The probe asked about the form as it stands, and wrote nothing back into it.
  expect(posts[0]).toMatchObject({ baseUrl: BASE_URL });

  // And the reason is still on screen after the toast that used to carry it would have gone.
  await page.waitForTimeout(7000);
  await expect(line(dialog)).toHaveText(MISS);

  // An edit retires it: the sentence described the URL the probe was sent, and that URL is no
  // longer the one in the field.
  await dialog.getByLabel("自定义 base URL").fill("http://127.0.0.1:9/v2");
  await expect(line(dialog)).toHaveCount(0);
});

test("a request that failed on the way out reads in the app's words, and the retry clears it", async ({
  page,
}) => {
  await projectWithModel(page, "r191retry");

  const dialog = await openModelDialog(page);
  const posts = [];
  let refuse = true;
  await page.route("**/api/projects/*/models/detect", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    posts.push(route.request().postDataJSON());
    if (!refuse) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ detected: "openai-chat", baseUrl: BASE_URL, probes: [] }),
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

  await dialog.getByRole("button", { name: "检测协议" }).click();
  // The code's own sentence, not the server's English, and not the "check your key and URL" advice
  // for a request that never reached the endpoint.
  await expect(line(dialog)).toHaveText("服务器内部错误，请稍后重试。");
  await expect(toasts(page)).toHaveCount(0);
  expect(posts).toHaveLength(1);
  // What was probed is the draft, not the stored row.
  expect(posts[0]).toMatchObject({ baseUrl: BASE_URL, apiKey: "sk-probe" });

  // The button is the retry, and a probe that lands leaves nothing behind: the line goes and the
  // hit travels in the toast the dialog has always used for it.
  refuse = false;
  await dialog.getByRole("button", { name: "检测协议" }).click();
  await expect(line(dialog)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "通知" })).toContainText(
    "检测到 OpenAI Chat Completions 协议，已应用",
  );
  expect(posts).toHaveLength(2);
});
