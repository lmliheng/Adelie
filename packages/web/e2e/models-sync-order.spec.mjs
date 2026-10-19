/**
 * Regression: "Sync presets" writes the merge before the confirmation that started it is
 * dismissed — and a refused write takes the merge back off the screen.
 *
 * The confirmation (the Models page's notice → 「现在升级」) lists every entry the sync would
 * write, because a sync rewrites the catalog-owned fields of each one. It used to close on the
 * way out of the request, success or not. Two things followed from that, and the second is the
 * one that trapped the user:
 *
 * 1. The refusal kept nothing on screen: the sentence, the list of refs and the reason it named
 *    were gone with the dialog, and the error toast was the only trace.
 * 2. `persist` keeps the attempted rows for a field edit the user is still holding, so the
 *    refused merge stayed in the page's table. The retry then computed an empty delta from a
 *    table that only *looked* synced: it answered 「预置模型已是最新」 **without sending a
 *    request**, while the notice above kept naming every entry the server still lacked. Only a
 *    reload got out of it. (Measured on the pre-fix build: one refused PUT, then a retry with
 *    zero PUTs and the server's table unchanged.)
 *
 * The two tests drive the same refusal and then the retry, with the delta made through the API:
 * one catalog entry is removed from the Project's table, so the notice has something real to
 * name. Counts asserted here come from the responses the page itself receives and from the
 * Project's own table read again, never from a fixed number in this file.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const P = "password123";

/** A catalog entry a Project can be made to lack; unique enough that a search names only it. */
const TARGET = { provider: "openrouter", modelId: "z-ai/glm-5.3-flash" };

/** The table entry a `ModelInfo` came from: every field the response reports, sent back as-is. */
function toEntry(m) {
  const entry = { provider: m.provider, modelId: m.modelId };
  if (m.displayName !== undefined) entry.displayName = m.displayName;
  if (m.contextWindow !== undefined) entry.contextWindow = m.contextWindow;
  if (m.clientType !== undefined) entry.clientType = m.clientType;
  if (m.vision !== undefined) entry.vision = m.vision;
  if (m.maxTokens !== undefined) entry.maxTokens = m.maxTokens;
  if (m.fastMode !== undefined) entry.fastMode = m.fastMode;
  if (m.pricing !== undefined) entry.pricing = m.pricing;
  if (m.credential?.baseUrl !== undefined) entry.baseUrl = m.credential.baseUrl;
  return entry;
}

/**
 * Provision the user and make sure their Project lacks exactly one catalog entry (the second
 * run on the same data root finds it already synced and leaves the table alone).
 */
async function projectMissingOnePreset(page, userId) {
  await provisionAndLogin(page.request, userId, P);
  const { projects } = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects[0].projectId;
  const read = async () =>
    (await page.request.get(`${BASE}/api/projects/${projectId}/models`)).json();
  const has = (table) =>
    table.models.some((m) => m.provider === TARGET.provider && m.modelId === TARGET.modelId);

  let table = await read();
  if (has(table)) {
    const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
      data: {
        defaultModel: table.defaultModel,
        models: table.models
          .filter((m) => !(m.provider === TARGET.provider && m.modelId === TARGET.modelId))
          .map(toEntry),
      },
    });
    expect(put.ok(), "remove one preset through the table PUT").toBeTruthy();
    table = await read();
  }
  expect(has(table), "the Project lacks the target entry").toBe(false);
  return { projectId, read };
}

/** Refuse every table write with a code the app has no local copy for, so the server's words show. */
async function refuseWrites(page, seen) {
  await page.route("**/api/projects/*/models", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    seen.push(route.request().url());
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "models_store_closed", message: "models store is closed" },
      }),
    });
  });
}

test("a refused preset sync keeps its dialog, its sentence and the table the server has", async ({
  page,
}) => {
  const { read } = await projectMissingOnePreset(page, "r88refuse");
  const before = await read();

  await page.goto("/models");
  const notice = page.getByText(/检测到变更：1 个新增/);
  await expect(notice).toBeVisible();
  await page.getByRole("button", { name: "现在升级" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const sentence = await dialog.innerText();
  expect(sentence).toContain(`${TARGET.provider}/${TARGET.modelId}`);

  const puts = [];
  await refuseWrites(page, puts);
  await dialog.getByRole("button", { name: "同步预置" }).click();

  // The write was refused, and the dialog stays exactly as it was — same sentence, same list.
  await expect(page.getByText("models store is closed")).toBeVisible();
  expect(puts).toHaveLength(1);
  await expect(dialog).toBeVisible();
  expect(await dialog.innerText()).toBe(sentence);

  // The server still holds the old table, and the page's own table agrees with it: the entry
  // the merge would have added is not there to be found, although the notice still names it.
  const after = await read();
  expect(after.models.length).toBe(before.models.length);
  expect(
    after.models.some((m) => m.provider === TARGET.provider && m.modelId === TARGET.modelId),
  ).toBe(false);
  const search = page.getByPlaceholder(/搜索模型/);
  await search.fill(TARGET.modelId);
  await expect(page.getByText("没有匹配的模型")).toBeVisible();
  await search.fill("");

  // Closing the dialog leaves the notice where it was — nothing was decided by the refusal.
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(notice).toBeVisible();
});

test("the retry after a refused sync writes the merge, and only a written one closes the dialog", async ({
  page,
}) => {
  const { read } = await projectMissingOnePreset(page, "r88retry");

  await page.goto("/models");
  await expect(page.getByText(/检测到变更：1 个新增/)).toBeVisible();

  const puts = [];
  page.on("request", (r) => {
    if (r.method() === "PUT" && r.url().includes("/models")) puts.push(r.url());
  });
  let refuse = true;
  await page.route("**/api/projects/*/models", async (route) => {
    if (route.request().method() !== "PUT" || !refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "models_store_closed", message: "models store is closed" },
      }),
    });
  });

  await page.getByRole("button", { name: "现在升级" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "同步预置" }).click();
  await expect(page.getByText("models store is closed")).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(puts).toHaveLength(1);

  // The retry is the same confirmation, and it really writes: before the fix the merged rows
  // were still in the table, the delta came out empty and this click sent nothing at all.
  refuse = false;
  await dialog.getByRole("button", { name: "同步预置" }).click();
  await expect(dialog).toHaveCount(0);
  expect(puts).toHaveLength(2);
  await expect(page.getByText(/预置模型已同步：新增 1/)).toBeVisible();
  await expect(page.getByText(/个预置模型可同步|检测到变更：/)).toHaveCount(0);

  const after = await read();
  expect(
    after.models.some((m) => m.provider === TARGET.provider && m.modelId === TARGET.modelId),
  ).toBe(true);
});
