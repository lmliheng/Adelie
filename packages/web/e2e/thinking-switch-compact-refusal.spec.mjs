/**
 * "Compact, then switch" whose compaction could not be started keeps the question open, with the
 * reason inside the card and nothing done.
 *
 * The mid-chat thinking-level switch asks first (issue #310): compact the context, then switch (the
 * recommended, cheap path), switch anyway, or cancel. The compaction is only STARTED by that press —
 * `POST /compact` answers 202 and the outcome arrives later over the stream — so the server can also
 * refuse to start it (`nothing_to_compact`, no compaction configured, a task already running, …).
 *
 * That refusal used to close the card and release the pick on the next pass: the level switched
 * anyway, and the reason lived in a notification that dismissed itself after six seconds. Both
 * halves of what the press asked for are wrong there — the reader chose the cheap path and got the
 * expensive one without being told past six seconds. Now the card stays open on the same pick with
 * the sentence under its own question ("could not compact first — the level is still <x>: <why>"),
 * so "switch anyway" is a choice the reader makes knowing what it costs, and cancel really leaves
 * everything as it was.
 *
 * The refusal is stubbed with a code the interface has its own copy for plus an English wire
 * message, so the test tells the localized sentence from the raw one.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const MODEL = "claude-4-8";
/** The mock's turn-2 answer (mock-llm.mjs): the round is over and the Session idle. */
const REPLY = "Command finished; the result looks as expected.";
/** The refusal: a code the interface translates, plus a message that must not reach the page. */
const REFUSAL = { code: "internal", message: "RAW ENGLISH SERVER MESSAGE" };
/** The line the page draws for that code (S.errors.byCode), after what failed. */
const REASON = "服务器内部错误，请稍后重试。";
/** The level the card must say is still in force (the Agent's default, untouched). */
const STILL = "中";

const thinkingBtn = (page) => page.getByRole("button", { name: "思考等级" });
const card = (page) => page.getByRole("dialog", { name: "切换思考等级" });
const refusalStrip = (page) => card(page).getByRole("alert");
const notifications = (page) => page.getByRole("region", { name: "通知" });
const composer = (page) => page.getByPlaceholder(/输入消息/);

/** Provision the user, aim the Project's model at the mock, and hand back its id. */
async function setUp(page, user) {
  await provisionAndLogin(page.request, user, P);
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
  const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
    data: {
      defaultModel: { provider: "custom", modelId: MODEL },
      models: [
        {
          provider: "custom",
          modelId: MODEL,
          apiKey: "sk-mock",
          baseUrl: MOCK,
          contextWindow: 200000,
        },
      ],
    },
  });
  expect(put.ok(), "put models").toBeTruthy();
  return projectId;
}

/** A Session with one finished round, so a level switch has history to ask about. */
async function sessionWithConversation(page, projectId) {
  const created = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
    { data: { provider: "custom", modelId: MODEL, approvalMode: "allow-all" } },
  );
  expect(created.ok(), "create session").toBeTruthy();
  const sessionId = (await created.json()).session.sessionId;
  await page.goto(`${BASE}/chat/${sessionId}`);
  const box = composer(page);
  await box.waitFor();
  await box.fill("hello");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText(REPLY).first()).toBeVisible();
  // Idle: the picker is disabled while a round runs, so an enabled trigger is an idle Session.
  await expect(thinkingBtn(page)).toBeEnabled();
  await expect(thinkingBtn(page)).toContainText(STILL);
  return sessionId;
}

/** Pick a level from the picker's menu and hand back the confirm card the pick stages. */
async function askToSwitch(page) {
  await thinkingBtn(page).click();
  await page.getByRole("button", { name: "高 (high)", exact: true }).click();
  const dialog = card(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * Nothing was raised in the notification region, read after the card's own render landed.
 *
 * `toHaveCount(0)` retries for the whole expect timeout, so it also passes against a toast that
 * simply expired after six seconds — the very behaviour this file is about.
 */
async function expectNoToast(page) {
  await page.waitForTimeout(400);
  expect(await notifications(page).getByRole("button").count()).toBe(0);
}

test("a refused compaction keeps the card and its reason, and does not switch behind the reader", async ({
  page,
}) => {
  const projectId = await setUp(page, "switchcompactrefuse");
  const sessionId = await sessionWithConversation(page, projectId);

  const compactions = [];
  await page.route("**/api/sessions/*/compact", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    compactions.push(route.request().url());
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
  const pins = [];
  page.on("request", (req) => {
    if (req.method() === "PATCH" && new URL(req.url()).pathname === `/api/sessions/${sessionId}`) {
      pins.push(req.postDataJSON() ?? {});
    }
  });

  const dialog = await askToSwitch(page);
  await dialog.getByRole("button", { name: "压缩后切换", exact: true }).click();

  // The card is still the thing on screen, and the reason is its own — not page-level news.
  await expect(dialog).toBeVisible();
  const strip = refusalStrip(page);
  await expect(strip).toBeVisible();
  await expect(strip).toHaveText(`没能先压缩上下文，思考等级仍是「${STILL}」：${REASON}`);
  await expect(strip).not.toContainText("RAW");
  await expectNoToast(page);

  // Nothing was written: the trigger still reads the level it read before, and no pin was sent.
  await expect(thinkingBtn(page)).toContainText(STILL);
  expect(pins).toHaveLength(0);
  // One press, one request — and the other two choices are still one click away.
  expect(compactions).toHaveLength(1);
  await expect(dialog.getByRole("button", { name: "仍要切换", exact: true })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "取消", exact: true })).toBeEnabled();

  // Past the six seconds a notification lived: the card and its sentence are still there.
  await page.waitForTimeout(7000);
  await expect(strip).toBeVisible();
  await expect(strip).toHaveText(`没能先压缩上下文，思考等级仍是「${STILL}」：${REASON}`);

  // "Switch anyway" is now a deliberate choice, and it lands on the Session.
  const pinned = page.waitForResponse(
    (r) =>
      r.request().method() === "PATCH" &&
      new URL(r.url()).pathname === `/api/sessions/${sessionId}`,
  );
  await dialog.getByRole("button", { name: "仍要切换", exact: true }).click();
  expect((await pinned).request().postDataJSON()).toMatchObject({ thinkingLevel: "high" });
  await expect(dialog).toHaveCount(0);
  await expect(thinkingBtn(page)).toContainText("高");
});

test("cancelling after the refusal changes nothing, and the next pick asks afresh", async ({
  page,
}) => {
  const projectId = await setUp(page, "switchcompactcancel");
  const sessionId = await sessionWithConversation(page, projectId);

  await page.route("**/api/sessions/*/compact", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  let dialog = await askToSwitch(page);
  await dialog.getByRole("button", { name: "压缩后切换", exact: true }).click();
  await expect(refusalStrip(page)).toBeVisible();

  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(thinkingBtn(page)).toContainText(STILL);
  const row = await (await page.request.get(`${BASE}/api/sessions/${sessionId}`)).json();
  expect(row.session.thinkingLevel ?? null).not.toBe("high");

  // A fresh pick is a fresh question: the sentence the last attempt left does not come back.
  dialog = await askToSwitch(page);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
});
