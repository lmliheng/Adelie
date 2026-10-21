/**
 * Regression: deleting a scheduled task asks first, and a refused delete keeps that question —
 * with the server's words inside it — instead of closing on the way out of the request.
 *
 * The three surfaces that list tasks (the Project page, the chat dock's panel, the Agent
 * settings tab) share the rows (`ScheduleRow`) and the confirmation, and all three used to
 * close it from a `finally`: the row was still there — nothing was deleted — but the reason
 * arrived as a toast that dismissed itself after six seconds and sat over the card rather than
 * in it. The dialog now closes only once the write landed, and a refusal leaves the card open
 * with the refusal drawn under its sentence (`ConfirmModal`'s `refusal` slot), so the retry is
 * the same button.
 *
 * Both page tests work on a task seeded through the API (a `startAt` in the future, so the
 * scheduler never touches it while the test runs). The seed drops a leftover file of the same
 * name first: a rerun of this file alone shares one data root with earlier runs.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const AGENT = "default_agent";

/** The delete call both surfaces make; a 500 with its own words proves the reason came back. */
const REFUSAL = { code: "schedule_store_closed", message: "schedule store is closed" };

/** Provision the user, give the Project a model (the onboarding overlay covers the page without one), and seed one task. */
async function projectWithTask(page, user, name, options = {}) {
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

  // The panel only lists tasks bound to the conversation on screen, so that surface seeds a
  // Session first and pins the task to it.
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
  await page.request.delete(`${base}/${name}`);
  const created = await page.request.post(base, {
    data: {
      name,
      prompt: "delete refusal probe",
      enabled: true,
      startAt: new Date(Date.now() + 86_400_000).toISOString(),
      ...(sessionId === undefined ? {} : { sessionId }),
    },
  });
  expect(created.status(), "seed the task").toBe(201);

  /** The Project's list as the server holds it: what the page and the panel both read. */
  const listed = async () =>
    (await (await page.request.get(`${BASE}/api/projects/${projectId}/schedules`)).json())
      .schedules;
  return { projectId, sessionId, listed };
}

/** Refuse every delete with a code the app has no local copy for, so the server's words show. */
async function refuseDeletes(page, seen) {
  await page.route("**/api/projects/*/agents/*/schedules/*", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    seen.push(route.request().url());
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
}

/** The row's overflow menu → 删除, on whichever surface lists it. */
async function openDeleteDialog(scope) {
  await scope.getByRole("button", { name: "更多操作" }).first().click();
  await scope.page().getByRole("menuitem", { name: "删除", exact: true }).click();
  const dialog = scope.page().getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * The card's own text with the refusal line dropped: a refused write adds one line under the
 * sentence ("操作被拒绝：…"), and that line is the only thing the refusal may change.
 */
async function cardText(card) {
  return (await card.innerText()).replace(/\n操作被拒绝：[^\n]*/, "");
}

test("a refused delete on the schedules page keeps the card, its sentence and the row", async ({
  page,
}) => {
  const { listed } = await projectWithTask(page, "r98page1", "refuse_probe");
  const before = await listed();

  await page.goto("/schedules");
  const row = page.getByText("refuse_probe", { exact: true });
  await expect(row).toBeVisible();
  const dialog = await openDeleteDialog(page.locator("main"));
  const sentence = await dialog.innerText();
  expect(sentence).toContain("refuse_probe");

  const deletes = [];
  await refuseDeletes(page, deletes);
  await dialog.getByRole("button", { name: "确认" }).click();

  // The reason is in the card that asked, and it is not a toast: the notification region holds
  // no dismissible button, and the card reads exactly as it did before the attempt plus the one
  // refusal line.
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  expect(deletes).toHaveLength(1);
  await expect(dialog).toBeVisible();
  expect(await cardText(dialog)).toBe(sentence);

  // Nothing was deleted anywhere: the row is still on the page and the file is still on the server.
  await expect(row).toBeVisible();
  expect((await listed()).length).toBe(before.length);

  // Closing the card decides nothing.
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row).toBeVisible();
});

test("the retry after a refused delete writes it, and only a written one closes the card", async ({
  page,
}) => {
  const { listed } = await projectWithTask(page, "r98page2", "retry_probe");

  const deletes = [];
  let refuse = true;
  await page.route("**/api/projects/*/agents/*/schedules/*", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    deletes.push(route.request().url());
    if (!refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  await page.goto("/schedules");
  const row = page.getByText("retry_probe", { exact: true });
  await expect(row).toBeVisible();
  const dialog = await openDeleteDialog(page.locator("main"));
  await dialog.getByRole("button", { name: "确认" }).click();
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(deletes).toHaveLength(1);

  // The retry is the same card, and this time the write lands: card gone, row gone, file gone.
  refuse = false;
  await dialog.getByRole("button", { name: "确认" }).click();
  await expect(dialog).toHaveCount(0);
  expect(deletes).toHaveLength(2);
  await expect(row).toHaveCount(0);
  expect((await listed()).some((s) => s.name === "retry_probe")).toBe(false);
});

test("a refused delete in the chat dock's panel keeps the card with the reason too", async ({
  page,
}) => {
  const { sessionId } = await projectWithTask(page, "r98panel", "panel_probe", {
    bindSession: true,
  });

  await page.goto(`/chat/${sessionId}`);
  await page.getByTestId("dock-toggle-right").click();
  const panel = page.locator('[data-testid="dock"][data-open="true"]');
  await panel.getByTestId("dock-pick-schedules").click();
  await expect(panel.getByText("panel_probe", { exact: true })).toBeVisible();

  const dialog = await openDeleteDialog(panel);
  const deletes = [];
  await refuseDeletes(page, deletes);
  await dialog.getByRole("button", { name: "确认" }).click();
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(panel.getByText("panel_probe", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
});

test("a refused delete on the Agent settings tab keeps the card with the reason too", async ({
  page,
}) => {
  const { listed } = await projectWithTask(page, "r98tab", "tab_probe");
  await page.goto(`/agents/${AGENT}?tab=schedules`);

  await expect(page.getByText("tab_probe", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "删除", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const deletes = [];
  await refuseDeletes(page, deletes);
  await dialog.getByRole("button", { name: "确认" }).click();
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(deletes).toHaveLength(1);
  await expect(page.getByText("tab_probe", { exact: true })).toBeVisible();
  expect((await listed()).some((s) => s.name === "tab_probe")).toBe(true);
});
