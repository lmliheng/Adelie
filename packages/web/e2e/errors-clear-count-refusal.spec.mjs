/**
 * 清空 refuses at its first step — the count its confirmation names — and the reason stays beside
 * the button that asked.
 *
 * The action is two requests: a read of the filtered set (whose `total` the dialog has to name,
 * because the delete is scoped to what the table shows and only that read can count it), then the
 * delete. When the read fails the dialog never opens, so the panel looks exactly as it did before
 * the press: the rows are still there, the button is still the retry, and the only thing that used
 * to say otherwise was a six-second notice (7.19's rule — a refusal belongs where the attempt was
 * made). This spec drives that read into a 500 and checks where the sentence lives: beside the
 * button, not in the notification region, and still there long after a notice would have gone.
 *
 * The error record is a real one the server wrote itself: the mock rejects the auth prompt with a
 * 401, which reaches `error_records` through the server's own recorder (see errors-ignore.spec).
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";

const REFUSAL = { code: "errors_store_closed", message: "errors store is closed" };
/** The notification region, where the reason must NOT be: it dismisses itself after six seconds. */
const notifications = (page) => page.getByRole("region", { name: "通知" });

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

function newSession(page, projectId) {
  return page.request
    .post(`${BASE}/api/projects/${projectId}/agents/default_agent/sessions`, {
      data: { provider: "custom", modelId: "claude-4-8" },
    })
    .then(async (res) => {
      expect(res.ok(), "create session").toBeTruthy();
      return (await res.json()).session.sessionId;
    });
}

/** One failed turn, then wait for the record the server's recorder writes on the side (see errors-ignore.spec). */
async function seedError(page, projectId, sessionId) {
  const res = await page.request.post(`${BASE}/api/sessions/${sessionId}/tasks`, {
    data: { input: [{ type: "text", text: "auth dead test" }] },
  });
  expect(res.status(), "start task").toBe(202);
  await expect
    .poll(
      async () => {
        const { messages } = await (
          await page.request.get(`${BASE}/api/sessions/${sessionId}/messages`)
        ).json();
        return messages.some(
          (m) => m.payload.type === "request_end" && m.payload.error_code === "auth",
        );
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  const read = async () => {
    const u = new URL(`${BASE}/api/projects/${projectId}/usage/errors`);
    u.searchParams.set("offset", "0");
    u.searchParams.set("limit", "50");
    return await (await page.request.get(u.toString())).json();
  };
  await expect
    .poll(async () => (await read()).items.length, {
      message: "the failed turn reaches the error table",
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
}

/**
 * Refuses the dialog's count read (`offset=0&limit=1`, the one `openClear` makes) and nothing else:
 * the panel's own load, the pager and the delete all read or write other URLs and must still land.
 */
async function refuseCountRead(page) {
  await page.route("**/api/projects/*/usage/errors**", async (route) => {
    const u = new URL(route.request().url());
    if (route.request().method() !== "GET" || u.searchParams.get("limit") !== "1") {
      return route.fallback();
    }
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
}

test("a refused count read keeps its reason beside the clear button, not in a notice", async ({
  page,
}) => {
  test.setTimeout(140_000);
  // A fresh account per run: the errors are the Project's, and a rerun on the same data root would
  // otherwise start from a table a previous run left full.
  const user = `clearrefuse_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const { projectId, sessionId } = await prepare(page, user);
  await seedError(page, projectId, sessionId);

  await page.goto("/usage");
  await expect(page.locator("tbody tr").first()).toBeVisible();

  const clearButton = page.getByRole("button", { name: "清空", exact: true });
  await expect(clearButton).toBeVisible();

  await refuseCountRead(page);
  await clearButton.click();

  // The reason is at the press, not in the six-second notice, and no dialog opened — the read it
  // would have been built from is what failed.
  const refusal = page.getByTestId("errors-clear-count-refusal");
  await expect(refusal).toBeVisible();
  await expect(refusal).toContainText(REFUSAL.message);
  await expect(refusal).toContainText("清空没有开始");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(notifications(page).getByRole("button")).toHaveCount(0);

  // Beside the button, on its row: to the right of it and vertically overlapping it.
  const buttonBox = await clearButton.boundingBox();
  const refusalBox = await refusal.boundingBox();
  expect(refusalBox.x).toBeGreaterThan(buttonBox.x + buttonBox.width);
  expect(refusalBox.y).toBeLessThan(buttonBox.y + buttonBox.height);
  expect(refusalBox.y + refusalBox.height).toBeGreaterThan(buttonBox.y);

  // Seven seconds later it is still there — the whole difference from the notice it used to be.
  await page.waitForTimeout(7000);
  await expect(refusal).toBeVisible();
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  // Nothing was deleted: the rows are exactly where they were.
  await expect(page.locator("tbody tr").first()).toBeVisible();

  // The same button, with the read let through, opens the dialog it was always meant to open —
  // and the sentence goes with the attempt that made it.
  await page.unroute("**/api/projects/*/usage/errors**");
  await clearButton.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("errors-clear-count-refusal")).toHaveCount(0);
  await expect(dialog).toContainText("错误记录");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
