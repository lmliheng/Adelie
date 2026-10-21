/**
 * Regression: deleting a conversation from the sidebar asks first, and a refused delete keeps that
 * question — with the server's words inside it — instead of leaving only a toast behind.
 *
 * The card itself already stayed open on a refusal (it closes on a landed DELETE only); what was
 * missing was the reason: it arrived as a toast that dismissed itself after six seconds and sat
 * above the card the person was still looking at. The same column's rename dialog answers a
 * refused write by keeping the dialog and showing the error inside it, so the delete card now does
 * the same through `ConfirmModal`'s `refusal` slot, and the retry is the same button.
 *
 * Both tests run against the real server; only the DELETE is taken over, because a refusal has to
 * be produced and the rest of the card's contract (what stays, what closes and when) is what is
 * measured.
 */
import { test, expect } from "@playwright/test";
import { login, ADMIN_ID, ADMIN_PASSWORD } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** The delete call the page makes; a 500 with its own words proves the reason came back. */
const REFUSAL = { code: "session_store_read_only", message: "session store is read-only" };

/**
 * Run one action from a Session row's "更多" menu. The trigger is a hover-revealed icon sitting
 * over the row's own clickable surface: when the click lands a frame before the row has re-laid
 * itself out, it hits the row (which navigates) and the menu never opens. So the open is retried
 * and verified — the same helper chat.spec.mjs uses for the same menu.
 */
async function pickRowAction(page, row, name) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await row.hover();
    await row.getByRole("button", { name: "更多" }).click();
    const item = page.getByRole("button", { name, exact: true });
    if (await item.count()) {
      await item.first().click();
      return;
    }
    await page.keyboard.press("Escape");
  }
  throw new Error(`the row menu never offered "${name}"`);
}

/** Configure the mock model and create one titled conversation; returns its id. */
async function seedSession(page, projectId, title) {
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
          pricing: { cacheRead: 1, cacheWrite: 5, output: 10 },
        },
      ],
    },
  });
  expect(put.ok(), "put models").toBeTruthy();

  const created = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
    { data: { provider: "custom", modelId: "claude-4-8" } },
  );
  expect(created.ok(), "create session").toBeTruthy();
  const sessionId = (await created.json()).session.sessionId;

  const renamed = await page.request.patch(`${BASE}/api/sessions/${sessionId}`, {
    data: { title },
  });
  expect(renamed.ok(), "rename session").toBeTruthy();
  return sessionId;
}

/**
 * Take over the DELETE: `state.refuse` produces the refusal and records the attempt, anything else
 * falls through to the real server (so the retry test deletes for real).
 */
async function stubDelete(page, state) {
  await page.route("**/api/sessions/*", async (route) => {
    const req = route.request();
    if (req.method() !== "DELETE") return route.fallback();
    state.deletes.push(new URL(req.url()).pathname.split("/").pop());
    if (!state.refuse) return route.fallback();
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
}

/** The row's own card text with the refusal line dropped — the only thing a refusal may change. */
async function cardText(dialog) {
  return (await dialog.innerText()).replace(/\n操作被拒绝：[^\n]*/, "");
}

test("a refused delete keeps the question, the reason and the row", async ({ page }) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const title = `e2e refused delete ${Date.now()}`;
  await seedSession(page, projectId, title);
  const state = { deletes: [], refuse: true };
  await stubDelete(page, state);

  await page.goto("/chat");
  const sidebar = page.getByRole("complementary");
  const row = sidebar.locator("li", { hasText: title }).first();
  await expect(row).toBeVisible();

  await pickRowAction(page, row, "删除对话");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const sentence = await cardText(dialog);

  await dialog.getByRole("button", { name: "删除", exact: true }).click();

  // The reason is in the card that asked, and it is not a toast: the notification region holds no
  // dismissible button, and the card reads exactly as it did before the attempt plus one line.
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  expect(state.deletes).toHaveLength(1);
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  expect(await cardText(dialog)).toBe(sentence);

  // Nothing was deleted anywhere: the row is still in the list.
  await expect(row).toBeVisible();

  // Closing the card decides nothing, and opening it again does not carry the old reason over.
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row).toBeVisible();
  await pickRowAction(page, row, "删除对话");
  const reopened = page.getByRole("dialog");
  await expect(reopened).toBeVisible();
  await expect(reopened.getByText(REFUSAL.message)).toHaveCount(0);
});

test("the retry after a refused delete deletes, and only a landed delete closes the card", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const title = `e2e retried delete ${Date.now()}`;
  const sessionId = await seedSession(page, projectId, title);
  const state = { deletes: [], refuse: true };
  await stubDelete(page, state);

  await page.goto("/chat");
  const sidebar = page.getByRole("complementary");
  const row = sidebar.locator("li", { hasText: title }).first();
  await expect(row).toBeVisible();

  await pickRowAction(page, row, "删除对话");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "删除", exact: true }).click();
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(state.deletes).toEqual([sessionId]);

  // The retry is the same card, and this time the delete lands: the card closes and the row is
  // gone from the list.
  state.refuse = false;
  await dialog.getByRole("button", { name: "删除", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.deletes).toEqual([sessionId, sessionId]);
  await expect(sidebar.getByText(title)).toHaveCount(0);

  // The server really deleted it on the retry (the refusal was ours; this one went through).
  const read = await page.request.get(`${BASE}/api/sessions/${sessionId}`);
  expect(read.status()).toBe(404);
});
