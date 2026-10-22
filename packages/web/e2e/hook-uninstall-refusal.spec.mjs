/**
 * Regression: uninstalling a hook package on the Agent's Hooks tab asks first, and a refused
 * uninstall keeps that question — with the server's words inside it — instead of closing on the
 * way out of the request.
 *
 * `confirmRemove` used to close the card in `finally`, whatever the answer: when the DELETE was
 * refused, the package was still installed on the page and on disk, yet the reason arrived as a
 * toast that dismissed itself after six seconds and sat above the card. The card now closes only
 * once the uninstall landed; a refusal leaves it open with the reason drawn under its sentence
 * (`ConfirmModal`'s `refusal` slot), so the retry is the same button.
 *
 * The package is one the base installs on a fresh Agent (read from the API, not spelled out
 * here), and the refused DELETE is the page's own request as seen by `page.route` — both halves
 * are the page's contract with the server.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const AGENT = "default_agent";

/** The refused uninstall: its own words prove the reason came back into the card. */
const REFUSAL = {
  code: "agent_state_read_only",
  message: "agent state is read-only",
};

/**
 * Provision the user, give the Project a model (the onboarding overlay covers the page without
 * one), and return the first hook package the Agent already has — the row under test — plus a
 * reader for the server's installed list, so "still installed" is checked on both sides.
 */
async function agentWithHook(page, user) {
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
        await page.request.get(`${BASE}/api/projects/${projectId}/agents/${AGENT}/hooks`)
      ).json()
    ).hooks.map((h) => h.name);

  const names = await installed();
  expect(names.length, "a fresh Agent ships hook packages to uninstall").toBeGreaterThan(0);
  return { projectId, name: names[0], installed };
}

/**
 * Take over the uninstall: every DELETE is kept in `seen`, and while `state.refuse` is set it is
 * answered with the server's refusal instead of reaching the real route.
 */
async function interceptUninstall(page, state) {
  await page.route("**/api/projects/*/agents/*/hooks/*", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    state.seen.push(new URL(route.request().url()).pathname.split("/").pop());
    if (!state.refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
}

/** The row's own uninstall button (its accessible name is the verb plus the package's name). */
const rowButton = (page, name) => page.getByRole("button", { name: `卸载 ${name}`, exact: true });

/** The row's button, then the shared confirmation (named by its own title). */
async function askRemove(page, name) {
  await rowButton(page, name).click();
  const dialog = page.getByRole("dialog", { name: `卸载 ${name}` });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The card's own text with the refusal line dropped — the only thing a refusal may change. */
async function cardText(card) {
  return (await card.innerText()).replace(/\n操作被拒绝：[^\n]*/, "");
}

/** The notification region: a refusal must not be announced there (that is the old toast). */
const notifications = (page) => page.getByRole("region", { name: "通知" });

test("a refused uninstall keeps the card, its sentence and the package", async ({ page }) => {
  const { name, installed } = await agentWithHook(page, "r110hookrefuse");
  const before = await installed();
  expect(before).toContain(name);

  const state = { seen: [], refuse: true };
  await interceptUninstall(page, state);

  await page.goto(`/agents/${AGENT}?tab=hooks`);
  await expect(rowButton(page, name)).toBeVisible();
  const dialog = await askRemove(page, name);
  const sentence = await cardText(dialog);
  expect(sentence).toContain(name);

  await dialog.getByRole("button", { name: "确认" }).click();

  // The reason is in the card that asked, and it is not a toast: the notification region holds
  // no dismissible button, and the card reads exactly as it did before the attempt plus one line.
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.seen).toEqual([name]);
  await expect(dialog).toBeVisible();
  expect(await cardText(dialog)).toBe(sentence);

  // Nothing was uninstalled anywhere: the row is still on the page and still installed on disk.
  await expect(rowButton(page, name)).toBeVisible();
  expect(await installed()).toEqual(before);

  // Closing the card decides nothing, and opening it again does not carry the old reason over.
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  const reopened = await askRemove(page, name);
  await expect(reopened.getByText(REFUSAL.message)).toHaveCount(0);
});

test("the retry after a refused uninstall writes it, and only a written one closes the card", async ({
  page,
}) => {
  const { name, installed } = await agentWithHook(page, "r110hookretry");

  const state = { seen: [], refuse: true };
  await interceptUninstall(page, state);

  await page.goto(`/agents/${AGENT}?tab=hooks`);
  await expect(rowButton(page, name)).toBeVisible();
  const dialog = await askRemove(page, name);
  await dialog.getByRole("button", { name: "确认" }).click();
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(state.seen).toEqual([name]);

  // The retry is the same card; this time the uninstall lands: card gone, row gone, list without it.
  state.refuse = false;
  await dialog.getByRole("button", { name: "确认" }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.seen).toEqual([name, name]);
  await expect(rowButton(page, name)).toHaveCount(0);
  expect(await installed()).not.toContain(name);
});
