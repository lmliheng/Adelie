/**
 * Regression: the sidebar foot's 待做 block belongs to the conversation that is open, so switching
 * conversations has to swap the list with it — and nothing read or written for the conversation
 * just left may paint itself over the new one.
 *
 * The block is `GET`/`PUT /api/sessions/:sessionId/todos` — a different file per Session — so three
 * ways for it to go wrong are pinned here, all against the real server: the plain switch (the list
 * simply has to follow the conversation); a write whose answer arrives after the switch (the tick's
 * own `PUT`, held back on the wire, lands while the reader is looking at another conversation); and
 * a read that fails (the reason must be shown — the previous conversation's list standing in for an
 * empty one is exactly what the block promises never to do).
 */
import { test, expect } from "@playwright/test";
import { login, ADMIN_ID, ADMIN_PASSWORD } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

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

/** Write one conversation's to-do list through the route the block itself writes with. */
async function seedTodos(page, sessionId, texts) {
  const res = await page.request.put(`${BASE}/api/sessions/${sessionId}/todos`, {
    data: { items: texts.map((text) => ({ text, done: false })) },
  });
  expect(res.ok(), "seed todos").toBeTruthy();
}

/** Two titled conversations, each with its own list. */
async function seedPair(page) {
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const stamp = Date.now();
  const firstTitle = `e2e todos 甲 ${stamp}`;
  const secondTitle = `e2e todos 乙 ${stamp}`;
  const first = await seedSession(page, projectId, firstTitle);
  const second = await seedSession(page, projectId, secondTitle);
  await seedTodos(page, first, ["甲的第一条", "甲的第二条"]);
  await seedTodos(page, second, ["乙的唯一一条"]);
  return { first, second, firstTitle, secondTitle };
}

test("opening another conversation swaps the 待做 list with it", async ({ page }) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const { first, second, secondTitle } = await seedPair(page);

  await page.goto(`/chat/${first}`);
  const sidebar = page.getByRole("complementary");
  await expect(sidebar.getByText("甲的第一条")).toBeVisible();

  await sidebar.locator("li", { hasText: secondTitle }).first().click();
  await expect(page).toHaveURL(new RegExp(second));

  await expect(sidebar.getByText("乙的唯一一条")).toBeVisible();
  await expect(sidebar.getByText("甲的第一条")).toHaveCount(0);
});

test("a write answered after the switch does not take over the new list", async ({ page }) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const { first, second, secondTitle } = await seedPair(page);

  // The write of the first conversation's list takes its time on the wire, so its answer lands
  // after the reader has moved on — the case a real machine reaches on a busy day.
  await page.route(`**/api/sessions/${first}/todos`, async (route) => {
    if (route.request().method() === "PUT") await new Promise((r) => setTimeout(r, 3000));
    return route.fallback();
  });

  await page.goto(`/chat/${first}`);
  const sidebar = page.getByRole("complementary");
  await expect(sidebar.getByText("甲的第一条")).toBeVisible();

  // Tick an entry of the first conversation…
  await sidebar.getByRole("button", { name: "标记为已完成" }).first().click();
  // …and open the second one before that tick's answer comes back.
  await sidebar.locator("li", { hasText: secondTitle }).first().click();
  await expect(page).toHaveURL(new RegExp(second));
  await expect(sidebar.getByText("乙的唯一一条")).toBeVisible();

  // The late answer belongs to the conversation it was written for, which is no longer open.
  await page.waitForTimeout(3500);
  await expect(sidebar.getByText("乙的唯一一条")).toBeVisible();
  await expect(sidebar.getByText("甲的第一条")).toHaveCount(0);
});

test("a read that fails shows the reason, not the previous conversation's list", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const { first, second, secondTitle } = await seedPair(page);

  await page.route(`**/api/sessions/${second}/todos`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "todo_store_unreadable", message: "boom" } }),
    });
  });

  await page.goto(`/chat/${first}`);
  const sidebar = page.getByRole("complementary");
  await expect(sidebar.getByText("甲的第一条")).toBeVisible();

  await sidebar.locator("li", { hasText: secondTitle }).first().click();
  await expect(page).toHaveURL(new RegExp(second));

  await expect(sidebar.getByText("没能读到这个会话的待做清单", { exact: false })).toBeVisible();
  await expect(sidebar.getByText("甲的第一条")).toHaveCount(0);
  await expect(sidebar.getByText("乙的唯一一条")).toHaveCount(0);
});
