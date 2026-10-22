/**
 * Regression: the two bulk updates a page notice offers — reinstall every outdated plugin on
 * every Agent behind it (Plugins), and run the kernel update on every Agent behind the defaults
 * generation (Agents) — ask first, and a batch the server did not take everywhere keeps that
 * question, with the partial-failure sentence drawn inside it.
 *
 * Both used to settle on the request rather than on the answer: the confirmation closed in a
 * `finally` after the writes, and a partial failure arrived as a toast that dismissed itself
 * after six seconds and sat above the dialog — so the one thing the user needs while retrying
 * (which Agents are still behind, and why) was also the first thing to leave. Each card now
 * closes only once every target landed; anything less leaves it open with `bulkFailureText`'s
 * sentence in `ConfirmModal`'s refusal slot, so the retry is the same button. The plugin batch
 * is additionally scoped down to the Agents that are still behind before it is handed back.
 *
 * The writes the tests measure are the page's own requests — POST …/agents/:id/plugins and POST
 * …/agents/:id/config/kernel-update — taken over with `page.route`; the Agent list is the
 * server's own, with the one field each gate reads edited into it, because both trails are
 * reads of `AgentSummary` and a development data root ships neither an outdated plugin nor an
 * Agent behind the defaults generation.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const AGENT = "default_agent";

/** The plugin the batch would reinstall: a name only the stubbed list carries. */
const PLUGIN = { name: "probe-plugin", version: "2026.10.22.1" };

/** What each refused write answers: its own words prove the reason came back into the card. */
const PLUGIN_REFUSAL = { code: "agent_state_read_only", message: "agent state is read-only" };
const KERNEL_REFUSAL = { code: "agent_state_read_only", message: "agent state is read-only" };

const notifications = (page) => page.getByRole("region", { name: "通知" });

const refuseWith = (route, refusal) =>
  route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({ error: refusal }),
  });

/** The Project's first Agent list, as the server sends it (the whole body, `agents` key included). */
async function agentList(page) {
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
  return await (await page.request.get(`${BASE}/api/projects/${projectId}/agents`)).json();
}

/**
 * Serve the Agent list with one field edited in: `pluginUpdates` raises the Plugins trail,
 * `kernelOutdated` the Agents one. Both gates read these summaries, so the notice above the
 * bulk button appears exactly as it would on a real install that is behind.
 */
async function stubAgents(page, edit) {
  const body = await agentList(page);
  for (const agent of body.agents) if (agent.agentId === AGENT) edit(agent);
  await page.route("**/api/projects/*/agents**", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    if (!new URL(route.request().url()).pathname.endsWith("/agents")) return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

/** Take over the plugin reinstall a bulk update is; `state.refuse` is flipped by the retry half. */
async function stubBulkUpdate(page, state) {
  await page.route("**/api/projects/*/agents/*/plugins", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    state.writes.push(route.request().postDataJSON());
    if (state.refuse) return refuseWith(route, PLUGIN_REFUSAL);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ skills: [], hooks: [] }),
    });
  });
}

/** Take over the kernel update. */
async function stubKernelUpdate(page, state) {
  await page.route("**/api/projects/*/agents/*/config/kernel-update", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    state.writes.push(new URL(route.request().url()).pathname);
    if (state.refuse) return refuseWith(route, KERNEL_REFUSAL);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ advanced: [], kept: [], kernelVersion: "2026-10-22" }),
    });
  });
}

/**
 * The notice's bulk button. Its accessible name folds the notice's own sentence in after the
 * visible label ("现在升级 · 检测到变更：1 个可升级"), so it is matched by that prefix alone.
 */
const updateNow = (page) => page.getByRole("button", { name: /^现在升级 ·/ });

test("a refused plugin bulk update keeps the question, the reason and the plan", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const state = { writes: [], refuse: true };
  await stubAgents(page, (agent) => {
    agent.pluginUpdates = [...(agent.pluginUpdates ?? []), PLUGIN];
  });
  await stubBulkUpdate(page, state);

  await page.goto("/plugins");
  // The notice states the one honest count for this trail: a distinct plugin, not an Agent.
  await expect(page.getByText("检测到变更：1 个可升级")).toBeVisible();
  await updateNow(page).click();
  const dialog = page.getByRole("dialog", { name: "更新 1 个插件" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "更新", exact: true }).click();

  // The sentence (which names the Agent that did not take it) and the server's words are inside
  // the card that asked, and the notification region holds no dismissible button: no toast.
  await expect(dialog.getByText("以下未成功：")).toBeVisible();
  await expect(dialog.getByText(PLUGIN_REFUSAL.message)).toBeVisible();
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.writes).toEqual([{ names: [PLUGIN.name] }]);
  await expect(dialog).toBeVisible();
  // The card still holds the question it asked: the sentence and the plan, not just the reason.
  await expect(dialog.getByText("将影响以下对象：")).toBeVisible();
  await expect(dialog.getByRole("listitem")).toHaveCount(1);
  await expect(dialog.getByRole("listitem")).toHaveText(PLUGIN.name);

  // Closing decides nothing, and opening the batch again does not carry the old reason over.
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  await updateNow(page).click();
  const reopened = page.getByRole("dialog", { name: "更新 1 个插件" });
  await expect(reopened).toBeVisible();
  await expect(reopened.getByText(PLUGIN_REFUSAL.message)).toHaveCount(0);

  // The retry is the same card; this time the batch lands and the card closes.
  state.refuse = false;
  await reopened.getByRole("button", { name: "更新", exact: true }).click();
  await expect(reopened).toHaveCount(0);
  expect(state.writes).toHaveLength(2);
});

test("a refused kernel bulk update keeps the question, the reason and the plan", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const state = { writes: [], refuse: true };
  await stubAgents(page, (agent) => {
    agent.kernelOutdated = true;
  });
  await stubKernelUpdate(page, state);

  await page.goto("/agents");
  await expect(page.getByText("检测到变更：1 个可升级")).toBeVisible();
  await updateNow(page).click();
  const dialog = page.getByRole("dialog", { name: "更新 1 个 Agent 的内核" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "更新内核", exact: true }).click();

  await expect(dialog.getByText("以下未成功：")).toBeVisible();
  await expect(dialog.getByText(KERNEL_REFUSAL.message)).toBeVisible();
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].endsWith(`/agents/${AGENT}/config/kernel-update`)).toBe(true);
  await expect(dialog).toBeVisible();
  // The card still holds the question it asked: the sentence and the plan, not just the reason.
  await expect(dialog.getByText("将影响以下对象：")).toBeVisible();
  await expect(dialog.getByRole("listitem")).toHaveCount(1);

  // The retry is the same card; this time every Agent took it and the card closes.
  state.refuse = false;
  await dialog.getByRole("button", { name: "更新内核", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes).toHaveLength(2);
});
