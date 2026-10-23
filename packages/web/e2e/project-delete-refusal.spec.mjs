/**
 * Regression: deleting a Project from its settings dialog asks first, and a refused delete
 * keeps that question — with the server's words inside it — instead of leaving only a toast.
 *
 * The delete used to close on the way out of the request's `catch`: the Project was still
 * there (nothing was deleted), but the reason arrived as a toast that dismissed itself after
 * six seconds and sat over the card rather than in it. The card now closes only once the
 * delete landed; a refusal leaves it open with the refusal drawn under its sentence
 * (`ConfirmModal`'s `refusal` slot), so the retry is the same button.
 *
 * Both tests work on a Project created through the API: the delete row is hidden for
 * `default_project` and for an account's last Project, so the probe account needs a second
 * one. The seed tolerates a leftover probe Project from an earlier run of this same file.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const PROJ = "删除探针";

/** The delete call the page makes; a 500 with its own words proves the reason came back. */
const REFUSAL = { code: "project_store_locked", message: "project store is locked" };

/**
 * Provision the user, make sure a second Project exists (so the delete row is offered) with
 * model credentials on both (otherwise the onboarding overlay covers the page), and land on
 * that Project with its settings dialog open.
 *
 * Returns the probe Project's id and a reader for the Projects the server holds.
 */
async function openSettingsOnProbe(page, user) {
  await provisionAndLogin(page.request, user, P);
  const projects = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects;
  const initial = projects[0];
  const projectId = `${user}-probe`;
  if (!projects.some((p) => p.projectId === projectId)) {
    const created = await page.request.post(`${BASE}/api/projects`, {
      data: { projectId, name: PROJ },
    });
    expect(created.status(), "create probe project").toBe(201);
  }
  for (const id of [initial.projectId, projectId]) {
    const put = await page.request.put(`${BASE}/api/projects/${id}/models`, {
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
    expect(put.ok(), `put models ${id}`).toBeTruthy();
  }

  await page.goto("/");
  // Wait for the initial Project's sidebar to settle before touching the switcher: it is
  // fetching the Agent list, and a re-render midway would close the dropdown.
  const draftTitle = page.getByRole("heading", { name: "Adelie" });
  await expect(page.getByText("General Agent").first()).toBeVisible();
  await expect(draftTitle).toBeVisible();

  // Switch to the probe Project through the switcher (its own id, so the normal switch path).
  await page.getByRole("button", { name: user }).first().click();
  await page.getByRole("button", { name: PROJ }).first().click();
  await expect(draftTitle).toBeVisible();

  // Then its settings: the switcher's trigger now shows the probe Project's name, and the
  // gear row behind it opens the dialog on the General tab. The switcher's rows are plain
  // buttons, not `role="menu"` items (they are named like its trigger), so the gear row is
  // reached as a button too.
  await page.getByRole("button", { name: PROJ }).first().click();
  await page.getByRole("button", { name: "项目设置", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "项目设置" });
  await expect(settings).toBeVisible();

  const listed = async () =>
    (await (await page.request.get(`${BASE}/api/projects`)).json()).projects;
  return { projectId, settings, listed };
}

/** The delete row's button → the confirmation card (a second dialog, stacked above settings). */
async function openDeleteCard(settings) {
  await settings.getByRole("button", { name: "删除", exact: true }).click();
  const card = settings.page().getByRole("dialog", { name: "删除项目" });
  await expect(card).toBeVisible();
  return card;
}

/** Refuse every Delete of the probe Project with a code the app has no local copy for. */
async function refuseDelete(page, projectId, seen) {
  await page.route(`**/api/projects/${projectId}`, async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    seen.push(route.request().url());
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
}

/**
 * The card's own text with the refusal line dropped: a refused write adds one line under the
 * sentence ("操作被拒绝：…"), and that line is the only thing the refusal may change.
 */
async function cardText(card) {
  return (await card.innerText()).replace(/\n操作被拒绝：[^\n]*/, "");
}

test("a refused delete keeps the card, its sentence and the Project", async ({ page }) => {
  const { projectId, settings, listed } = await openSettingsOnProbe(page, "r119del1");
  const before = await listed();

  const card = await openDeleteCard(settings);
  const sentence = await card.innerText();
  expect(sentence).toContain("确认删除该项目");

  const deletes = [];
  await refuseDelete(page, projectId, deletes);
  await card.getByRole("button", { name: "确认" }).click();

  // The reason is in the card that asked, and it is not a toast: the notification region
  // holds no dismissible button, and the card reads exactly as before plus the one line.
  await expect(card.getByText(REFUSAL.message)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  expect(deletes).toHaveLength(1);
  await expect(card).toBeVisible();
  expect(await cardText(card)).toBe(sentence);

  // Nothing was deleted: the Project is still on the server, and the settings dialog behind
  // the card still describes it.
  expect((await listed()).some((p) => p.projectId === projectId)).toBe(true);
  expect((await listed()).length).toBe(before.length);
  await expect(settings).toBeVisible();

  // Closing the card decides nothing, and reopening it does not carry the old reason.
  await card.getByRole("button", { name: "取消" }).click();
  await expect(card).toHaveCount(0);
  const again = await openDeleteCard(settings);
  await expect(again.getByText(REFUSAL.message)).toHaveCount(0);
  expect(await again.innerText()).toBe(sentence);
});

test("the retry after a refused delete writes it, and only a written one closes the card", async ({
  page,
}) => {
  const { projectId, settings, listed } = await openSettingsOnProbe(page, "r119del2");

  const deletes = [];
  let refuse = true;
  await page.route(`**/api/projects/${projectId}`, async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    deletes.push(route.request().url());
    if (!refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  const card = await openDeleteCard(settings);
  await card.getByRole("button", { name: "确认" }).click();
  await expect(card.getByText(REFUSAL.message)).toBeVisible();
  await expect(card).toBeVisible();
  expect(deletes).toHaveLength(1);
  expect((await listed()).some((p) => p.projectId === projectId)).toBe(true);

  // The retry is the same card, and this time the write lands: card gone, settings dialog
  // gone with it, Project gone from the server and from the switcher.
  refuse = false;
  await card.getByRole("button", { name: "确认" }).click();
  await expect(card).toHaveCount(0);
  expect(deletes).toHaveLength(2);
  await expect(settings).toHaveCount(0);
  expect((await listed()).some((p) => p.projectId === projectId)).toBe(false);
  await expect(page.getByRole("button", { name: PROJ })).toHaveCount(0);
});
