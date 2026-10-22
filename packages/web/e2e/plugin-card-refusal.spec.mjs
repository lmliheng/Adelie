/**
 * Regression: a plugin card's three confirmations — uninstall a copy from one Agent, update the
 * copies that are behind the library, delete the plugin from disk — ask first, and a write the
 * server refused keeps that question, with the server's words inside it, instead of closing on
 * the way out of the request.
 *
 * All three used to settle on the request rather than on the answer (`confirmUninstall` and
 * `confirmDelete` closed the card before the write went out, `confirmUpdate` in sequence with
 * it): when the server refused, the installed files and the plugin's directory were exactly as
 * they were, yet the reason arrived as a toast that dismissed itself after six seconds and sat
 * above the card. Each card now closes only once the write landed; a refusal leaves it open with
 * the reason drawn under its sentence (`ConfirmModal`'s `refusal` slot), so the retry is the same
 * button.
 *
 * The library listing is stubbed: a development data root ships no user plugin, and the delete
 * (admin-only) needs one. The writes the tests measure are the page's own requests — DELETE /api/
 * plugins/:name, DELETE …/skills/:name and POST …/plugins — while everything else stays real.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const AGENT = "default_agent";

/** The plugin under test: a user plugin, so its card carries the admin's delete. */
const PLUGIN = {
  source: "user",
  name: "probe-plugin",
  description: "A probe plugin.",
  descriptionZh: "一个探针插件。",
  version: "2026.10.22.1",
  skills: [
    {
      name: "probe-skill",
      description: "A probe skill.",
      descriptionZh: "一个探针技能。",
      version: "2026.10.22.1",
    },
  ],
  hooks: [],
};

/** What each refused write answers: its own words prove the reason came back into the card. */
const DELETE_REFUSAL = { code: "plugin_store_read_only", message: "plugin store is read-only" };
const AGENT_REFUSAL = { code: "agent_state_read_only", message: "agent state is read-only" };

const notifications = (page) => page.getByRole("region", { name: "通知" });

/** The page's own text with a refusal line dropped — the only thing a refusal may add. */
async function cardText(card) {
  return (await card.innerText()).replace(/\n操作被拒绝：[^\n]*/g, "");
}

const refuseWith = (route, refusal) =>
  route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({ error: refusal }),
  });

/** A read answered from a fixture. */
const answer = (route, body) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

/** The library as the page reads it: one user plugin, which is the card the tests act on. */
async function stubLibrary(page) {
  await page.route("**/api/plugins", async (route) => {
    if (new URL(route.request().url()).pathname !== "/api/plugins") return route.fallback();
    if (route.request().method() !== "GET") return route.fallback();
    await answer(route, {
      groups: [{ id: "probe", title: "Probe", titleZh: "探针", plugins: [PLUGIN] }],
    });
  });
}

/**
 * The plugin's copies, as the page's install snapshot reads them: the skill is installed on every
 * Agent, so the card's state, its manage-installs rows and its update reminder all describe a
 * plugin this Project holds.
 */
async function stubInstalled(page) {
  await page.route("**/api/projects/*/agents/*/skills", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await answer(route, { skills: PLUGIN.skills });
  });
}

/**
 * Take over the plugin delete; `state.refuse` is flipped by the retry half, and `state.writes`
 * keeps every delete so the tests can tell how many were sent. A written one answers 204, which
 * is what the real route returns.
 */
async function stubDelete(page, state) {
  await page.route("**/api/plugins/*", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    state.writes.push(new URL(route.request().url()).pathname);
    if (state.refuse) return refuseWith(route, DELETE_REFUSAL);
    await route.fulfill({ status: 204 });
  });
}

/** Take over the per-Agent uninstall (one DELETE per part; this plugin ships one skill). */
async function stubUninstall(page, state) {
  await page.route("**/api/projects/*/agents/*/skills/*", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    state.writes.push(new URL(route.request().url()).pathname);
    if (state.refuse) return refuseWith(route, AGENT_REFUSAL);
    await route.fulfill({ status: 204 });
  });
}

/** Take over the reinstall that an update is. */
async function stubUpdate(page, state) {
  await page.route("**/api/projects/*/agents/*/plugins", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    state.writes.push(route.request().postDataJSON());
    if (state.refuse) return refuseWith(route, AGENT_REFUSAL);
    await answer(route, { skills: PLUGIN.skills, hooks: [] });
  });
}

/**
 * Serve the Agent list with this plugin marked as behind the library on `AGENT`: `pluginUpdates`
 * is the server's own comparison of an installed copy against ITS plugin directory, which the
 * stubbed library above cannot move, so it is edited into the real summaries here. Everything
 * else on those summaries stays as the server sent it.
 */
async function stubOutdatedAgent(page) {
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
  const list = await (await page.request.get(`${BASE}/api/projects/${projectId}/agents`)).json();
  for (const agent of list.agents) {
    if (agent.agentId !== AGENT) continue;
    agent.pluginUpdates = [
      ...(agent.pluginUpdates ?? []),
      { name: PLUGIN.name, version: PLUGIN.version },
    ];
  }
  await page.route("**/api/projects/*/agents**", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    if (!new URL(route.request().url()).pathname.endsWith("/agents")) return route.fallback();
    await answer(route, list);
  });
}

/** The card's own actions (their accessible names are the verb plus the plugin's name). */
const deleteButton = (page) =>
  page.getByRole("button", { name: `删除插件 ${PLUGIN.name}`, exact: true });
const manageButton = (page) =>
  page.getByRole("button", { name: `管理安装 ${PLUGIN.name}`, exact: true });
const updateButton = (page) =>
  page.getByRole("button", {
    name: `有新版本：更新 1 个 Agent 的安装 ${PLUGIN.name}`,
    exact: true,
  });
const search = (page) => page.getByRole("searchbox", { name: "搜索插件" });

/** The confirmation a card action opens, named by its own title. */
async function openDialog(page, click, title) {
  await click();
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("a refused plugin delete keeps the question, the reason and the card", async ({ page }) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const state = { writes: [], refuse: true };
  await stubLibrary(page);
  await stubDelete(page, state);

  await page.goto("/plugins");
  await expect(deleteButton(page)).toBeVisible();
  const dialog = await openDialog(page, () => deleteButton(page).click(), `删除 ${PLUGIN.name}`);
  const sentence = await cardText(dialog);
  expect(sentence).toContain(PLUGIN.name);

  await dialog.getByRole("button", { name: "删除插件" }).click();

  // The reason is in the card that asked, and it is not a toast: the notification region holds no
  // dismissible button, and the card reads exactly as it did before the attempt plus one line.
  await expect(dialog.getByText(DELETE_REFUSAL.message)).toBeVisible();
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.writes).toEqual([`/api/plugins/${PLUGIN.name}`]);
  await expect(dialog).toBeVisible();
  expect(await cardText(dialog)).toBe(sentence);

  // Nothing was deleted: the card is still on the page, so the plugin is still there to retry on.
  await expect(deleteButton(page)).toBeVisible();

  // Closing the card decides nothing, and opening it again does not carry the old reason over.
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  const reopened = await openDialog(page, () => deleteButton(page).click(), `删除 ${PLUGIN.name}`);
  await expect(reopened.getByText(DELETE_REFUSAL.message)).toHaveCount(0);

  // The retry is the same card; this time the delete lands: card gone, action gone.
  state.refuse = false;
  await reopened.getByRole("button", { name: "删除插件" }).click();
  await expect(reopened).toHaveCount(0);
  expect(state.writes).toHaveLength(2);
  await expect(deleteButton(page)).toHaveCount(0);
});

test("a refused uninstall keeps the question, the reason and the installed copy", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const state = { writes: [], refuse: true };
  await stubLibrary(page);
  await stubInstalled(page);
  await stubUninstall(page, state);

  await page.goto("/plugins");
  // The plugin is installed, so its card sits in the folded section: a search opens both.
  await search(page).fill(PLUGIN.name);
  await expect(manageButton(page)).toBeVisible();
  await manageButton(page).click();
  const row = page.getByRole("dialog", { name: `管理安装：${PLUGIN.name}` });
  await expect(row).toBeVisible();
  const dialog = await openDialog(
    page,
    () => row.getByRole("button", { name: `卸载 ${AGENT}`, exact: true }).click(),
    `卸载 ${PLUGIN.name}`,
  );
  const sentence = await cardText(dialog);
  expect(sentence).toContain(PLUGIN.name);

  await dialog.getByRole("button", { name: "卸载", exact: true }).click();

  await expect(dialog.getByText(AGENT_REFUSAL.message)).toBeVisible();
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  // One DELETE for the plugin's one skill, aimed at the Agent the row named.
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].endsWith(`/agents/${AGENT}/skills/${PLUGIN.skills[0].name}`)).toBe(true);
  await expect(dialog).toBeVisible();
  expect(await cardText(dialog)).toBe(sentence);

  // Nothing was uninstalled: the row still offers the uninstall the card just refused.
  await expect(row.getByRole("button", { name: `卸载 ${AGENT}`, exact: true })).toBeVisible();

  // The retry is the same card; this time the uninstall lands and the card closes.
  state.refuse = false;
  await dialog.getByRole("button", { name: "卸载", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes).toHaveLength(2);
  // The copy left the Agent the page works with, so the card itself moved to the other section —
  // that remount is why the manage-installs list closes with it, and the card now offers to
  // install the plugin to that Agent instead.
  await expect(row).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: new RegExp(`^安装到 .+ ${PLUGIN.name}$`) }),
  ).toBeVisible();
});

test("a refused update keeps the question, the reason and the installed copy", async ({ page }) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const state = { writes: [], refuse: true };
  await stubLibrary(page);
  await stubInstalled(page);
  await stubOutdatedAgent(page);
  await stubUpdate(page, state);

  await page.goto("/plugins");
  await search(page).fill(PLUGIN.name);
  await expect(updateButton(page)).toBeVisible();
  const dialog = await openDialog(page, () => updateButton(page).click(), `更新 ${PLUGIN.name}`);
  const sentence = await cardText(dialog);
  expect(sentence).toContain(PLUGIN.name);

  await dialog.getByRole("button", { name: "更新", exact: true }).click();

  await expect(dialog.getByText(AGENT_REFUSAL.message)).toBeVisible();
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.writes).toEqual([{ names: [PLUGIN.name] }]);
  await expect(dialog).toBeVisible();
  expect(await cardText(dialog)).toBe(sentence);

  // The retry is the same card; this time the reinstall lands and the card closes.
  state.refuse = false;
  await dialog.getByRole("button", { name: "更新", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes).toHaveLength(2);
});
