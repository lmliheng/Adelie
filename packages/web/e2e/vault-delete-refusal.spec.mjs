/**
 * Regression: deleting a key from either vault table asks first, and a refused delete keeps that
 * question — with the server's words inside it — instead of closing on the way out of the request.
 *
 * Both tables persist the whole list through one PUT, so "delete one row" is that PUT without the
 * row. Their confirmation used to close unconditionally after the write returned: when the write
 * was refused, the key was still in the table (on the page and on the server) yet the reason
 * arrived as a toast that dismissed itself after six seconds and sat above the card. The card now
 * closes only once the write landed, and a refusal leaves it open with the reason drawn under its
 * sentence (`ConfirmModal`'s `refusal` slot), so the retry is the same button.
 *
 * The two tables are the same defect in two places: the Agent's own vault
 * (`agents/<agent>?tab=vault`, keys that reach an Agent's commands) and the account's global one
 * (the account menu's 用户密钥). Each is seeded through the API and refused at `page.route`, so
 * both halves of the contract — what the page sends and what the server holds — are checked.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const AGENT = "default_agent";

/** The rows under test; the writes are whole-table, so each seed replaces whatever was there. */
const AGENT_KEY = "PROBE_AGENT_KEY";
const USER_KEY = "PROBE_USER_KEY";

/** The refused save: a 500 with its own words proves the reason came back into the card. */
const REFUSAL = { code: "vault_read_only", message: "vault is read-only" };

/**
 * Provision the user and give the Project a model — without one the onboarding overlay covers
 * every page. Returns the Project id the Agent routes live under.
 */
async function projectFor(page, user) {
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
  return projectId;
}

/** The Agent's own table as the server holds it: the page reads and writes this. */
const agentVaultUrl = (projectId) => `${BASE}/api/projects/${projectId}/agents/${AGENT}/vault`;

const agentKeys = async (page, projectId) =>
  (await (await page.request.get(agentVaultUrl(projectId))).json()).entries.map((e) => e.key);

/** The account's table, likewise (no Project in the path — it is the account's own). */
const userKeys = async (page) =>
  (await (await page.request.get(`${BASE}/api/me/vault`)).json()).entries.map((e) => e.key);

/**
 * Take over one PUT: every write is kept in `seen`, and while `state.refuse` is set it is
 * answered with the server's refusal instead of reaching the real route.
 */
async function interceptPut(page, pattern, state) {
  await page.route(pattern, async (route) => {
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

/** The card's own text with the refusal line dropped — the only thing a refusal may change. */
async function cardText(card) {
  return (await card.innerText()).replace(/\n操作被拒绝：[^\n]*/, "");
}

/** The notification region: a refusal must not be announced there (that is the old toast). */
const notifications = (page) => page.getByRole("region", { name: "通知" });

test("a refused delete in the Agent's vault keeps the card, its sentence and the key", async ({
  page,
}) => {
  const projectId = await projectFor(page, "r114agent");
  const put = await page.request.put(agentVaultUrl(projectId), {
    data: { entries: [{ key: AGENT_KEY, value: "secret" }] },
  });
  expect(put.ok(), "seed the agent vault").toBeTruthy();
  const before = await agentKeys(page, projectId);
  expect(before).toContain(AGENT_KEY);

  const state = { seen: [], refuse: true };
  await interceptPut(page, "**/api/projects/*/agents/*/vault", state);

  await page.goto(`/agents/${AGENT}?tab=vault`);
  const row = page.getByRole("row", { name: new RegExp(AGENT_KEY) });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "删除", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "删除环境变量" });
  await expect(dialog).toBeVisible();
  const sentence = await cardText(dialog);
  expect(sentence).toContain(AGENT_KEY);

  await dialog.getByRole("button", { name: "确认" }).click();

  // The reason is in the card that asked, and it is not a toast: the notification region holds no
  // dismissible button, and the card reads exactly as it did before the attempt plus one line.
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.seen).toHaveLength(1);
  await expect(dialog).toBeVisible();
  expect(await cardText(dialog)).toBe(sentence);

  // Nothing was removed anywhere: the row is still on the page and still in the server's table.
  await expect(row).toBeVisible();
  expect(await agentKeys(page, projectId)).toEqual(before);

  // Closing the card decides nothing, and opening it again does not carry the old reason over.
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  await row.getByRole("button", { name: "删除", exact: true }).click();
  const reopened = page.getByRole("dialog", { name: "删除环境变量" });
  await expect(reopened).toBeVisible();
  await expect(reopened.getByText(REFUSAL.message)).toHaveCount(0);

  // The retry is the same card; this time the write lands: card gone, key gone, table without it.
  state.refuse = false;
  await reopened.getByRole("button", { name: "确认" }).click();
  await expect(reopened).toHaveCount(0);
  expect(state.seen).toHaveLength(2);
  // The write the card sent is the table without that key — not an empty table wholesale.
  expect(state.seen[1].entries).toEqual([]);
  await expect(row).toHaveCount(0);
  expect(await agentKeys(page, projectId)).not.toContain(AGENT_KEY);
});

test("a refused delete in the account's vault keeps the card, its sentence and the key", async ({
  page,
}) => {
  await projectFor(page, "r114user");
  const put = await page.request.put(`${BASE}/api/me/vault`, {
    data: { entries: [{ key: USER_KEY, value: "secret" }] },
  });
  expect(put.ok(), "seed the account vault").toBeTruthy();
  const before = await userKeys(page);
  expect(before).toContain(USER_KEY);

  const state = { seen: [], refuse: true };
  await interceptPut(page, "**/api/me/vault", state);

  // The app itself (this dialog lives in the shell, not on a page of its own), settled on the
  // draft page before the menu is touched — a re-render mid-way would close the menu.
  await page.goto("/");
  const accountButton = page.getByRole("button", { name: "r114user" }).last();
  await expect(page.getByRole("heading", { name: "Adelie" })).toBeVisible();
  await expect(accountButton).toBeVisible();

  // The account menu; the username button shares its name with the Project switcher (the initial
  // Project's display name defaults to the username), so the last match is the bottom user menu.
  await accountButton.click();
  await page.getByRole("menuitem", { name: "用户密钥" }).click();
  const table = page.getByRole("dialog", { name: "用户密钥" });
  await expect(table).toBeVisible();

  const row = table.getByRole("row", { name: new RegExp(USER_KEY) });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "删除", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "删除全局密钥" });
  await expect(dialog).toBeVisible();
  const sentence = await cardText(dialog);
  expect(sentence).toContain(USER_KEY);

  await dialog.getByRole("button", { name: "确认" }).click();

  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.seen).toHaveLength(1);
  await expect(dialog).toBeVisible();
  expect(await cardText(dialog)).toBe(sentence);
  await expect(row).toBeVisible();
  expect(await userKeys(page)).toEqual(before);

  // A written delete is the only thing that closes this card.
  state.refuse = false;
  await dialog.getByRole("button", { name: "确认" }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.seen).toHaveLength(2);
  expect(state.seen[1].entries).toEqual([]);
  await expect(row).toHaveCount(0);
  expect(await userKeys(page)).not.toContain(USER_KEY);
});
