/**
 * Regression: the messaging card's "test connection" button says why a probe did not get through —
 * in the card, under that button — instead of leaving the form exactly as it was with the reason in
 * a notification that dismissed itself after six seconds.
 *
 * The button runs the selected channel's current (unsaved) values through the server's credential
 * probe, which saves nothing. A refused probe therefore leaves a card that looks untouched, while
 * the App ID, the secret and the base domain the sentence is about are the fields right below it.
 * Six seconds later that sentence used to be gone, and nothing on the card said the button had been
 * pressed at all.
 *
 * Both channels' probes are stubbed rather than travelled: what this spec is about is what the page
 * does with the answer, and a real probe would dial the platform. The binding itself is real (a
 * stored credential is what makes the button clickable), and it points at a closed local port, so
 * nothing here reaches the internet.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";

/** Where this channel's connector dials: nothing listens on port 9, so nothing leaves the machine. */
const DEAD_ORIGIN = "http://127.0.0.1:9";
/** The row menu action that opens the dialog (`S.messaging.bindAction`). */
const OPEN = "远程控制";
/** The probe button (`S.messaging.test`). */
const TEST = "测试连接";
/** The platform's own words for a rejected credential, as a probe route reports them. */
const PLATFORM_DETAIL = "Unauthorized";
/** The line the card draws: the sentence's lead-in plus those words. */
const REFUSED_LINE = `连接失败：${PLATFORM_DETAIL}`;
/** The app's own sentence for a failed request (`internal`), not the server's wire message. */
const FAILED_REQUEST_LINE = "连接失败：服务器内部错误，请稍后重试。";
/** The success toast every channel's connecting probe uses (`S.messaging.testOk`). */
const CONNECTED_TOAST = "连接成功（12ms）";

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
 * Configure the mock model, create one titled conversation and bind Feishu to it; returns its id.
 *
 * `appId` is unique per test: one account may hold only one enabled connection, and these tests
 * share a data root, so a fixed id would let an earlier run's leftover row answer the later one
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

  // A stored credential is what makes the probe button clickable at all: without one it is gated
  // (it dims and explains), and every test here is about what the route's answer does.
  const bound = await page.request.put(`${BASE}/api/sessions/${sessionId}/messaging/feishu`, {
    data: { appId, appSecret: "probe-app-secret", baseDomain: DEAD_ORIGIN },
  });
  expect(bound.ok(), "bind feishu").toBeTruthy();
  return sessionId;
}

/**
 * Take over the Feishu probe route. `state.answer` picks what it does: `"refuse"` (the platform's
 * rejection, the route's ordinary `ok:false` shape), `"error"` (the request itself failing) or
 * `"connect"`; every call records the body, so a test can check it carried the form's values.
 */
async function stubProbe(page, state) {
  await page.route("**/api/sessions/*/messaging/feishu/test", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    state.seen.push(route.request().postDataJSON());
    if (state.answer === "error") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "internal", message: "RAW ENGLISH MESSAGE" } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body:
        state.answer === "refuse"
          ? JSON.stringify({ ok: false, error: PLATFORM_DETAIL })
          : JSON.stringify({ ok: true, latencyMs: 12 }),
    });
  });
}

/**
 * Collect the page's console errors. The dialog's own poll touches `/api/projects/…/machines`,
 * which answers 403 to anyone but an administrator, and these tests stub a 500 on purpose — the
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
        if (status === "500" && url.includes("/messaging/")) return false;
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

/** The notification region: a refusal must not be announced there (that is the old toast). */
const notifications = (page) => page.getByRole("region", { name: "通知" });

test("a refused probe keeps the reason under the button, and only there", async ({ page }) => {
  const console_ = watchConsole(page);
  await provisionAndLogin(page.request, "probetest", P);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const title = `e2e refused probe ${Date.now()}`;
  await seed(page, projectId, title, `probe-refused-${Date.now()}`);

  const state = { seen: [], answer: "refuse" };
  await stubProbe(page, state);
  const dialog = await openDialog(page, title);

  await dialog.getByRole("button", { name: TEST, exact: true }).click();

  // The sentence sits in the card, under the button that asked, exactly once.
  await expect(dialog.getByRole("alert")).toHaveText(REFUSED_LINE);
  await expect(dialog.getByRole("alert")).toHaveCount(1);
  // Not a toast: the notification region holds nothing to dismiss.
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  // The probe travelled, carrying the form's own (empty) draft — the stored secret is the fallback.
  expect(state.seen).toHaveLength(1);

  // Six seconds is how long a toast lives; this line has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(dialog.getByRole("alert")).toHaveText(REFUSED_LINE);
  expect(console_.unexpected()).toEqual([]);
});

test("an edit drops the sentence, and the same button is the retry", async ({ page }) => {
  const console_ = watchConsole(page);
  await provisionAndLogin(page.request, "proberetry", P);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const title = `e2e retried probe ${Date.now()}`;
  await seed(page, projectId, title, `probe-retried-${Date.now()}`);

  const state = { seen: [], answer: "refuse" };
  await stubProbe(page, state);
  const dialog = await openDialog(page, title);
  await dialog.getByRole("button", { name: TEST, exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(REFUSED_LINE);

  // The probe sent the values that were on screen, so changing one of them makes the sentence
  // describe a connection nothing asked about any more.
  const appId = dialog.getByLabel("App ID", { exact: true });
  await appId.fill("cli_probe_edited");
  await expect(dialog.getByRole("alert")).toHaveCount(0);

  // Same button, second press: this time the probe connects, so the sentence stays away and the
  // numbers arrive as the toast every connecting probe uses.
  state.answer = "connect";
  await dialog.getByRole("button", { name: TEST, exact: true }).click();
  await expect(notifications(page).getByText(CONNECTED_TOAST)).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  expect(state.seen).toHaveLength(2);
  // The second probe travelled to the edited value, not the one the first sentence was about.
  expect(state.seen[1].appId).toBe("cli_probe_edited");
  expect(console_.unexpected()).toEqual([]);
});

test("a probe whose request never reached the route reads its code, not the wire message", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await provisionAndLogin(page.request, "probeerror", P);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const title = `e2e failed probe ${Date.now()}`;
  await seed(page, projectId, title, `probe-error-${Date.now()}`);

  const state = { seen: [], answer: "error" };
  await stubProbe(page, state);
  const dialog = await openDialog(page, title);
  await dialog.getByRole("button", { name: TEST, exact: true }).click();

  // `refusalText`'s rule: a request that never reached the platform is answered with its code's
  // own sentence, not the server's English — the same rule the app's other refusal slots follow.
  await expect(dialog.getByRole("alert")).toHaveText(FAILED_REQUEST_LINE);
  await expect(dialog.getByRole("alert")).not.toContainText("RAW ENGLISH MESSAGE");
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(console_.unexpected()).toEqual([]);
});
