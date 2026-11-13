/**
 * Regression: a batch archive is N writes, so it can land halfway — and the bar that sent it must
 * say which rows did not go instead of leaving a six-second toast behind.
 *
 * Before: `batchSetArchived` ran `Promise.all` and answered a refusal with `toastError`. The first
 * refused PATCH threw away every other row's outcome, so rows that HAD been archived stayed on
 * screen (the list disagreed with the server), every row stayed ticked, and the reason lived in a
 * toast over a list that looked untouched. Now the outcomes are collected per row
 * (`splitBatchOutcome`, the batch delete's own rule): the landed rows take the server's copy and
 * move into the archived folder, the refused ones stay ticked, and the bar keeps the count of what
 * is still left to change plus the server's words — so the retry is the same button, on exactly
 * the rows that did not go.
 *
 * Both tests run against the real server; only the PATCH is taken over, because a refusal has to
 * be produced and the rest of the contract (what moves, what stays, what is still ticked) is what
 * is measured.
 */
import { test, expect } from "@playwright/test";
import { login, ADMIN_ID, ADMIN_PASSWORD } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** The archive call the page makes; a 500 with its own words proves the reason came back. */
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
 * Take over the PATCH per conversation id: `state.refuseFor` holds the ids that are refused and
 * every attempt is recorded; anything else falls through to the real server (so a retry archives
 * for real — and a landed row in the same batch is a real archive too).
 */
async function stubArchive(page, state) {
  await page.route("**/api/sessions/*", async (route) => {
    const req = route.request();
    if (req.method() !== "PATCH") return route.fallback();
    const id = new URL(req.url()).pathname.split("/").pop();
    state.patches.push(id);
    if (!state.refuseFor.has(id)) return route.fallback();
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
}

/** Tick the given conversations, then ask for the batch archive. */
async function askBatchArchive(page, titles) {
  const sidebar = page.getByRole("complementary");
  await sidebar.getByRole("button", { name: "批量处理" }).click();
  for (const title of titles) {
    const box = sidebar.getByRole("checkbox", { name: `选中「${title}」` });
    await expect(box).toBeVisible();
    await box.check();
  }
  await page.getByRole("button", { name: "批量归档", exact: true }).click();
}

test("a batch archive refused in part keeps the reason in the bar, over exactly the rows that did not go", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const stamp = Date.now();
  const kept = `e2e archive kept ${stamp}`;
  const gone = `e2e archive gone ${stamp}`;
  const keptId = await seedSession(page, projectId, kept);
  const goneId = await seedSession(page, projectId, gone);
  const state = { patches: [], refuseFor: new Set([keptId]) };
  await stubArchive(page, state);

  await page.goto("/chat");
  const sidebar = page.getByRole("complementary");
  await expect(sidebar.locator("li", { hasText: gone }).first()).toBeVisible();
  await askBatchArchive(page, [kept, gone]);

  // The reason is inside the bar that sent the request, and nothing is reported through a toast.
  const refusal = page.getByTestId("batch-archive-refusal");
  await expect(refusal).toBeVisible();
  await expect(refusal).toHaveText("还有 1 个对话没有归档：session store is read-only");
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  expect(state.patches.sort()).toEqual([keptId, goneId].sort());

  // Seven seconds later the sentence is still there: nothing here dismisses itself.
  await page.waitForTimeout(7000);
  await expect(refusal).toBeVisible();

  // The half that landed is archived for real — its row has moved into the 已归档 folder — while
  // the refused row is still in the list and still ticked: the ticks now name exactly what a
  // retry would act on, and the archived row is not one of them.
  const archivedFolder = sidebar.getByRole("button", { name: /^已归档/ });
  await expect(archivedFolder).toBeVisible();
  if ((await archivedFolder.getAttribute("aria-expanded")) === "false")
    await archivedFolder.click();
  await expect(sidebar.locator("li", { hasText: gone })).toHaveCount(1);
  await expect(sidebar.getByRole("checkbox", { name: `选中「${gone}」` })).not.toBeChecked();
  await expect(sidebar.locator("li", { hasText: kept }).first()).toBeVisible();
  await expect(sidebar.getByRole("checkbox", { name: `选中「${kept}」` })).toBeChecked();
  const archived = await (await page.request.get(`${BASE}/api/sessions/${goneId}`)).json();
  expect(archived.session.archived).toBe(true);
  const refused = await (await page.request.get(`${BASE}/api/sessions/${keptId}`)).json();
  expect(refused.session.archived).toBe(false);

  // The same button retries: the row lands, so the ticks empty and the bar — with its reason —
  // goes with them.
  state.refuseFor.clear();
  await page.getByRole("button", { name: "批量归档", exact: true }).click();
  await expect(refusal).toHaveCount(0);
  await expect(sidebar.getByText(/已选 \d+ 条/)).toHaveCount(0);
  // Both rows are archived now, so the group holds nothing active and folds away by the sidebar's
  // own rule (its rows are only reachable through the 已归档 folder inside it). What a retry has to
  // prove is that it landed: the bar went with its reason, and the server has the row.
  const retried = await (await page.request.get(`${BASE}/api/sessions/${keptId}`)).json();
  expect(retried.session.archived).toBe(true);
  expect(
    (await (await page.request.get(`${BASE}/api/sessions/${goneId}`)).json()).session.archived,
  ).toBe(true);
  expect(state.patches.filter((id) => id === keptId)).toHaveLength(2);
  expect(state.patches.filter((id) => id === goneId)).toHaveLength(1);
});

test("a batch archive refused whole keeps every tick, and clearing the selection takes the reason with it", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const stamp = Date.now();
  const first = `e2e archive refused 1 ${stamp}`;
  const second = `e2e archive refused 2 ${stamp}`;
  const firstId = await seedSession(page, projectId, first);
  const secondId = await seedSession(page, projectId, second);
  const state = { patches: [], refuseFor: new Set([firstId, secondId]) };
  await stubArchive(page, state);

  await page.goto("/chat");
  const sidebar = page.getByRole("complementary");
  await askBatchArchive(page, [first, second]);

  const refusal = page.getByTestId("batch-archive-refusal");
  await expect(refusal).toHaveText("还有 2 个对话没有归档：session store is read-only");
  expect(state.patches).toHaveLength(2);
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);

  // Nothing went: both rows and both ticks are still there.
  await expect(sidebar.locator("li", { hasText: first }).first()).toBeVisible();
  await expect(sidebar.locator("li", { hasText: second }).first()).toBeVisible();
  await expect(sidebar.getByRole("checkbox", { name: `选中「${first}」` })).toBeChecked();
  await expect(sidebar.getByRole("checkbox", { name: `选中「${second}」` })).toBeChecked();

  // 取消选择 drops the ticks — and the sentence that counted them.
  await page.getByRole("button", { name: "取消选择", exact: true }).click();
  await expect(refusal).toHaveCount(0);
  // Asking again on a fresh selection starts without the last attempt's reason.
  await sidebar.getByRole("checkbox", { name: `选中「${first}」` }).check();
  await expect(page.getByTestId("batch-archive-refusal")).toHaveCount(0);
});
