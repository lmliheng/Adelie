/**
 * Regression: the messaging card's "send test message" button says why a message did not go out —
 * in the card, under that button — instead of leaving the card untouched with the reason in a
 * notification that dismissed itself after six seconds.
 *
 * The button puts one fixed line into the chat the connection already knows and writes nothing, so
 * a refused message leaves a card that looks exactly as it did before the press; six seconds later
 * the sentence used to be gone with nothing on the card saying the button had been pressed at all.
 * The connection it went through (the bot's state, its membership, the platform's reply window) is
 * the rows right above it.
 *
 * Both the send route and the `GET …/messaging` read are stubbed: the button is only pressable for
 * a channel that is `connected` with a known chat, and neither can be produced without a live
 * platform — while what this spec measures is what the page does with the answer. Nothing here
 * reaches the internet.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";

/** Where the stub binding claims its connector dials: nothing listens on port 9, so nothing leaves the machine. */
const DEAD_ORIGIN = "http://127.0.0.1:9";
/** The row menu action that opens the dialog (`S.messaging.bindAction`). */
const OPEN = "远程控制";
/** The send button (`S.messaging.sendTestMessage`). */
const SEND = "发送测试消息";
/** The platform's own words for a message it would not take. */
const PLATFORM_DETAIL = "Bot is not a member of this chat.";
/** The line the card draws: the sentence's lead-in plus those words. */
const REFUSED_LINE = `测试消息没有发出去：${PLATFORM_DETAIL}`;
/** The success toast (`S.messaging.testMessageSent`). */
const SENT_TOAST = "测试消息已发送";
/**
 * The line for an exchange that never completed (`S.messaging.testMessageUnconfirmed` with the
 * client's own `network_error` sentence): it must not claim the message was not sent, because the
 * server may have delivered it with only its answer lost.
 */
const UNCONFIRMED_LEAD = "没能确认测试消息是否已送达：";

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

  // The stored credential is what makes the card's credential section real; the read that follows
  // is stubbed, because "connected, with a known chat" cannot be produced without a live platform.
  const bound = await page.request.put(`${BASE}/api/sessions/${sessionId}/messaging/feishu`, {
    data: { appId, appSecret: "probe-app-secret", baseDomain: DEAD_ORIGIN },
  });
  expect(bound.ok(), "bind feishu").toBeTruthy();
  return sessionId;
}

/** A saved Feishu binding as the read reports it, with the two facts that enable the send button. */
function connectedFeishu(sessionId, appId) {
  return {
    bindings: [
      {
        binding: {
          sessionId,
          channel: "feishu",
          appId,
          appSecretMasked: "probe-app-secret",
          baseDomain: DEAD_ORIGIN,
          enabled: true,
          linePerMessage: false,
          finalReplyOnly: false,
          renderMarkdown: true,
          lastChatKnown: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        status: { state: "connected", changedAt: new Date().toISOString() },
      },
    ],
  };
}

/**
 * Take over the binding read and the send route. `state.answer` picks what the send does:
 * `"refuse"` (the platform's rejection, the route's 502 shape), `"answer-missing"` (the exchange
 * never completes) or `"ok"`; every call records the request, so a test can count the presses.
 */
async function stubSend(page, sessionId, appId, state) {
  await page.route("**/api/sessions/*/messaging", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(connectedFeishu(sessionId, appId)),
    });
  });
  await page.route("**/api/sessions/*/messaging/feishu/test-message", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    state.seen.push(route.request().postData());
    if (state.answer === "answer-missing") {
      // What the browser raises when the exchange never completes; the client turns it into its
      // own status-0 `network_error`, and the message may well have been delivered by then.
      await route.abort("connectionreset");
      return;
    }
    if (state.answer === "refuse") {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "feishu_send_failed", message: PLATFORM_DETAIL } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
}

/**
 * Collect the page's console errors. The dialog's own poll touches `/api/projects/…/machines`,
 * which answers 403 to anyone but an administrator, and these tests answer 502 / abort on purpose
 * — the app's normal behaviour for this account and the answer under test — so those are
 * recognised by status and path and everything else fails.
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
        if (status === "502" && url.includes("/messaging/")) return false;
        if (url.includes("/messaging/") && /ERR_CONNECTION_RESET|Failed to fetch/.test(text)) {
          return false;
        }
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

test("a refused test message keeps its reason under the buttons, and only there", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await provisionAndLogin(page.request, "sendtest", P);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const title = `e2e refused send ${Date.now()}`;
  const appId = `send-refused-${Date.now()}`;
  const sessionId = await seed(page, projectId, title, appId);

  const state = { seen: [], answer: "refuse" };
  await stubSend(page, sessionId, appId, state);
  const dialog = await openDialog(page, title);

  const send = dialog.getByRole("button", { name: SEND, exact: true });
  await expect(send).toBeEnabled();
  await send.click();

  // The sentence sits in the card, under the row, exactly once — in the platform's own words.
  await expect(dialog.getByRole("alert")).toHaveText(REFUSED_LINE);
  await expect(dialog.getByRole("alert")).toHaveCount(1);
  // Not a toast: the notification region holds nothing to dismiss.
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  // The press went through the selected channel's own route, once.
  expect(state.seen).toHaveLength(1);

  // Six seconds is how long a toast lives; this line has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(dialog.getByRole("alert")).toHaveText(REFUSED_LINE);
  // The button is the retry: still pressable with the sentence on screen.
  await expect(send).toBeEnabled();
  expect(console_.unexpected()).toEqual([]);
});

test("the same button is the retry, and a message that lands clears the sentence", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await provisionAndLogin(page.request, "sendretry", P);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const title = `e2e retried send ${Date.now()}`;
  const appId = `send-retried-${Date.now()}`;
  const sessionId = await seed(page, projectId, title, appId);

  const state = { seen: [], answer: "refuse" };
  await stubSend(page, sessionId, appId, state);
  const dialog = await openDialog(page, title);
  await dialog.getByRole("button", { name: SEND, exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(REFUSED_LINE);

  // Editing the credentials does NOT clear this line: the message went through the stored binding,
  // not through the draft, so what it says is still true.
  await dialog.getByLabel("App ID", { exact: true }).fill("cli_send_edited");
  await expect(dialog.getByRole("alert")).toHaveText(REFUSED_LINE);

  // Same button, second press: this time the chat takes the message, so the sentence goes away
  // and the ordinary confirmation arrives.
  state.answer = "ok";
  await dialog.getByRole("button", { name: SEND, exact: true }).click();
  await expect(notifications(page).getByText(SENT_TOAST)).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  expect(state.seen).toHaveLength(2);
  expect(console_.unexpected()).toEqual([]);
});

test("a send whose exchange never completed says so instead of claiming it did not go out", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await provisionAndLogin(page.request, "sendlost", P);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const title = `e2e lost send ${Date.now()}`;
  const appId = `send-lost-${Date.now()}`;
  const sessionId = await seed(page, projectId, title, appId);

  const state = { seen: [], answer: "answer-missing" };
  await stubSend(page, sessionId, appId, state);
  const dialog = await openDialog(page, title);
  await dialog.getByRole("button", { name: SEND, exact: true }).click();

  // Nobody on this side saw an answer, so the line must not say the message was not sent.
  const alert = dialog.getByRole("alert");
  await expect(alert).toContainText(UNCONFIRMED_LEAD);
  await expect(alert).not.toContainText("测试消息没有发出去");
  // The same wording the app uses for a failed exchange, inside the sentence that says so.
  await expect(alert).toContainText("网络错误，请检查连接");
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.seen).toHaveLength(1);
  expect(console_.unexpected()).toEqual([]);
});
