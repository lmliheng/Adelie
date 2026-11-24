/**
 * Regression: the conversation's Messaging panel says why its form never arrived — where the
 * form would be — instead of shimmering on its loading skeleton forever with the reason in a
 * notification that dismissed itself after six seconds.
 *
 * The panel is opened from the dock, not from a dialog: the dialog closes on a failed load and
 * a toast is all its reader can be left with, but the panel stays open. Before this change the
 * read came back refused and the panel kept drawing two skeletons, which says "still loading"
 * about a request that had already answered. The sentence now stands in that space and the
 * retry under it reads the bindings again — the panel's only control that can stand in for the
 * read while the form has not arrived.
 *
 * Only the GET that must be refused is taken over; the login, the Session and the stored binding
 * are real. The binding points at a closed local port, so nothing here reaches the internet.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";

/** Where this channel's connector dials: nothing listens on port 9, so nothing leaves the machine. */
const DEAD_ORIGIN = "http://127.0.0.1:9";
/** The app's own sentence for a failed request (`internal`), not the server's wire message. */
const REFUSED_LINE = "读不到这个对话的远程控制设置：服务器内部错误，请稍后重试。";
/** The retry the panel offers under that sentence. */
const RETRY = "重试";

/** Configure the mock model, create one titled conversation and bind Feishu to it; returns its id. */
async function seed(page, projectId, title, appId) {
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

  const bound = await page.request.put(`${BASE}/api/sessions/${sessionId}/messaging/feishu`, {
    data: { appId, appSecret: "saved-app-secret", baseDomain: DEAD_ORIGIN },
  });
  expect(bound.ok(), "bind feishu").toBeTruthy();
  return sessionId;
}

/**
 * Take over the bindings read. `state.answer` picks what it does: `"refuse"` (the request itself
 * failing) or `"accept"` (letting the real route run); every call is counted, so a test can tell
 * that a retry really went back to the server.
 */
async function stubRead(page, state) {
  await page.route("**/api/sessions/*/messaging", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    state.seen += 1;
    if (state.answer === "accept") return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal", message: "RAW ENGLISH MESSAGE" } }),
    });
  });
}

/**
 * Collect the page's console errors. The editor's own poll touches `/api/projects/…/machines`,
 * which answers 403 to anyone but an administrator, and this spec stubs a 500 on purpose — the
 * app's normal behaviour for this account and the answer under test — so those are recognised by
 * status and path and everything else fails.
 */
function watchConsole(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    errors.push({ text: msg.text(), url: msg.location()?.url ?? "" });
  });
  return {
    unexpected: () =>
      errors.filter(({ text, url }) => {
        const status = /status of (\d{3})/.exec(text)?.[1];
        if (status === "403" && url.includes("/machines")) return false;
        if (status === "500" && url.includes("/messaging")) return false;
        return true;
      }),
  };
}

/** The notification region: the panel's line must not be announced there (that is the old toast). */
const notifications = (page) => page.getByRole("region", { name: "通知" });

/** Open the conversation's Messaging panel from the dock and return its tab. */
async function openMessagingPanel(page, sessionId) {
  await page.goto(`${BASE}/chat/${sessionId}`);
  await page.getByPlaceholder(/输入消息/).waitFor();
  // The dock keeps a hidden panel in the DOM at zero size, so "on screen" is `data-open`, the
  // same reading dock.spec.mjs uses.
  await page.getByTestId("dock-toggle-right").click();
  await page.getByTestId("dock-pick-messaging").click();
  const panel = page.locator('[data-testid="dock"][data-position="right"][data-open="true"]');
  await expect(panel.locator('[data-tab-id="messaging"][data-active="true"]')).toBeVisible();
  return panel;
}

test("a bindings read that never arrives keeps its reason in the panel, not in a toast", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await provisionAndLogin(page.request, "loadfail", P);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const title = `e2e load refusal ${Date.now()}`;
  const sessionId = await seed(page, projectId, title, `load-refused-${Date.now()}`);

  const state = { seen: 0, answer: "refuse" };
  await stubRead(page, state);
  const panel = await openMessagingPanel(page, sessionId);

  // The sentence sits where the form would be, exactly once, in the interface's own words.
  const alert = panel.getByRole("alert");
  await expect(alert).toHaveText(REFUSED_LINE);
  await expect(alert).toHaveCount(1);
  await expect(alert).not.toContainText("RAW ENGLISH MESSAGE");
  // The skeleton is gone: a panel that keeps shimmering is claiming to be reading still.
  await expect(panel.locator("div.animate-pulse")).toHaveCount(0);
  // The form never arrived, so neither did its fields.
  await expect(panel.getByLabel("App ID", { exact: true })).toHaveCount(0);
  // Not a toast: the notification region holds nothing to dismiss.
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  // The retry is the read itself — the only control the panel has in this state.
  await expect(panel.getByRole("button", { name: RETRY, exact: true })).toBeVisible();

  // Six seconds is how long a toast lives; this line has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(alert).toHaveText(REFUSED_LINE);
  expect(console_.unexpected()).toEqual([]);
});

test("the retry reads the bindings again and the arrived form replaces the sentence", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await provisionAndLogin(page.request, "loadretry", P);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const title = `e2e load retried ${Date.now()}`;
  const sessionId = await seed(page, projectId, title, `load-retried-${Date.now()}`);

  const state = { seen: 0, answer: "refuse" };
  await stubRead(page, state);
  const panel = await openMessagingPanel(page, sessionId);
  await expect(panel.getByRole("alert")).toHaveText(REFUSED_LINE);
  const seenBefore = state.seen;

  // The read that failed is the attempt the reader can repeat; this time it lands.
  state.answer = "accept";
  await panel.getByRole("button", { name: RETRY, exact: true }).click();

  // The form the panel was opened for is what replaces the sentence — the stored binding shows
  // as its App ID, which is proof the retry really read the server rather than clearing the line.
  await expect(panel.getByLabel("App ID", { exact: true })).toHaveValue(/load-retried-/);
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: RETRY, exact: true })).toHaveCount(0);
  expect(state.seen).toBeGreaterThan(seenBefore);
  expect(console_.unexpected()).toEqual([]);
});
