/**
 * Regression: the three questions the Agent's own API tab asks — turn the API off, allow keyless
 * access, delete a key — close only once their write landed, and one the server refused keeps the
 * card with the reason inside it instead of closing on the way out of the request.
 *
 * All three used to close first and write second: when the write came back refused, the page and
 * the server were exactly as they had been (the switch on, the key still listed), yet the reason
 * arrived as a toast that dismissed itself after six seconds and sat above the card. The cards now
 * stay until the write lands, and a refusal is drawn under the sentence they asked with
 * (`ConfirmModal`'s `refusal` slot), so the retry is the same button.
 *
 * Every write is the page's own — refused at `page.route` — and every check reads the server
 * through the API, so both halves of the contract are covered.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const AGENT = "default_agent";

/** The key under test; the tab lists it by name and by its prefix alone. */
const KEY = "PROBE_API_KEY";

/** The refusal both writes answer with: its own words prove the reason came back into the card. */
const REFUSAL = { code: "agent_api_read_only", message: "agent api is read-only" };

const apiUrl = (projectId) => `${BASE}/api/projects/${projectId}/agents/${AGENT}/api`;

/**
 * Provision the user, give the Project a model (the onboarding overlay covers the page without
 * one), and open the Agent's API with one key on it. The writes are absolute — `enabled` on, and
 * any earlier run's keys dropped — so rerunning this file alone on one data root stays clean.
 */
async function projectWithApi(page, user) {
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

  const enabled = await page.request.put(apiUrl(projectId), {
    data: { enabled: true, open: false },
  });
  expect(enabled.ok(), "open the API").toBeTruthy();
  for (const record of (await enabled.json()).api.keys) {
    await page.request.delete(`${apiUrl(projectId)}/keys/${record.keyId}`);
  }
  const minted = await page.request.post(`${apiUrl(projectId)}/keys`, { data: { name: KEY } });
  expect(minted.ok(), "mint a key").toBeTruthy();

  /** The Agent's API as the server holds it: what the tab reads and writes back. */
  const stored = async () => (await (await page.request.get(apiUrl(projectId))).json()).api;
  return { projectId, stored };
}

/**
 * Take over one write: every request of that method is kept in `seen`, and while `state.refuse`
 * is set it is answered with the server's refusal instead of reaching the real route.
 */
async function interceptWrite(page, pattern, method, state) {
  await page.route(pattern, async (route) => {
    if (route.request().method() !== method) return route.fallback();
    state.seen.push(route.request().postData() ?? "");
    if (!state.refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
}

/** The key's row: the only place the page writes the probe's name. */
const keyRow = (page) => page.locator('[data-testid="api-key"]', { hasText: KEY });

/** The card's own text with the refusal line dropped — the only thing a refusal may change. */
async function cardText(card) {
  return (await card.innerText()).replace(/\n操作被拒绝：[^\n]*/, "");
}

/** The notification region: a refusal must not be announced there (that is the old toast). */
const notifications = (page) => page.getByRole("region", { name: "通知" });

test("a refused key delete keeps the card, its sentence and the key", async ({ page }) => {
  const { stored } = await projectWithApi(page, "r120key");
  expect((await stored()).keys.map((k) => k.name)).toContain(KEY);

  const state = { seen: [], refuse: true };
  await interceptWrite(page, "**/api/projects/*/agents/*/api/keys/*", "DELETE", state);

  await page.goto(`/agents/${AGENT}?tab=api`);
  await expect(keyRow(page)).toBeVisible();
  await keyRow(page)
    .getByRole("button", { name: `删除密钥 ${KEY}` })
    .click();
  const dialog = page.getByRole("dialog", { name: "删除密钥" });
  await expect(dialog).toBeVisible();
  const sentence = await cardText(dialog);
  expect(sentence).toContain(KEY);

  await dialog.getByRole("button", { name: "删除", exact: true }).click();

  // The reason is in the card that asked, and it is not a toast.
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.seen).toHaveLength(1);
  await expect(dialog).toBeVisible();
  expect(await cardText(dialog)).toBe(sentence);

  // Nothing was removed anywhere: the row is still on the page and still in the server's list.
  await expect(keyRow(page)).toBeVisible();
  expect((await stored()).keys.map((k) => k.name)).toContain(KEY);

  // Closing the card decides nothing, and opening it again does not carry the old reason over.
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  await keyRow(page)
    .getByRole("button", { name: `删除密钥 ${KEY}` })
    .click();
  const reopened = page.getByRole("dialog", { name: "删除密钥" });
  await expect(reopened).toBeVisible();
  await expect(reopened.getByText(REFUSAL.message)).toHaveCount(0);

  // The retry is the same card; this time the delete lands.
  state.refuse = false;
  await reopened.getByRole("button", { name: "删除", exact: true }).click();
  await expect(reopened).toHaveCount(0);
  expect(state.seen).toHaveLength(2);
  await expect(keyRow(page)).toHaveCount(0);
  expect((await stored()).keys.map((k) => k.name)).not.toContain(KEY);
});

test("a refused API-off keeps the card, its sentence and the API on", async ({ page }) => {
  const { stored } = await projectWithApi(page, "r120off");
  expect((await stored()).enabled).toBe(true);

  const state = { seen: [], refuse: true };
  await interceptWrite(page, "**/api/projects/*/agents/*/api", "PUT", state);

  await page.goto(`/agents/${AGENT}?tab=api`);
  const apiSwitch = page.getByRole("switch", { name: "开启 API 访问" });
  await expect(apiSwitch).toHaveAttribute("aria-checked", "true");
  await apiSwitch.click();
  const dialog = page.getByRole("dialog", { name: "关闭 API 访问？" });
  await expect(dialog).toBeVisible();
  const sentence = await cardText(dialog);

  await dialog.getByRole("button", { name: "关闭", exact: true }).click();

  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.seen).toHaveLength(1);
  await expect(dialog).toBeVisible();
  expect(await cardText(dialog)).toBe(sentence);

  // The switch never flipped and the server still has the API on (keys and all).
  await expect(apiSwitch).toHaveAttribute("aria-checked", "true");
  expect((await stored()).enabled).toBe(true);
  await expect(keyRow(page)).toBeVisible();

  // Cancel, then ask again: no stale reason; this time the write lands and the card closes.
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  await apiSwitch.click();
  const reopened = page.getByRole("dialog", { name: "关闭 API 访问？" });
  await expect(reopened).toBeVisible();
  await expect(reopened.getByText(REFUSAL.message)).toHaveCount(0);
  state.refuse = false;
  await reopened.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(reopened).toHaveCount(0);
  expect(state.seen).toHaveLength(2);
  expect(JSON.parse(state.seen[1])).toEqual({ enabled: false });
  await expect(apiSwitch).toHaveAttribute("aria-checked", "false");
  expect((await stored()).enabled).toBe(false);
});

test("a refused keyless switch keeps the card, its sentence and keyless access off", async ({
  page,
}) => {
  const { stored } = await projectWithApi(page, "r120open");
  expect((await stored()).open).toBe(false);

  const state = { seen: [], refuse: true };
  await interceptWrite(page, "**/api/projects/*/agents/*/api", "PUT", state);

  await page.goto(`/agents/${AGENT}?tab=api`);
  const openSwitch = page.getByRole("switch", { name: "允许无密钥访问" });
  await expect(openSwitch).toHaveAttribute("aria-checked", "false");
  await openSwitch.click();
  const dialog = page.getByRole("dialog", { name: "允许无密钥访问？" });
  await expect(dialog).toBeVisible();
  const sentence = await cardText(dialog);

  await dialog.getByRole("button", { name: "仍然开启" }).click();

  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.seen).toHaveLength(1);
  await expect(dialog).toBeVisible();
  expect(await cardText(dialog)).toBe(sentence);
  await expect(openSwitch).toHaveAttribute("aria-checked", "false");
  expect((await stored()).open).toBe(false);

  // The retry on the same card lands: it closes, and the server holds keyless access on.
  state.refuse = false;
  await dialog.getByRole("button", { name: "仍然开启" }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.seen).toHaveLength(2);
  expect(JSON.parse(state.seen[1])).toEqual({ open: true });
  await expect(openSwitch).toHaveAttribute("aria-checked", "true");
  expect((await stored()).open).toBe(true);
});
