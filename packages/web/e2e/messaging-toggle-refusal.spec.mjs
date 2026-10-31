/**
 * Regression: the connection switch says why a flip did not settle, in place, and the sentence
 * outlives the six seconds a toast lives.
 *
 * The switch writes nothing optimistically — it moves only when the state call lands — so a
 * refused flip springs back to where the server still has it. The reason used to arrive as a
 * toast and nothing else: a reader who looked away from the notification region was left with a
 * switch that would not move and one sentence they never got to read. The editor now keeps it
 * under the switch (`role="alert"`), like the connection's own error line, until the next flip
 * or a channel switch.
 *
 * Both tests run against the real server (real login, real Session, real binding PUT); only the
 * state POST that must be refused is taken over. The channel is Feishu pointed at a closed local
 * port, so an enable that DOES reach the server dials 127.0.0.1:9 and fails at once — the stored
 * intent is what the switch reads, and nothing here reaches the internet.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const USER = "probetoggle";
const P = "password123";

/** Where this channel's connector dials: nothing listens on port 9, so a connect fails at once. */
const DEAD_ORIGIN = "http://127.0.0.1:9";
/** The refusal an enable earns when another Session already holds that account — the server's words. */
const REFUSAL = {
  code: "account_enabled_elsewhere",
  message: "Another Session has this bot's connection enabled: turn it off there first.",
};
/** The line the editor draws: the shared lead-in plus the app's own sentence for that code. */
const REFUSED_LINE = "操作被拒绝：该机器人的连接已在另一个会话中启用：先在那边停用，再在此启用。";

/** The enable switch's accessible name; its label wraps it, so the text is the name. */
const SWITCH = "启用连接";
/** The row menu action that opens the dialog (`S.messaging.bindAction`). */
const OPEN = "远程控制";

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

/**
 * Configure the mock model, create one titled conversation, bind Feishu to it; returns its id.
 *
 * `appId` is unique per test: one account may hold only one enabled connection, and these tests
 * share a data root, so a fixed id would let an earlier run's leftover row refuse the later one
 * with a 409 that has nothing to do with what is being measured.
 */
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

  // A saved credential is what the switch needs to be clickable at all: without one the click is
  // gated (it explains and sends nothing), and both tests are about the server's answer.
  const bound = await page.request.put(`${BASE}/api/sessions/${sessionId}/messaging/feishu`, {
    data: { appId, appSecret: "probe-app-secret", baseDomain: DEAD_ORIGIN },
  });
  expect(bound.ok(), "bind feishu").toBeTruthy();
  return sessionId;
}

/** Store "enabled" (or not) out of band, so a test can start with the switch already on. */
async function setEnabled(page, sessionId, enabled) {
  const res = await page.request.post(`${BASE}/api/sessions/${sessionId}/messaging/feishu/state`, {
    data: { enabled },
  });
  expect(res.ok(), `state ${enabled}`).toBeTruthy();
  return (await res.json()).binding.enabled;
}

/**
 * Take over the state POST: `state.refuse` produces the refusal and records the attempt,
 * anything else falls through to the real server (so the retried flip lands for real).
 */
async function stubState(page, state) {
  await page.route("**/api/sessions/*/messaging/*/state", async (route) => {
    state.posts.push(new URL(route.request().url()).pathname);
    if (!state.refuse) return route.fallback();
    return route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
}

/**
 * Collect the page's console errors, keyed by the resource that produced them. The dialog's own
 * poll touches `/api/projects/…/machines`, which answers 403 to anyone but an administrator, and
 * the specs themselves produce one 409 — the app's normal behaviour for this account and the
 * refusal under test, so those two are recognised by status and path and everything else fails.
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
        if (status === "409" && url.includes("/messaging/")) return false;
        return true;
      }),
  };
}

/** Open the binding dialog from the seeded row (it opens on Feishu, the only bound channel). */
async function openDialog(page, title) {
  await page.goto("/chat");
  const sidebar = page.getByRole("complementary");
  const row = sidebar.locator("li", { hasText: title }).first();
  await expect(row).toBeVisible();
  await pickRowAction(page, row, OPEN);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test("a refused enable leaves its reason under the switch, and it outlives a toast", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await provisionAndLogin(page.request, USER, P);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const title = `e2e refused toggle ${Date.now()}`;
  await seed(page, projectId, title, `probe-refused-${Date.now()}`);

  const state = { posts: [], refuse: true };
  await stubState(page, state);
  const dialog = await openDialog(page, title);

  const toggle = dialog.getByRole("switch", { name: SWITCH });
  await expect(toggle).toBeVisible();
  await expect(toggle).not.toBeChecked();

  await toggle.click();

  // The reason is beside the switch that asked, announced as an alert, with the server's words.
  await expect(dialog.getByRole("alert")).toHaveText(REFUSED_LINE);
  expect(state.posts).toHaveLength(1);
  // Not a toast: the notification region holds nothing to dismiss.
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  // And the switch is where the server still has it — nothing was written optimistically.
  await expect(toggle).not.toBeChecked();
  // The whole point of the change: a toast is gone by now, this line is not.
  await page.waitForTimeout(6500);
  await expect(dialog.getByRole("alert")).toHaveText(REFUSED_LINE);
  // Nothing failed in the browser beyond the known admin-only read.
  expect(console_.unexpected()).toEqual([]);
});

test("the next flip clears the line: a landed disable leaves no reason behind", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await provisionAndLogin(page.request, USER, P);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const title = `e2e retried toggle ${Date.now()}`;
  const sessionId = await seed(page, projectId, title, `probe-retried-${Date.now()}`);
  // On before the dialog opens, so the flip these tests take over is the harmless direction
  // (disabling dials nothing) and the switch starts where the server left it.
  expect(await setEnabled(page, sessionId, true)).toBe(true);

  const state = { posts: [], refuse: true };
  await stubState(page, state);
  const dialog = await openDialog(page, title);
  const toggle = dialog.getByRole("switch", { name: SWITCH });
  await expect(toggle).toBeChecked();

  await toggle.click();
  await expect(dialog.getByRole("alert")).toHaveText(REFUSED_LINE);
  // Refused means unwritten: the switch is still on.
  await expect(toggle).toBeChecked();

  // Let the next flip through to the real server: it lands, and the reason goes with it.
  state.refuse = false;
  await toggle.click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(toggle).not.toBeChecked();
  expect(state.posts).toHaveLength(2);
  expect(console_.unexpected()).toEqual([]);
});
