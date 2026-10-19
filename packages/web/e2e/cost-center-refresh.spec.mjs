/**
 * Regression: opening the clear confirmation also refreshes the dashboard behind it.
 *
 * The cost center's stats ("总数 / 未预期 / 已预期") are the dashboard response's numbers, and
 * that response is taken before the page's own requests are answered — loading the page records
 * one of them (a member's shell asks for the machine list and gets a 403 `admin_required`). So
 * the dialog could name a larger count than the panel right behind it showed: the sentence read
 * "3 records" over a stats row still saying "2". The fix refreshes the dashboard when the
 * confirmation opens, in the background — the dialog still opens on the count it just read.
 *
 * Two properties:
 *
 * 1. **The refresh happens, and it is the only new read.** Opening the confirmation issues one
 *    more dashboard GET, whose answer is what the stats then show; cancelling does not issue
 *    another, and leaves the caught-up panel in place.
 * 2. **A failed refresh does not disturb the confirmation.** The dialog stays open, keeps its
 *    sentence, and the delete still takes exactly that set; the next successful reload catches
 *    the panel up.
 *
 * The errors are the app's real ones: the mock rejects the auth prompt with 401 (`unexpected`)
 * and the quota prompt with 403 (also `unexpected`, a fatal turn), both reaching `error_records`
 * through the server's own recorder. Every number asserted comes from a response the page
 * itself received, so a rerun on a data root that is not fresh still holds.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";

/** The dashboard read the panel's stats come from. */
const isDashboard = (r) => r.url().includes("/usage?") && r.request().method() === "GET";

/** The confirmation's own count read: the first page of the error table, no `kind`. */
const isCountRead = (r) => {
  if (!r.url().includes("/usage/errors?") || r.request().method() !== "GET") return false;
  const u = new URL(r.url());
  return u.searchParams.get("limit") === "1" && !u.searchParams.has("kind");
};

const isDelete = (r) => r.url().includes("/usage/errors") && r.request().method() === "DELETE";

/** The panel's "总数" stat as the reader sees it — "总数 4". */
async function statTotal(page) {
  const stat = page.getByText("总数", { exact: true }).locator("..");
  return (await stat.innerText()).replace(/\s+/g, " ");
}

/** Provision the user, point the Project at the mock (a key the mock rejects), open one Session. */
async function prepare(page, userId) {
  await provisionAndLogin(page.request, userId, P);
  const { projects } = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects[0].projectId;
  const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
    data: {
      defaultModel: { provider: "custom", modelId: "claude-4-8" },
      models: [
        {
          provider: "custom",
          modelId: "claude-4-8",
          apiKey: "sk-auth-bad",
          baseUrl: MOCK,
          contextWindow: 200000,
        },
      ],
    },
  });
  expect(put.ok(), "put models").toBeTruthy();
  return { projectId, sessionId: await newSession(page, projectId) };
}

/** One more Session on the same Project (the mock picks its branch off the whole request body). */
async function newSession(page, projectId) {
  const sess = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
    { data: { provider: "custom", modelId: "claude-4-8" } },
  );
  expect(sess.ok(), "create session").toBeTruthy();
  return (await sess.json()).session.sessionId;
}

/** One failed turn through the API; resolves once the Trace holds its terminal `request_end`. */
async function failedTurn(page, sessionId, text, code) {
  const res = await page.request.post(`${BASE}/api/sessions/${sessionId}/tasks`, {
    data: { input: [{ type: "text", text }] },
  });
  expect(res.status(), "start task").toBe(202);
  await expect
    .poll(
      async () => {
        const { messages } = await (
          await page.request.get(`${BASE}/api/sessions/${sessionId}/messages`)
        ).json();
        return messages.some(
          (m) => m.payload.type === "request_end" && m.payload.error_code === code,
        );
      },
      { timeout: 30_000 },
    )
    .toBe(true);
}

test("opening the confirmation refreshes the dashboard behind it, and cancelling keeps it", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { projectId, sessionId } = await prepare(page, "refreshstats");

  // One failed turn on the books before the shell loads; it records two entries (the provider
  // error and the fatal turn), but the test never hard-codes them — every number is read back.
  await failedTurn(page, sessionId, "auth dead test", "auth");

  let dashboards = 0;
  page.on("response", (r) => {
    if (isDashboard(r)) dashboards += 1;
  });
  const loaded = page.waitForResponse(isDashboard);
  await page.goto(`${BASE}/usage`);
  const atLoad = await (await loaded).json();
  await expect(page.locator("tbody tr")).toHaveCount(atLoad.errors.recent.length);
  await expect.poll(async () => statTotal(page)).toBe(`总数 ${atLoad.errors.total}`);

  // Past the recorder's 2 s dedup window, one more surprise while the tab stays open: the panel
  // keeps the load's snapshot, while the API now counts more.
  await page.waitForTimeout(2_500);
  await failedTurn(page, await newSession(page, projectId), "quota fatal test", "rejected");
  expect(dashboards, "nothing reloaded the page between the load and the click").toBe(1);
  await expect.poll(async () => statTotal(page)).toBe(`总数 ${atLoad.errors.total}`);

  // Opening the confirmation reads the count itself, and then refreshes the dashboard so the
  // stats behind the dialog say the same thing. Both responses are awaited from before the click.
  const counted = page.waitForResponse(isCountRead, { timeout: 15_000 });
  const refreshed = page.waitForResponse(isDashboard, { timeout: 15_000 });
  await page.getByRole("button", { name: "清空", exact: true }).click();
  const countedBody = await (await counted).json();
  const refreshedBody = await (await refreshed).json();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(dashboards, "opening the dialog issues exactly one more dashboard read").toBe(2);
  expect(
    refreshedBody.errors.total,
    "the refresh sees the records the snapshot missed",
  ).toBeGreaterThan(atLoad.errors.total);
  expect(refreshedBody.errors.total).toBeGreaterThanOrEqual(countedBody.total);
  // The stats behind the dialog catch up to that read; the sentence stays the count the dialog
  // itself read, not the dashboard's later snapshot.
  await expect.poll(async () => statTotal(page)).toBe(`总数 ${refreshedBody.errors.total}`);
  await expect(dialog).toContainText(`近 7 天内的 ${countedBody.total} 条错误记录`);

  // Cancel: nothing is deleted, no third read goes out, and the caught-up panel stays caught up.
  const deletes = [];
  page.on("request", (r) => {
    if (r.url().includes("/usage/errors") && r.method() === "DELETE") deletes.push(r.url());
  });
  await page.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  expect(deletes).toHaveLength(0);
  expect(dashboards, "cancelling issues no further read").toBe(2);
  expect(await statTotal(page)).toBe(`总数 ${refreshedBody.errors.total}`);
});

test("a dashboard refresh that fails leaves the confirmation intact, and the delete still goes", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { sessionId } = await prepare(page, "refreshfail");
  await failedTurn(page, sessionId, "auth dead test", "auth");

  // Only the reload issued from the confirmation fails; the initial load must succeed.
  let failDashboard = false;
  await page.route("**/api/projects/*/usage*", async (route) => {
    const url = route.request().url();
    if (!failDashboard || !url.includes("/usage?") || route.request().method() !== "GET") {
      return route.fallback();
    }
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "usage_store_closed", message: "usage store is closed" },
      }),
    });
  });

  const loaded = page.waitForResponse(isDashboard);
  await page.goto(`${BASE}/usage`);
  const atLoad = await (await loaded).json();
  await expect(page.locator("tbody tr")).toHaveCount(atLoad.errors.recent.length);

  failDashboard = true;
  const failed = page.waitForResponse((r) => isDashboard(r) && r.status() === 500, {
    timeout: 15_000,
  });
  const counted = page.waitForResponse(isCountRead, { timeout: 15_000 });
  await page.getByRole("button", { name: "清空", exact: true }).click();
  const countedBody = await (await counted).json();
  await failed;
  const dialog = page.getByRole("dialog");
  // The refresh is background work: a refused one costs the reader nothing here. The dialog is
  // open, names the set the count read saw, and the stats behind it keep the last good snapshot.
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`近 7 天内的 ${countedBody.total} 条错误记录`);
  expect(await statTotal(page)).toBe(`总数 ${atLoad.errors.total}`);

  // Recovery, then the write: it carries the boundary the dialog named and closes on success.
  failDashboard = false;
  const reply = page.waitForResponse(isDelete);
  await dialog.getByRole("button", { name: "清空" }).click();
  const deleteResponse = await reply;
  const deleteUrl = new URL(deleteResponse.request().url());
  expect(deleteUrl.searchParams.get("until")).toBe(countedBody.items[0].ts);
  const { deleted } = await deleteResponse.json();
  expect(deleted).toBe(countedBody.total);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(`已删除 ${deleted} 条错误记录`)).toBeVisible();
  // The next successful reload catches the panel up: table empty, stats zero, notice gone.
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await expect(page.getByText("暂无异常")).toBeVisible();
  await expect.poll(async () => statTotal(page)).toBe("总数 0");
});
