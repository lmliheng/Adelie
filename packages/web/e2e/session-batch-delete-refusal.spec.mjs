/**
 * Regression: a batch delete is N writes, so it can land halfway — and the card that asked must
 * say so instead of leaving a six-second toast behind.
 *
 * Before: `confirmBatchDelete` ran `Promise.all`, so the first refused DELETE threw away every
 * other row's outcome. The card stayed open (it closes only on a landed batch) but the reason was
 * a toast above it, all rows stayed ticked even though some were already gone, and the list could
 * not be told apart from the server. Now the outcomes are collected per row (`allSettled`): the
 * landed rows leave the list and the ticks, the refused ones stay ticked, and the card keeps the
 * count of what is still left to delete plus the server's words in its `refusal` slot — so the
 * retry is the same button, on exactly the rows that did not go.
 *
 * Both tests run against the real server; only the DELETE is taken over, because a refusal has to
 * be produced and the rest of the contract (what closes, what stays, what is still ticked) is what
 * is measured.
 */
import { test, expect } from "@playwright/test";
import { login, ADMIN_ID, ADMIN_PASSWORD } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** The delete call the page makes; a 500 with its own words proves the reason came back. */
const REFUSAL = { code: "session_store_read_only", message: "session store is read-only" };

/** Configure the mock model and create one titled conversation; returns its id. */
async function seedSession(page, projectId, title) {
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
          pricing: { cacheRead: 1, cacheWrite: 5, output: 10 },
        },
      ],
    },
  });
  expect(put.ok(), "put models").toBeTruthy();

  const created = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
    { data: { provider: "custom", modelId: "claude-4-8" } },
  );
  expect(created.ok(), "create session").toBeTruthy();
  const sessionId = (await created.json()).session.sessionId;

  const renamed = await page.request.patch(`${BASE}/api/sessions/${sessionId}`, {
    data: { title },
  });
  expect(renamed.ok(), "rename session").toBeTruthy();
  return sessionId;
}

/**
 * Take over the DELETE per conversation id: `state.refuseFor` holds the ids that are refused and
 * every attempt is recorded; anything else falls through to the real server (so a retry deletes
 * for real — and a landed row in the same batch is a real deletion too).
 */
async function stubDelete(page, state) {
  await page.route("**/api/sessions/*", async (route) => {
    const req = route.request();
    if (req.method() !== "DELETE") return route.fallback();
    const id = new URL(req.url()).pathname.split("/").pop();
    state.deletes.push(id);
    if (!state.refuseFor.has(id)) return route.fallback();
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
}

/** Tick the given conversations and ask for the batch delete — the card is left open. */
async function askBatchDelete(page, titles) {
  const sidebar = page.getByRole("complementary");
  await sidebar.getByRole("button", { name: "批量处理" }).click();
  for (const title of titles) {
    const box = sidebar.getByRole("checkbox", { name: `选中「${title}」` });
    await expect(box).toBeVisible();
    await box.check();
  }
  await page.getByRole("button", { name: "批量删除", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The card's text with its refusal line dropped — the only thing a refusal may change. */
async function cardText(dialog) {
  return (await dialog.innerText()).replace(/\n还有 \d+ 个对话没有删除：[^\n]*/, "");
}

test("a batch refused in part keeps the card, the reason and exactly the rows that did not go", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const stamp = Date.now();
  const kept = `e2e batch kept ${stamp}`;
  const gone = `e2e batch gone ${stamp}`;
  const keptId = await seedSession(page, projectId, kept);
  const goneId = await seedSession(page, projectId, gone);
  const state = { deletes: [], refuseFor: new Set([keptId]) };
  await stubDelete(page, state);

  await page.goto("/chat");
  const sidebar = page.getByRole("complementary");
  await expect(sidebar.locator("li", { hasText: gone }).first()).toBeVisible();
  const dialog = await askBatchDelete(page, [kept, gone]);
  const before = await cardText(dialog);
  expect(before).toContain("确定删除选中的 2 个对话");

  await dialog.getByRole("button", { name: "删除", exact: true }).click();

  // The reason is inside the card that asked, and the card is not reporting through a toast.
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(dialog.getByText(/还有 1 个对话没有删除/)).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  expect(state.deletes.sort()).toEqual([keptId, goneId].sort());

  // The half that landed is gone from the list; the refused row is still there — and the card now
  // counts exactly that row, which is what makes the retry act on it and nothing else.
  await expect(sidebar.locator("li", { hasText: gone })).toHaveCount(0);
  await expect(sidebar.locator("li", { hasText: kept }).first()).toBeVisible();
  await expect(dialog.getByText("确定删除选中的 1 个对话")).toBeVisible();
  await expect(sidebar.getByRole("checkbox", { name: `选中「${kept}」` })).toBeChecked();
  await expect(sidebar.getByRole("checkbox", { name: `选中「${gone}」` })).toHaveCount(0);

  // The same button retries: this time the row lands, so the card closes and the row goes.
  state.refuseFor.clear();
  await dialog.getByRole("button", { name: "删除", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(sidebar.locator("li", { hasText: kept })).toHaveCount(0);
  expect(state.deletes.filter((id) => id === keptId)).toHaveLength(2);
  expect(state.deletes.filter((id) => id === goneId)).toHaveLength(1);

  // Both are really gone: the landed row from the first attempt, the retried one on the second.
  expect((await page.request.get(`${BASE}/api/sessions/${goneId}`)).status()).toBe(404);
  expect((await page.request.get(`${BASE}/api/sessions/${keptId}`)).status()).toBe(404);
});

test("a batch refused whole keeps every tick, and reopening the card drops the old reason", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const stamp = Date.now();
  const first = `e2e batch refused 1 ${stamp}`;
  const second = `e2e batch refused 2 ${stamp}`;
  const firstId = await seedSession(page, projectId, first);
  const secondId = await seedSession(page, projectId, second);
  const state = { deletes: [], refuseFor: new Set([firstId, secondId]) };
  await stubDelete(page, state);

  await page.goto("/chat");
  const sidebar = page.getByRole("complementary");
  const dialog = await askBatchDelete(page, [first, second]);
  const before = await cardText(dialog);

  await dialog.getByRole("button", { name: "删除", exact: true }).click();

  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(dialog.getByText("还有 2 个对话没有删除：session store is read-only")).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(await cardText(dialog)).toBe(before);
  expect(state.deletes).toHaveLength(2);
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);

  // Nothing went: both rows and both ticks are still there.
  await expect(sidebar.locator("li", { hasText: first }).first()).toBeVisible();
  await expect(sidebar.locator("li", { hasText: second }).first()).toBeVisible();
  await expect(sidebar.getByRole("checkbox", { name: `选中「${first}」` })).toBeChecked();
  await expect(sidebar.getByRole("checkbox", { name: `选中「${second}」` })).toBeChecked();

  // Closing decides nothing; asking again starts without the last attempt's reason.
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "批量删除", exact: true }).click();
  const reopened = page.getByRole("dialog");
  await expect(reopened).toBeVisible();
  await expect(reopened.getByText(REFUSAL.message)).toHaveCount(0);
  await expect(reopened.getByText("确定删除选中的 2 个对话")).toBeVisible();
});
