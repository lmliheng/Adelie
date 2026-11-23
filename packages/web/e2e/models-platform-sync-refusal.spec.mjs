/**
 * Regression: a refused platform sync (a group header's Sync) keeps its sentence under that
 * group's header — where the button that retries it and the rows it was about still are — instead
 * of leaving it in a notification that dismissed itself after six seconds.
 *
 * The sync writes nothing when it is refused: the rows, the default pointer and the vision pointer
 * are exactly as they were, and the header's Sync button is the retry. Going away meant the page
 * looked untouched and the reason expired over it (7.19's rule, app-wide).
 *
 * The endpoint is stubbed rather than made to fail: what this spec is about is what the page does
 * with the answer. The user is given a Project whose Penguin Go group holds a key, which is the
 * one fact the header's Sync action is gated on (group-header.ts), seeded through the table PUT so
 * nothing here depends on a live authorization.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const P = "password123";

/** The group the tests work with, as the catalog names it. */
const GROUP = "penguin-go";
const LABEL = "Penguin Go";
const KEY = "sk-probe-platform";

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
 * Provision the user and give their Project a Penguin Go key (through the table PUT, so the
 * header's Sync action appears without running an authorization). Idempotent: a rerun on the same
 * data root leaves the already-keyed table alone.
 */
async function projectWithPlatformKey(page, user) {
  await provisionAndLogin(page.request, user, P);
  const { projects } = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects[0].projectId;
  const read = async () =>
    await (await page.request.get(`${BASE}/api/projects/${projectId}/models`)).json();
  const table = await read();
  const rows = table.models.filter((m) => m.provider === GROUP);
  expect(rows.length, "the catalog seeds Penguin Go rows").toBeGreaterThan(0);
  if (!rows.some((row) => row.credential?.apiKeyMasked)) {
    const first = rows[0];
    const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
      data: {
        defaultModel: table.defaultModel,
        models: table.models.map((m) =>
          m.provider === GROUP && m.modelId === first.modelId
            ? { ...toEntry(m), apiKey: KEY }
            : toEntry(m),
        ),
      },
    });
    expect(put.ok(), "seed the group's key through the table PUT").toBeTruthy();
  }
  expect(
    (await read()).models.find((m) => m.provider === GROUP)?.credential?.apiKeyMasked,
    "the group holds a key",
  ).toBeTruthy();
}

/**
 * Open the models page filtered to the group and press its Sync. The list is filtered rather than
 * scrolled: Penguin Go sits among two dozen groups, and a search force-opens whatever it leaves
 * visible.
 */
async function pressSync(page) {
  await page.goto("/models");
  await page.locator('input[placeholder*="搜索"]').first().fill(LABEL);
  const action = page.getByRole("button", { name: `同步 ${LABEL}` });
  await expect(action).toBeVisible();
  await action.click();
  return action;
}

/** The sentence under the group's header: the only alert on this filtered page. */
function line(page) {
  return page.getByRole("alert");
}

/** The notification area's dismissible entries: what a refusal used to be. */
function toasts(page) {
  return page.getByRole("region", { name: "通知" }).getByRole("button");
}

test("a refused sync leaves the reason under the group header, and it stays there", async ({
  page,
}) => {
  await projectWithPlatformKey(page, "r309refused");

  const posts = [];
  await page.route("**/api/projects/*/platform-auth/sync", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    posts.push(route.request().postDataJSON());
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal", message: "RAW ENGLISH MESSAGE" } }),
    });
  });

  await pressSync(page);

  // The sentence is under the header that asked — not in a toast.
  await expect(line(page)).toHaveText("操作被拒绝：服务器内部错误，请稍后重试。");
  await expect(toasts(page)).toHaveCount(0);
  expect(posts).toHaveLength(1);
  // The action is still there to press again: it is the retry.
  await expect(page.getByRole("button", { name: `同步 ${LABEL}` })).toBeVisible();

  // And it is still there after the toast that used to carry it would have gone.
  await page.waitForTimeout(7000);
  await expect(line(page)).toHaveText("操作被拒绝：服务器内部错误，请稍后重试。");
});

test("a written sync clears the sentence and says the table was already up to date", async ({
  page,
}) => {
  await projectWithPlatformKey(page, "r309retry");

  const { projects } = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects[0].projectId;
  let refuse = true;
  await page.route("**/api/projects/*/platform-auth/sync", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    if (refuse) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "internal", message: "RAW ENGLISH MESSAGE" } }),
      });
      return;
    }
    // A landed sync answers with the table it wrote and how many entries it touched.
    const table = await (await page.request.get(`${BASE}/api/projects/${projectId}/models`)).json();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...table, added: 0, updated: 0 }),
    });
  });

  await pressSync(page);
  await expect(line(page)).toHaveText("操作被拒绝：服务器内部错误，请稍后重试。");

  // The button is the retry: a sync that lands takes the sentence away and reports the answer.
  refuse = false;
  await page.getByRole("button", { name: `同步 ${LABEL}` }).click();
  await expect(line(page)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "通知" })).toContainText("预置模型已是最新");
});
