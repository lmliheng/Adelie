/**
 * Regression: a skill's "Export as zip" that the download refused leaves its reason under the row
 * that asked, instead of only in a notification that dismisses itself after six seconds.
 *
 * The export is a plain fetch of the installed directory (`archive-download.ts`): nothing is
 * written on the server and no client state moves, so a refusal leaves the row, the installed
 * skill and the same button on screen. That is exactly where the reason belongs (7.19's rule) —
 * before this, `exportSkill` answered with `toastError`, and a reader who looked away had no zip
 * file and nothing saying why.
 *
 * The skill is one the base ships with `default_agent` (read from the API, not spelled out here),
 * and the refused download is the page's own request as seen by `page.route` — both halves are the
 * page's contract with the server.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const AGENT = "default_agent";

/** The refused archive: its code's own localized sentence is what the row has to draw. */
const REFUSAL = { code: "internal", message: "the archive could not be read" };
/** S.errors.byCode.internal — the copy that code stands for in a zh-CN interface. */
const REASON = "服务器内部错误，请稍后重试。";

/**
 * Provision the user, give the Project a model (the onboarding overlay covers the page without
 * one), and return the first skill the Agent already has — the row under test — plus a reader for
 * the server's installed list, so "still installed" is checked on both sides.
 */
async function agentWithSkill(page, user) {
  await provisionAndLogin(page.request, user, P);
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
  const models = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
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
  expect(models.ok(), "put models").toBeTruthy();

  const installed = async () =>
    (
      await (
        await page.request.get(`${BASE}/api/projects/${projectId}/agents/${AGENT}/skills`)
      ).json()
    ).skills.map((s) => s.name);

  const names = await installed();
  expect(names.length, "default_agent ships skills to export").toBeGreaterThan(0);
  return { projectId, name: names[0], installed };
}

/**
 * Take over the archive download: every GET is kept in `seen`, and while `state.refuse` is set it
 * is answered with the server's refusal instead of reaching the real route.
 */
async function interceptExport(page, state) {
  await page.route("**/api/projects/*/agents/*/skills/*/archive", async (route) => {
    state.seen.push(new URL(route.request().url()).pathname.split("/").at(-2));
    if (!state.refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
}

/** The row's own export button (its accessible name is the verb plus the skill's name). */
const rowButton = (page, name) =>
  page.getByRole("button", { name: `打包导出 ${name}`, exact: true });

/** The reason line under that row. */
const refusalLine = (page) => page.getByTestId("export-refusal");

/** The notification region: a refusal must not be announced there (that is the old toast). */
const notifications = (page) => page.getByRole("region", { name: "通知" });

/** The row's line (everything but the reason): the only thing a refusal may change. */
const rowLine = (page, name) => rowButton(page, name).locator("xpath=../..").locator("div").first();

test("a refused export keeps its reason under the row, and nothing else changes", async ({
  page,
}) => {
  const { name, installed } = await agentWithSkill(page, "r212exportrefuse");
  const before = await installed();
  expect(before).toContain(name);

  const state = { seen: [], refuse: true };
  await interceptExport(page, state);

  await page.goto(`/agents/${AGENT}?tab=skills`);
  await expect(rowButton(page, name)).toBeVisible();
  const line = await rowLine(page, name).innerText();
  const rows = await page.getByRole("button", { name: /^打包导出 / }).count();
  await expect(refusalLine(page)).toHaveCount(0);

  await rowButton(page, name).click();

  // The reason is in the row that asked, and it is not a toast: the notification region holds no
  // dismissible button, and the row's own line reads exactly as it did before the attempt.
  await expect(refusalLine(page)).toHaveCount(1);
  await expect(refusalLine(page)).toHaveText(
    `技能 ${name} 没有导出成 zip，它仍然装在这个 Agent 上：${REASON}`,
  );
  expect(await rowLine(page, name).innerText()).toBe(line);
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.seen).toEqual([name]);

  // One row, one sentence: no other skill's row grew one.
  await expect(page.getByTestId("export-refusal")).toHaveCount(1);
  expect(await page.getByRole("button", { name: /^打包导出 / }).count()).toBe(rows);

  // Six seconds is where the old toast gave up; the sentence is still there.
  await page.waitForTimeout(7000);
  await expect(refusalLine(page)).toHaveCount(1);

  // Nothing was exported, and the installed copy was not touched.
  expect(await installed()).toEqual(before);
});

test("the retry after a refused export lands, and only a new attempt clears the reason", async ({
  page,
}) => {
  const { name, installed } = await agentWithSkill(page, "r212exportretry");

  const state = { seen: [], refuse: true };
  await interceptExport(page, state);

  await page.goto(`/agents/${AGENT}?tab=skills`);
  await expect(rowButton(page, name)).toBeVisible();
  await rowButton(page, name).click();
  await expect(refusalLine(page)).toHaveCount(1);
  expect(state.seen).toEqual([name]);

  // The retry is the same row; this time the archive really comes back: the sentence goes, and the
  // file is handed to the browser as a download.
  state.refuse = false;
  const download = page.waitForEvent("download");
  await rowButton(page, name).click();
  await expect(refusalLine(page)).toHaveCount(0);
  expect(state.seen).toEqual([name, name]);
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.zip$/);

  // A refused export changes neither side: the skill is still installed and still listed.
  expect(await installed()).toContain(name);
  await expect(rowButton(page, name)).toBeVisible();
});
