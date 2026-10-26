/**
 * Regression: the two questions the Agent settings overview asks about the config file — restore
 * the defaults, and advance the kernel — keep the reason inside the card the server refused it
 * from, instead of only a toast that dismisses itself above the card the user is still reading.
 *
 * Both cards already stayed open on a refusal (they close on a landed write only), so the loss was
 * the reason alone: a notification that vanished after six seconds while the card sat there. The
 * same slot is already used by the Agents list's batch kernel update and by the API tab's three
 * cards, and this page's two now report the same way: `ConfirmModal`'s `refusal` strip, under the
 * sentence, next to the button that retries it — cleared on open and on close, never carried over.
 *
 * Every write is the page's own, refused at `page.route`; the config the page reads is the
 * server's own with the one field the kernel gate looks at edited in (a development data root
 * ships the default Agent up to date, so its update button is disabled).
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const AGENT = "default_agent";

/** What each refused write answers: its own words prove the reason came back into the card. */
const REFUSAL = { code: "agent_state_read_only", message: "agent state is read-only" };

const configPath = (projectId) => `/api/projects/${projectId}/agents/${AGENT}/config`;

/** The notification region: a refusal must not be announced there (that is the old toast). */
const notifications = (page) => page.getByRole("region", { name: "通知" });

/**
 * Provision the user and give the Project a model (the onboarding overlay covers the page without
 * one), returning the Project id and a reader for the Agent's config as the server holds it.
 */
async function projectWithModel(page, user) {
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
  const stored = async () =>
    await (await page.request.get(`${BASE}${configPath(projectId)}`)).json();
  return { projectId, stored };
}

/**
 * Serve the Agent config the page reads with one field edited in: `kernelOutdated` raises the
 * kernel section's trail and enables its update button, exactly as an install behind the current
 * defaults generation renders it. Everything else stays the server's own answer.
 */
async function stubConfig(page, projectId, edit) {
  const body = await (await page.request.get(`${BASE}${configPath(projectId)}`)).json();
  edit(body);
  await page.route(`**${configPath(projectId)}`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

/**
 * Take over one write: every request is counted, and while `state.refuse` is set it is answered
 * with the server's refusal instead of reaching the real route.
 */
async function interceptWrite(page, suffix, state) {
  await page.route(`**/api/projects/*/agents/*/config/${suffix}`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    state.seen.push(route.request().url());
    if (!state.refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
}

/** The card's own text with the refusal line dropped — the only thing a refusal may change. */
async function cardText(card) {
  return (await card.innerText()).replace(/\n操作被拒绝：[^\n]*/, "");
}

test("a refused config reset keeps the card, its sentence, and says why", async ({ page }) => {
  const { projectId, stored } = await projectWithModel(page, "r135reset");
  const before = await stored();

  const state = { seen: [], refuse: true };
  await interceptWrite(page, "reset", state);

  await page.goto(`/agents/${AGENT}`);
  const openButton = page.getByRole("button", { name: "还原为默认配置", exact: true });
  await expect(openButton).toBeVisible();
  await openButton.click();
  const dialog = page.getByRole("dialog", { name: "还原为默认配置" });
  await expect(dialog).toBeVisible();
  const sentence = await cardText(dialog);

  await dialog.getByRole("button", { name: "还原为默认配置", exact: true }).click();

  // The reason is in the card that asked, and it is not a toast.
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.seen).toHaveLength(1);
  await expect(dialog).toBeVisible();
  // The card still asks the question it asked: the sentence is untouched by the refusal.
  expect(await cardText(dialog)).toBe(sentence);
  // Nothing was rewritten on the server either.
  expect((await stored()).config.systemPrompt).toBe(before.config.systemPrompt);

  // Closing the card decides nothing, and opening it again does not carry the old reason over.
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  await openButton.click();
  const reopened = page.getByRole("dialog", { name: "还原为默认配置" });
  await expect(reopened).toBeVisible();
  await expect(reopened.getByText(REFUSAL.message)).toHaveCount(0);

  // The retry is the same card; this time the write lands and the card closes.
  state.refuse = false;
  await reopened.getByRole("button", { name: "还原为默认配置", exact: true }).click();
  await expect(reopened).toHaveCount(0);
  expect(state.seen).toHaveLength(2);
});

test("a refused kernel update keeps the card, its sentence, and says why", async ({ page }) => {
  const { projectId } = await projectWithModel(page, "r135kernel");
  await stubConfig(page, projectId, (body) => {
    body.config.kernelOutdated = true;
  });

  const state = { seen: [], refuse: true };
  await interceptWrite(page, "kernel-update", state);

  await page.goto(`/agents/${AGENT}`);
  // The outdated dot folds "· 内核有更新" into the button's accessible name, after its label.
  const openButton = page.getByRole("button", { name: /^更新内核 ·/ });
  await expect(openButton).toBeVisible();
  await openButton.click();
  const dialog = page.getByRole("dialog", { name: "更新内核" });
  await expect(dialog).toBeVisible();
  const sentence = await cardText(dialog);

  await dialog.getByRole("button", { name: "更新内核", exact: true }).click();

  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.seen).toHaveLength(1);
  expect(state.seen[0].endsWith(configPath(projectId) + "/kernel-update")).toBe(true);
  await expect(dialog).toBeVisible();
  expect(await cardText(dialog)).toBe(sentence);

  // Closing and reopening drops the reason; the retry on the fresh card lands and closes it.
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  await openButton.click();
  const reopened = page.getByRole("dialog", { name: "更新内核" });
  await expect(reopened).toBeVisible();
  await expect(reopened.getByText(REFUSAL.message)).toHaveCount(0);

  state.refuse = false;
  await reopened.getByRole("button", { name: "更新内核", exact: true }).click();
  await expect(reopened).toHaveCount(0);
  expect(state.seen).toHaveLength(2);
});
