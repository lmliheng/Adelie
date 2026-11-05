/**
 * Regression: a scan-to-connect attempt that fails says why — on the card, under the control that
 * asked — instead of leaving the card exactly as it was with the reason in a notification that
 * dismissed itself after six seconds.
 *
 * Both scan flows end the same way after a failure: the QR comes down (or, for WeChat's pairing
 * code, stays up with its input), the button that asks again is still on screen, and six seconds
 * later nothing on the card said the button had been pressed at all. The button is the retry, so
 * the sentence now stays until the next attempt.
 *
 * The scan routes are stubbed rather than travelled: what this spec measures is what the page does
 * with the answer, and a real scan would dial the platform and wait for a phone. The binding is
 * real — a stored QQ credential is what makes the dialog open on that channel — and the QR URL the
 * stub hands back points at a name that does not resolve, so nothing here reaches the internet.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";

/** The row menu action that opens the dialog (`S.messaging.bindAction`). */
const OPEN = "远程控制";
/** The scan button, on both channels (`S.qq.scanStart` / `S.wechat.scanStart`). */
const SCAN = "扫码连接";
/** The app's own sentence for a failed request (`internal`), not the server's wire message. */
const FAILED_REQUEST = "服务器内部错误，请稍后重试。";
/** The line the QQ card draws: its lead-in plus that sentence. */
const QQ_REFUSED = `扫码连接失败：${FAILED_REQUEST}`;
/** Never resolved: the code is rendered locally, never fetched. */
const QR_URL = "https://scan.invalid/authorize?task_id=stub";

/**
 * Run one action from a Session row's "更多" menu. The trigger is a hover-revealed icon sitting
 * over the row's own clickable surface: when the click lands a frame before the row has re-laid
 * itself out, it hits the row (which navigates) and the menu never opens. So the open is retried
 * and verified — the same helper the two neighbouring messaging specs use.
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

/** Configure the mock model, create one titled conversation and store a QQ credential on it. */
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

  // A stored credential is what makes this session's dialog open on QQ, which is where the scan
  // block is; the flow under test never reads it.
  const bound = await page.request.put(`${BASE}/api/sessions/${sessionId}/messaging/qq`, {
    data: { appId, appSecret: "scan-app-secret" },
  });
  expect(bound.ok(), "bind qq").toBeTruthy();
  return sessionId;
}

/**
 * Answer one of the two channels' scan routes. `state.answer` picks the reply — `"fail"` (the
 * server refusing the start), `"error"`, `"ok"`, `"pending"`, `"verify"` (WeChat's pairing step) or
 * `"verified"` — and every call is recorded, so a test can count the attempts.
 *
 * The globs stop at `/scan`: Playwright's `*` does not cross a slash, so the poll and verify routes
 * are separate patterns rather than one that would swallow all three.
 */
async function stubScan(page, channel, state) {
  await page.route(`**/api/sessions/*/messaging/${channel}/scan`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    state.seen.push(route.request().url());
    if (state.answer === "fail" || state.answer === "error") {
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
      body: JSON.stringify({ taskId: "stub-task", qrUrl: QR_URL, pollMs: 300 }),
    });
  });
  await page.route(`**/api/sessions/*/messaging/${channel}/scan/poll`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    state.polls += 1;
    if (state.answer === "pending" || state.answer === "verify") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: state.answer === "verify" ? "need_verify_code" : "pending",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal", message: "RAW ENGLISH MESSAGE" } }),
    });
  });
  await page.route(`**/api/sessions/*/messaging/${channel}/scan/verify`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    state.verifies.push(route.request().postDataJSON());
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal", message: "RAW ENGLISH MESSAGE" } }),
    });
  });
}

/**
 * Collect the page's console errors. The dialog's own poll touches `/api/projects/…/machines`,
 * which answers 403 to anyone but an administrator, and these tests stub 500s on purpose — the
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
        if ((status === "500" || status === "400") && url.includes("/messaging/")) return false;
        return true;
      }),
  };
}

/** Open the binding dialog from the seeded row (it opens on QQ, the only bound channel). */
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

test("a scan that cannot start keeps the reason under its button", async ({ page }) => {
  const console_ = watchConsole(page);
  await provisionAndLogin(page.request, "scanstart", P);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const title = `e2e scan start ${Date.now()}`;
  await seed(page, projectId, title, `scan-start-${Date.now()}`);

  const state = { seen: [], polls: 0, verifies: [], answer: "fail" };
  await stubScan(page, "qq", state);
  const dialog = await openDialog(page, title);

  await dialog.getByRole("button", { name: SCAN, exact: true }).click();

  // The sentence sits under the button that asked, exactly once, and is not a toast.
  await expect(dialog.getByRole("alert")).toHaveText(QQ_REFUSED);
  await expect(dialog.getByRole("alert")).toHaveCount(1);
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.seen).toHaveLength(1);

  // Six seconds is how long a toast lives; this line has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(dialog.getByRole("alert")).toHaveText(QQ_REFUSED);
  expect(console_.unexpected()).toEqual([]);
});

test("the same button is the retry, and its code replaces the sentence", async ({ page }) => {
  const console_ = watchConsole(page);
  await provisionAndLogin(page.request, "scanretry", P);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const title = `e2e scan retried ${Date.now()}`;
  await seed(page, projectId, title, `scan-retried-${Date.now()}`);

  const state = { seen: [], polls: 0, verifies: [], answer: "fail" };
  await stubScan(page, "qq", state);
  const dialog = await openDialog(page, title);
  await dialog.getByRole("button", { name: SCAN, exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(QQ_REFUSED);

  // Second press, this time the route mints a task: the line goes when the attempt begins, and the
  // code that attempt produced is what stands there instead.
  state.answer = "pending";
  await dialog.getByRole("button", { name: SCAN, exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.getByRole("img", { name: "QQ 机器人授权二维码" })).toBeVisible();
  expect(state.seen).toHaveLength(2);
  expect(console_.unexpected()).toEqual([]);
});

test("a poll loop that gives up says so on the card", async ({ page }) => {
  const console_ = watchConsole(page);
  await provisionAndLogin(page.request, "scanpoll", P);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const title = `e2e scan poll ${Date.now()}`;
  await seed(page, projectId, title, `scan-poll-${Date.now()}`);

  // The start succeeds; every poll fails, and the third one takes the code down.
  const state = { seen: [], polls: 0, verifies: [], answer: "ok" };
  await stubScan(page, "qq", state);
  const dialog = await openDialog(page, title);
  await dialog.getByRole("button", { name: SCAN, exact: true }).click();
  await expect(dialog.getByRole("img", { name: "QQ 机器人授权二维码" })).toBeVisible();

  await expect(dialog.getByRole("alert")).toHaveText(QQ_REFUSED, { timeout: 15_000 });
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  // The code was abandoned on the third consecutive failure, not on the first.
  expect(state.polls).toBeGreaterThanOrEqual(3);
  // And it stays: the reason outlives the six seconds a toast would have lived.
  await page.waitForTimeout(7_000);
  await expect(dialog.getByRole("alert")).toHaveText(QQ_REFUSED);
  expect(console_.unexpected()).toEqual([]);
});

test("WeChat's refused pairing code stays beside its input", async ({ page }) => {
  const console_ = watchConsole(page);
  await provisionAndLogin(page.request, "scanverify", P);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const title = `e2e scan verify ${Date.now()}`;
  await seed(page, projectId, title, `scan-verify-${Date.now()}`);

  // WeChat asks for the digits on every poll until they are accepted, so the QR stays up — which is
  // why this one fault belongs under the input rather than where the button used to be.
  const state = { seen: [], polls: 0, verifies: [], answer: "verify" };
  await stubScan(page, "wechat", state);
  const dialog = await openDialog(page, title);
  await dialog.getByRole("button", { name: "微信", exact: true }).click();
  await dialog.getByRole("button", { name: SCAN, exact: true }).click();

  const code = dialog.getByLabel("配对码");
  await expect(code).toBeVisible();
  await code.fill("123456");
  await dialog.getByRole("button", { name: "确认", exact: true }).click();

  await expect(dialog.getByRole("alert")).toHaveText("扫码连接失败：服务器内部错误，请稍后重试。");
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.verifies).toHaveLength(1);
  // The QR is still up: the code is still the thing being authorized.
  await expect(dialog.getByRole("img", { name: "微信机器人授权二维码" })).toBeVisible();

  // Editing the digits retires the sentence — it described the ones that were refused.
  await code.fill("654321");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  expect(console_.unexpected()).toEqual([]);
});
