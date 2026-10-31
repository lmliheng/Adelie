/**
 * Regression: the Agent settings tab's 启用 / 停用 button says why a flip did not settle, under
 * that row's status badge, and the sentence outlives the six seconds a toast lives.
 *
 * That tab lists one Agent's tasks as a table with a text button per row (not the shared
 * `ScheduleRow`, whose switch gained this line first), and its toggle writes nothing
 * optimistically either — the row keeps the state the server has — so a refused flip used to
 * leave the table exactly as it was with the reason in a toast that dismissed itself: a button
 * that did not move and, six seconds later, no sentence saying why.
 *
 * The refusal is a real one the server answers — `schedule_not_found`, the task file gone (another
 * window deleted it between the list read and the flip) — taken over by a route so the test does
 * not race the store's own refetch. The app has its own sentence for that code, so the line on
 * screen is the localized one.
 *
 * Every test seeds through the API: a `startAt` in the future keeps the scheduler out of the way,
 * and the seed drops a leftover file of the same name first, since a rerun of this file alone
 * shares one data root with earlier runs.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const AGENT = "default_agent";

/** What the server answers when the task file is gone by the time the flip is written. */
const REFUSAL = { code: "schedule_not_found", message: "Schedule does not exist: tab_probe" };
/** The line the row draws: the shared lead-in plus the app's own sentence for that code. */
const REFUSED_LINE = "操作被拒绝：该定时任务已不存在。";

/**
 * Provision the user, give the Project a model (the onboarding overlay covers the page without
 * one), and seed one armed future task per name.
 */
async function projectWithTasks(page, user, names) {
  await provisionAndLogin(page.request, user, P);
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
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
        },
      ],
    },
  });
  expect(put.ok(), "put models").toBeTruthy();

  const base = `${BASE}/api/projects/${projectId}/agents/${AGENT}/schedules`;
  for (const name of names) {
    await page.request.delete(`${base}/${name}`);
    const created = await page.request.post(base, {
      data: {
        name,
        prompt: "tab toggle refusal probe",
        enabled: true,
        startAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    expect(created.status(), `seed ${name}`).toBe(201);
  }

  /** The Project's list as the server holds it: what the table reads. */
  const listed = async () =>
    (await (await page.request.get(`${BASE}/api/projects/${projectId}/schedules`)).json())
      .schedules;
  return { projectId, listed };
}

/** Refuse every schedule write with the "the file is gone" answer; the flips that reach it are counted. */
async function refuseFlips(page, seen) {
  let refuse = true;
  await page.route("**/api/projects/*/agents/*/schedules/*", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    seen.push(route.request().url());
    if (!refuse) return route.fallback();
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
  return () => {
    refuse = false;
  };
}

/** One task's row in the settings tab's table (a `tr`, unlike the two list surfaces' `li`). */
function rowOf(page, name) {
  return page.locator("main").locator("tr").filter({ hasText: name });
}

/** The row's status cell: the one column that draws the badge, and the refusal under it. */
function statusCell(row) {
  return row.locator("td").nth(1);
}

test("a refused flip on the Agent settings tab keeps the reason under that row, and only that row", async ({
  page,
}) => {
  const { listed } = await projectWithTasks(page, "r170page", ["tab_probe", "tab_quiet"]);
  const before = await listed();

  await page.goto(`/agents/${AGENT}?tab=schedules`);
  const row = rowOf(page, "tab_probe");
  await expect(row).toBeVisible();
  const other = rowOf(page, "tab_quiet");
  await expect(other).toBeVisible();

  const flips = [];
  await refuseFlips(page, flips);
  await row.getByRole("button", { name: "停用", exact: true }).click();

  // The reason is in the row that asked, under its badge, and it is not a toast: the notification
  // region holds no dismissible button, and the neighbouring row says nothing.
  await expect(statusCell(row).getByRole("alert")).toHaveText(REFUSED_LINE);
  await expect(statusCell(row)).toContainText("生效");
  await expect(row.getByRole("alert")).toHaveCount(1);
  await expect(other.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  expect(flips).toHaveLength(1);

  // The button did not move, because the task did not: it is still armed on the server.
  await expect(row.getByRole("button", { name: "停用", exact: true })).toBeVisible();
  const armed = (await listed()).find((s) => s.name === "tab_probe");
  expect(armed?.enabled).toBe(true);
  expect((await listed()).length).toBe(before.length);

  // Six seconds is how long a toast lives; this line has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(statusCell(row).getByRole("alert")).toHaveText(REFUSED_LINE);
});

test("the next flip clears the line, and a flip that lands moves the button and the badge", async ({
  page,
}) => {
  const { listed } = await projectWithTasks(page, "r170retry", ["tab_retry"]);

  await page.goto(`/agents/${AGENT}?tab=schedules`);
  const row = rowOf(page, "tab_retry");
  await expect(row).toBeVisible();

  const flips = [];
  const letThrough = await refuseFlips(page, flips);
  await row.getByRole("button", { name: "停用", exact: true }).click();
  await expect(statusCell(row).getByRole("alert")).toHaveText(REFUSED_LINE);

  // Same button, second click: this time the write lands, so the sentence goes and the row moves
  // to the position the server now has — the button's name with it (停用 → 启用) and the badge
  // (生效 → 停用).
  letThrough();
  await row.getByRole("button", { name: "停用", exact: true }).click();
  await expect(row.getByRole("alert")).toHaveCount(0);
  await expect(row.getByRole("button", { name: "启用", exact: true })).toBeVisible();
  await expect(statusCell(row)).toContainText("停用");
  expect(flips).toHaveLength(2);
  expect((await listed()).find((s) => s.name === "tab_retry")?.enabled).toBe(false);
});
