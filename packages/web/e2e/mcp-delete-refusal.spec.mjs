/**
 * Regression: removing an MCP Server asks first, and a refused removal keeps that question —
 * with the server's words inside it — instead of closing on the way out of the request.
 *
 * The Tools tab's MCP block persists the whole list through one PUT, so "delete one row" is
 * that PUT without the row. The confirmation used to close unconditionally after the write
 * returned: when the write was refused, the list was exactly as it was — on the page and on
 * the server — yet the reason arrived as a toast that dismissed itself after six seconds and
 * sat above the card. The card now closes only once the write landed, and a refusal leaves it
 * open with the reason drawn under its sentence (`ConfirmModal`'s `refusal` slot), so the retry
 * is the same button.
 *
 * The row is seeded through the API (a valid http entry, nothing is connected until a Session
 * starts), and the refused write is the page's own PUT as seen by `page.route` — both halves
 * are the page's contract with the server.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const AGENT = "default_agent";

/** The row under test (its name also scopes the server-side check). */
const NAME = "probe-mcp";

/** The refused save: a 500 with its own words proves the reason came back to the card. */
const REFUSAL = { code: "agent_config_read_only", message: "agent config is read-only" };

/**
 * Provision the user, give the Project a model (the onboarding overlay covers the page without
 * one), and put one MCP server on the Agent. The `PUT` replaces the whole list, so a rerun of
 * this file alone shares one data root with earlier runs without accumulating probe rows.
 */
async function projectWithServer(page, user) {
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

  const seeded = await putServers(page, projectId, [
    { name: NAME, config: { url: "https://example.com/mcp" } },
  ]);
  expect(seeded.ok(), "seed the MCP server").toBeTruthy();

  /** The Agent's list as the server holds it: what the page reads and writes back. */
  const listed = async () => serversOf(await readConfig(page, projectId));
  return { projectId, listed };
}

/** The config write the page makes for every MCP edit (whole list, vault-style). */
const putServers = (page, projectId, mcpServers) =>
  page.request.put(`${BASE}/api/projects/${projectId}/agents/${AGENT}/config`, {
    data: { config: { mcpServers } },
  });

const readConfig = async (page, projectId) =>
  (await page.request.get(`${BASE}/api/projects/${projectId}/agents/${AGENT}/config`)).json();

const serversOf = (config) => (config.config?.mcpServers ?? []).map((s) => s.name);

/**
 * Take over the config write: every PUT is kept in `seen`, and while `state.refuse` is set it
 * is answered with the server's refusal instead of reaching the real route.
 */
async function interceptConfigPut(page, state) {
  await page.route("**/api/projects/*/agents/*/config", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    state.seen.push(route.request().postDataJSON());
    if (!state.refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
}

/** The seeded row: the only place the page writes the probe's name. */
const row = (page) => page.getByRole("row", { name: new RegExp(NAME) });

/** The row's Remove button, then the shared confirmation (named by its own title). */
async function askRemove(page) {
  await row(page).getByRole("button", { name: "删除", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "删除 MCP Server" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The card's own text with the refusal line dropped — the only thing a refusal may change. */
async function cardText(card) {
  return (await card.innerText()).replace(/\n操作被拒绝：[^\n]*/, "");
}

/** The notification region: a refusal must not be announced there (that is the old toast). */
const notifications = (page) => page.getByRole("region", { name: "通知" });

test("a refused removal keeps the card, its sentence and the row", async ({ page }) => {
  const { listed } = await projectWithServer(page, "r108refuse");
  const before = await listed();
  expect(before).toContain(NAME);

  const state = { seen: [], refuse: true };
  await interceptConfigPut(page, state);

  await page.goto(`/agents/${AGENT}?tab=tools`);
  await expect(row(page)).toBeVisible();
  const dialog = await askRemove(page);
  const sentence = await cardText(dialog);
  expect(sentence).toContain(NAME);

  await dialog.getByRole("button", { name: "确认" }).click();

  // The reason is in the card that asked, and it is not a toast: the notification region holds
  // no dismissible button, and the card reads exactly as it did before the attempt plus one line.
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.seen).toHaveLength(1);
  await expect(dialog).toBeVisible();
  expect(await cardText(dialog)).toBe(sentence);

  // Nothing was removed anywhere: the row is still on the page and still in the server's list.
  await expect(row(page)).toBeVisible();
  expect(await listed()).toEqual(before);

  // Closing the card decides nothing, and opening it again does not carry the old reason over.
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  const reopened = await askRemove(page);
  await expect(reopened.getByText(REFUSAL.message)).toHaveCount(0);
});

test("the retry after a refused removal writes it, and only a written one closes the card", async ({
  page,
}) => {
  const { listed } = await projectWithServer(page, "r108retry");

  const state = { seen: [], refuse: true };
  await interceptConfigPut(page, state);

  await page.goto(`/agents/${AGENT}?tab=tools`);
  await expect(row(page)).toBeVisible();
  const dialog = await askRemove(page);
  await dialog.getByRole("button", { name: "确认" }).click();
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(state.seen).toHaveLength(1);

  // The retry is the same card; this time the write lands: card gone, row gone, list without it.
  state.refuse = false;
  await dialog.getByRole("button", { name: "确认" }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.seen).toHaveLength(2);
  // The write the card sent is the list without the row — not an empty list wholesale.
  expect(state.seen[1].config.mcpServers).toEqual([]);
  await expect(row(page)).toHaveCount(0);
  expect(await listed()).not.toContain(NAME);
});
