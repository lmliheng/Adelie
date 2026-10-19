/**
 * Regression: the cost center's "清空" (clear errors) promises, in words, exactly the records it
 * is about to delete — and the delete must take exactly those.
 *
 * Two halves, both about ordering rather than layout:
 *
 * 1. **The number in the sentence is read when the action is clicked.** It used to be the
 *    dashboard's snapshot, taken before the page's own requests were answered — and loading the
 *    cost center records one of them (the shell's machine list answers 403 `admin_required`,
 *    an expected error). So a fresh load showed one record in the panel and then deleted two,
 *    while the dialog said one: the one failure a confirmation exists to prevent. The fix
 *    re-reads the filtered page when the action is clicked (the tests below drive a record that
 *    lands after the dashboard read, so the stale snapshot and the fresh count are provably
 *    different), and passes the newest instant of that read as `until`, so a record arriving
 *    between the two requests is kept rather than deleted unannounced.
 * 2. **The write happens before the dialog closes.** A refused delete keeps the dialog (and its
 *    sentence), says what the server said, and leaves the rows alone — only a successful one
 *    toasts, closes, and refreshes the table and the notice above it.
 *
 * The errors are the app's real ones: the mock rejects the auth prompt with 401 (`unexpected`)
 * and the quota prompt with 403 (also `unexpected`, a fatal turn), both reaching `error_records`
 * through the server's own recorder. Every number asserted here comes out of a response the page
 * itself received, so a rerun on a data root that is not fresh still holds.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";

/** The dashboard read the panel's numbers come from. */
const isDashboard = (r) => r.url().includes("/usage?") && r.request().method() === "GET";

/**
 * The confirmation's own count read: the first page of the error table, no `kind`. The badge
 * probe asks for the same endpoint with `kind=unexpected`, so the absence of that is the
 * difference between the two.
 */
const isCountRead = (r) => {
  if (!r.url().includes("/usage/errors?") || r.request().method() !== "GET") return false;
  const u = new URL(r.url());
  return u.searchParams.get("limit") === "1" && !u.searchParams.has("kind");
};

const isDelete = (r) => r.url().includes("/usage/errors") && r.request().method() === "DELETE";

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

/**
 * Reads the error table straight from the API, through the filter the dashboard itself asked
 * with — the panel's own range, not a copy of it, so a "7d" preset that is trailing for one
 * and calendar for the other can never make the two disagree.
 */
function counter(page) {
  let dashUrl = "";
  return {
    /** Feed it every response the page receives; the dashboard's own request is the filter. */
    observe(r) {
      if (isDashboard(r)) dashUrl = r.url();
    },
    async read() {
      expect(dashUrl, "the dashboard has been read").not.toBe("");
      const u = new URL(dashUrl);
      u.pathname = u.pathname.replace(/\/usage$/, "/usage/errors");
      u.searchParams.set("offset", "0");
      u.searchParams.set("limit", "50");
      const res = await page.request.get(u.toString());
      expect(res.ok(), "read errors").toBeTruthy();
      return await res.json();
    },
  };
}

test("the confirmation names the count it will delete, and the delete stops at that boundary", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { projectId, sessionId } = await prepare(page, "clearscope");

  // One error on the books before the shell loads.
  await failedTurn(page, sessionId, "auth dead test", "auth");

  let dashboards = 0;
  const seen = counter(page);
  page.on("response", (r) => {
    if (!isDashboard(r)) return;
    dashboards += 1;
    seen.observe(r);
  });
  const loaded = page.waitForResponse(isDashboard);
  await page.goto("/usage");
  const atLoad = await (await loaded).json();
  await expect(page.locator("tbody tr")).toHaveCount(atLoad.errors.recent.length);

  // Past the recorder's 2 s dedup window, a second surprise while the tab stays open: the
  // panel keeps rendering the load's snapshot — nothing has been refetched — while the API now
  // counts one more record. (Records, not rows: on a data root a previous run already touched,
  // this turn's error folds into an existing row of the same day, source, code and message.)
  await page.waitForTimeout(2_500);
  await failedTurn(page, await newSession(page, projectId), "quota fatal test", "rejected");
  expect(dashboards, "nothing reloaded the page between the load and the click").toBe(1);
  await expect(page.locator("tbody tr")).toHaveCount(atLoad.errors.recent.length);
  expect((await seen.read()).total).toBeGreaterThan(atLoad.errors.total);

  // Opening the confirmation reads the count itself: that answer, not the snapshot, is the
  // number the sentence names.
  // A bounded wait: without the read the dialog names the dashboard's snapshot, which is the
  // defect these lines exist for — say so in 15 s rather than at the test's 2-minute timeout.
  const counted = page.waitForResponse(isCountRead, { timeout: 15_000 });
  await page.getByRole("button", { name: "清空", exact: true }).click();
  const countedBody = await (await counted).json();
  expect(
    countedBody.total,
    "the fresh count must be wider than the stale snapshot",
  ).toBeGreaterThan(atLoad.errors.total);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`近 7 天内的 ${countedBody.total} 条错误记录`);
  expect(countedBody.items[0], "a non-empty page has a newest record").toBeTruthy();

  // Cancel: nothing leaves.
  const deletes = [];
  page.on("request", (r) => {
    // A request, not a response: `method()` sits on it, there is no `request()`.
    if (r.url().includes("/usage/errors") && r.method() === "DELETE") deletes.push(r.url());
  });
  await page.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  expect(deletes).toHaveLength(0);
  expect((await seen.read()).total).toBe(countedBody.total);

  // Confirm: the same count read again, and this time the delete carries its boundary.
  const recounted = page.waitForResponse(isCountRead, { timeout: 15_000 });
  await page.getByRole("button", { name: "清空", exact: true }).click();
  const recountedBody = await (await recounted).json();
  const reply = page.waitForResponse(isDelete);
  await dialog.getByRole("button", { name: "清空" }).click();
  const deleteResponse = await reply;
  const deleteUrl = new URL(deleteResponse.request().url());
  // The boundary is the newest record that read could see — not "now", and not the snapshot's.
  expect(deleteUrl.searchParams.get("until")).toBe(recountedBody.items[0].ts);
  const { deleted } = await deleteResponse.json();
  // The number in the sentence is the number that went — not the snapshot's, which was smaller.
  expect(deleted).toBe(recountedBody.total);
  await expect(page.getByText(`已删除 ${deleted} 条错误记录`)).toBeVisible();

  // And the table, the stats and the notice above it all catch up without a reload.
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await expect(page.getByText("暂无异常")).toBeVisible();
  await expect.poll(async () => (await seen.read()).total).toBe(0);
  await expect(page.getByText(/条未预期错误/)).toHaveCount(0);
});

test("a refused delete keeps the dialog and the rows, and a retry clears them", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { sessionId } = await prepare(page, "clearrefuse");

  await failedTurn(page, sessionId, "auth dead test", "auth");

  // The delete is refused at the network edge: the dialog must not close, the rows must stay,
  // and the user must be told what the server said. The pattern has to end with `*`: a request
  // URL carries its query string, so `…/usage/errors` alone matches none of them.
  await page.route("**/api/projects/*/usage/errors*", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "errors_store_closed", message: "errors store is closed" },
      }),
    });
  });
  const seen = counter(page);
  page.on("response", (r) => seen.observe(r));
  await page.goto("/usage");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  const before = await seen.read();
  expect(before.total).toBeGreaterThan(0);

  await page.getByRole("button", { name: "清空", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const sentence = await dialog.innerText();
  await dialog.getByRole("button", { name: "清空" }).click();

  await expect(page.getByText(/errors store is closed/)).toBeVisible();
  await expect(dialog).toBeVisible();
  // The sentence is still the one that was being confirmed: the refused write changed nothing.
  expect(await dialog.innerText()).toBe(sentence);
  await expect(page.getByText(/^已删除 \d+ 条错误记录$/)).toHaveCount(0);
  expect((await seen.read()).total).toBe(before.total);

  // Let the delete through: the retry closes the dialog, reports, and empties the table.
  await page.unroute("**/api/projects/*/usage/errors*");
  await dialog.getByRole("button", { name: "清空" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(/^已删除 \d+ 条错误记录$/)).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await expect.poll(async () => (await seen.read()).total).toBe(0);
});
