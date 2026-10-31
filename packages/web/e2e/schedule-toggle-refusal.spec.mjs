/**
 * Regression: the enable switch of a scheduled task says why a flip did not settle, under that
 * row, and the sentence outlives the six seconds a toast lives.
 *
 * The switch writes nothing optimistically — it keeps the position the server has — so a refused
 * flip used to leave no trace on the screen at all: the reason arrived as a toast, dismissed
 * itself, and a reader who looked away was left with a switch that would not move and one
 * sentence they never got to read. Both surfaces that list tasks with the shared row (the
 * scheduled-tasks page and the chat dock's panel) now keep it under the row the flip named
 * (`role="alert"`), until the next flip.
 *
 * The refusal is a real one the server can answer — `schedule_not_found`, the task file gone
 * (another window deleted it between the list read and the flip) — taken over by a route so the
 * test does not have to race the store's own refetch. The app has its own sentence for that
 * code, so the line on screen is the localized one, not the server's English.
 *
 * Every test seeds through the API: a `startAt` in the future keeps the scheduler out of the
 * way, and the seed drops a leftover file of the same name first, since a rerun of this file
 * alone shares one data root with earlier runs.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const AGENT = "default_agent";

/** What the server answers when the task file is gone by the time the flip is written. */
const REFUSAL = { code: "schedule_not_found", message: "Schedule does not exist: toggle_probe" };
/** The line the row draws: the shared lead-in plus the app's own sentence for that code. */
const REFUSED_LINE = "操作被拒绝：该定时任务已不存在。";

/**
 * Provision the user, give the Project a model (the onboarding overlay covers the page without
 * one), and seed one future task per name. `bindSession` also creates the Session the dock's
 * panel lists tasks of, and pins every task to it.
 */
async function projectWithTasks(page, user, names, options = {}) {
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

  let sessionId;
  if (options.bindSession === true) {
    const created = await page.request.post(
      `${BASE}/api/projects/${projectId}/agents/${AGENT}/sessions`,
      { data: { provider: "custom", modelId: "claude-4-8", approvalMode: "allow-all" } },
    );
    expect(created.ok(), "create session").toBeTruthy();
    sessionId = (await created.json()).session.sessionId;
  }

  const base = `${BASE}/api/projects/${projectId}/agents/${AGENT}/schedules`;
  for (const name of names) {
    await page.request.delete(`${base}/${name}`);
    const created = await page.request.post(base, {
      data: {
        name,
        prompt: "toggle refusal probe",
        enabled: true,
        startAt: new Date(Date.now() + 86_400_000).toISOString(),
        ...(sessionId === undefined ? {} : { sessionId }),
      },
    });
    expect(created.status(), `seed ${name}`).toBe(201);
  }

  /** The Project's list as the server holds it: what the page and the panel both read. */
  const listed = async () =>
    (await (await page.request.get(`${BASE}/api/projects/${projectId}/schedules`)).json())
      .schedules;
  return { projectId, sessionId, listed };
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

/** The row of one task on whichever surface lists it (both wrap it in an `li`). */
function rowOf(scope, name) {
  return scope.locator("li").filter({ hasText: name });
}

/** The row's enable switch, named by what its flip would do (the task is seeded armed, so: 停用). */
function switchOf(row) {
  return row.getByRole("switch", { name: "停用" });
}

/**
 * The row's switch by role alone: its accessible name IS what the flip would do, so the name
 * changes with the position and a locator bound to one of them stops resolving after a write.
 */
function anySwitch(row) {
  return row.getByRole("switch");
}

test("a refused flip on the schedules page leaves the reason under that row, and only that row", async ({
  page,
}) => {
  const { listed } = await projectWithTasks(page, "r169page", ["toggle_probe", "quiet_probe"]);
  const before = await listed();

  await page.goto("/schedules");
  const row = rowOf(page.locator("main"), "toggle_probe");
  await expect(row).toBeVisible();
  const other = rowOf(page.locator("main"), "quiet_probe");
  await expect(other).toBeVisible();

  const flips = [];
  await refuseFlips(page, flips);
  await switchOf(row).click();

  // The reason is in the row that asked, and it is not a toast: the notification region holds no
  // dismissible button, and the neighbouring row says nothing.
  await expect(row.getByRole("alert")).toHaveText(REFUSED_LINE);
  await expect(other.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  expect(flips).toHaveLength(1);

  // The switch kept the position the server still has, and the task is still armed there.
  await expect(switchOf(row)).toBeChecked();
  const armed = (await listed()).find((s) => s.name === "toggle_probe");
  expect(armed?.enabled).toBe(true);
  expect((await listed()).length).toBe(before.length);

  // Six seconds is how long a toast lives; this line has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(row.getByRole("alert")).toHaveText(REFUSED_LINE);
});

test("the next flip clears the line, and a flip that lands moves the switch", async ({ page }) => {
  const { listed } = await projectWithTasks(page, "r169retry", ["retry_probe"]);

  await page.goto("/schedules");
  const row = rowOf(page.locator("main"), "retry_probe");
  await expect(row).toBeVisible();

  const flips = [];
  const letThrough = await refuseFlips(page, flips);
  await switchOf(row).click();
  await expect(row.getByRole("alert")).toHaveText(REFUSED_LINE);
  await expect(anySwitch(row)).toBeChecked();

  // Same switch, second click: this time the write lands, so the sentence goes and the switch
  // moves to the position the server now has — its name along with it (停用 → 启用).
  letThrough();
  await switchOf(row).click();
  await expect(row.getByRole("alert")).toHaveCount(0);
  await expect(anySwitch(row)).not.toBeChecked();
  await expect(row.getByRole("switch", { name: "启用" })).toBeVisible();
  expect(flips).toHaveLength(2);
  expect((await listed()).find((s) => s.name === "retry_probe")?.enabled).toBe(false);
});

test("a refused flip in the chat dock's panel keeps the reason under its row too", async ({
  page,
}) => {
  const { sessionId } = await projectWithTasks(page, "r169panel", ["panel_probe"], {
    bindSession: true,
  });

  await page.goto(`/chat/${sessionId}`);
  await page.getByTestId("dock-toggle-right").click();
  const panel = page.locator('[data-testid="dock"][data-open="true"]');
  await panel.getByTestId("dock-pick-schedules").click();
  const row = rowOf(panel, "panel_probe");
  await expect(row).toBeVisible();

  const flips = [];
  await refuseFlips(page, flips);
  await switchOf(row).click();

  await expect(row.getByRole("alert")).toHaveText(REFUSED_LINE);
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  expect(flips).toHaveLength(1);
  await expect(switchOf(row)).toBeChecked();
  await page.waitForTimeout(7_000);
  await expect(row.getByRole("alert")).toHaveText(REFUSED_LINE);
});
