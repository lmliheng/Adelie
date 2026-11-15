/**
 * Regression: a `/model` switch that does not get out keeps the reason above the input card, instead
 * of in a notification that dismisses itself after six seconds.
 *
 * A staged `/model` target turns the composer's Send into "open a NEW conversation on this model and
 * post the draft there". The press writes nothing into the conversation on screen: when it is
 * refused the empty conversation it may have created is deleted again, the draft and the chip stay
 * on the card, and that button IS the retry — so the sentence belongs there (7.19's rule), the same
 * slot an ordinary send and a refused `/agent` handoff use.
 *
 * Two shapes, two sentences, because the press writes different things:
 * - an ordinary conversation forks; nothing is written, so the sentence names the picked model and
 *   says this conversation is unchanged;
 * - a DESK (an employee's standing session) writes the picked model to the org chart and renews the
 *   desk onto it BEFORE posting, so a refusal can land after that write. Its sentence must not claim
 *   the chart was left alone: it says the message was not sent and points at the chart, which the
 *   page reloads as it draws the line.
 *
 * The refusals are stubbed at the page's own writes (`POST …/agents/<id>/sessions` for the fork,
 * `PATCH …/employees/<agent>` for the desk) with an English wire message, so the test can tell the
 * interface's localized sentence from the raw one.
 */
import { test, expect, request } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
/** The source conversation runs on this one; the switch forks onto `MODEL`. */
const CURRENT = "claude-4-8-mini";
const MODEL = "claude-4-8";
/** The model a desk is renewed onto. */
const DESK_TARGET = "claude-4-9";
const MESSAGE = "这条先换不了模型";
/** The interface's own sentence for `internal`; the stubbed English message must never reach it. */
const INTERNAL = "服务器内部错误，请稍后重试。";
/** The interface's own words for the missing credential, which name the model. */
const CREDENTIAL = `模型 ${MODEL} 还没有可用的 API key，请先在「模型」页为它配置`;
/** A message that must not reach the page: only the interface's own words may. */
const RAW = "RAW ENGLISH SERVER MESSAGE";

const notifications = (page) => page.getByRole("region", { name: "通知" });
const refusalLine = (page) => page.getByTestId("send-refusal");
const sendButton = (page) => page.getByRole("button", { name: "发送", exact: true });
const composer = (page) => page.getByPlaceholder(/输入消息/);
/** The staged `/model` chip's own ×: the chip is there while that button is. */
const modelChip = (page) => page.getByRole("button", { name: "移除换模型目标" });

/**
 * Nothing was raised in the notification region, read once after the refusal's own render landed.
 *
 * `toHaveCount(0)` retries for the whole expect timeout, so it also passes against a toast that
 * simply expired after six seconds — the very behaviour this file is about.
 */
async function expectNoToast(page) {
  await page.waitForTimeout(400);
  expect(await notifications(page).getByRole("button").count()).toBe(0);
}

/** Point the Project's models at the mock, so both a conversation and a desk can actually run. */
async function putModels(page, projectId, entries, defaultModel) {
  const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
    data: { defaultModel, models: entries },
  });
  expect(put.ok(), "put models").toBeTruthy();
}

const mockModel = (modelId) => ({
  provider: "custom",
  modelId,
  apiKey: "sk-mock",
  baseUrl: MOCK,
  contextWindow: 200000,
});

/** An ordinary conversation on `CURRENT`, with a second model configured to switch onto. */
async function setUp(page, user) {
  await provisionAndLogin(page.request, user, P);
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
  await putModels(page, projectId, [mockModel(CURRENT), mockModel(MODEL)], {
    provider: "custom",
    modelId: CURRENT,
  });
  const created = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
    { data: { provider: "custom", modelId: CURRENT, approvalMode: "allow-all" } },
  );
  expect(created.ok(), "create session").toBeTruthy();
  const sessionId = (await created.json()).session.sessionId;
  return { projectId, sessionId };
}

/** Every conversation the default agent holds: a refusal must not leave one behind. */
async function sessionCount(page, projectId) {
  const res = await page.request.get(
    `${BASE}/api/projects/${projectId}/agents/default_agent/sessions?limit=100`,
  );
  expect(res.ok(), "list sessions").toBeTruthy();
  return (await res.json()).sessions.length;
}

/**
 * Open the conversation, stage the `/model` target through the real command, and type the message —
 * everything past the stub is the user's own path.
 */
async function stageModelSwitch(page, sessionId, query = MODEL) {
  await page.goto(`${BASE}/chat/${sessionId}`);
  const box = composer(page);
  await expect(box).toBeVisible();
  await box.fill("/model");
  await box.press("Enter");
  // The model-picker dialog, named for what /model does (it has no visible title bar).
  await expect(page.getByRole("dialog", { name: "换模型开新会话" })).toBeVisible();
  await page.getByPlaceholder(/搜索模型/).fill(query);
  // A model equal to the session's own is dropped, so the row picked must not be the mini variant
  // (both ids share the `claude-4-8` prefix).
  await page
    .getByRole("button", { name: new RegExp(query) })
    .filter({ hasNotText: "mini" })
    .click();
  await expect(modelChip(page)).toBeVisible();
  await box.fill(MESSAGE);
  return box;
}

/** Refuse the next conversation creation with `code`, recording each attempt's body. */
async function refuseSessionCreates(page, writes, error) {
  await page.route("**/api/projects/*/agents/*/sessions", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    writes.push(route.request().postDataJSON());
    return route.fulfill({
      status: error.status,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: error.code, message: RAW } }),
    });
  });
}

test("a refused model fork keeps the reason above the card, past six seconds", async ({ page }) => {
  const { projectId, sessionId } = await setUp(page, "modelswitchrefusaluser");
  const box = await stageModelSwitch(page, sessionId);
  const before = await sessionCount(page, projectId);

  const writes = [];
  await refuseSessionCreates(page, writes, { status: 500, code: "internal" });

  await sendButton(page).click();
  const line = refusalLine(page);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(`没能用 ${MODEL} 开一个新对话，本会话保持不变：${INTERNAL}`);
  // The interface's own words for that code, never the server's English message.
  await expect(line).not.toContainText("RAW");
  await expectNoToast(page);

  // Where it sits: above the card that asked, so the button pressed is still under it.
  const lineBox = await line.boundingBox();
  const cardBox = await box.boundingBox();
  expect(lineBox.y + lineBox.height).toBeLessThanOrEqual(cardBox.y + 1);

  // Nothing was forked and nothing was left behind: one attempt, no new conversation, the draft and
  // the chip both still on the card.
  expect(writes).toHaveLength(1);
  expect(await sessionCount(page, projectId)).toBe(before);
  await expect(box).toHaveValue(MESSAGE);
  await expect(modelChip(page)).toBeVisible();
  await expect(sendButton(page)).toBeEnabled();

  // Past the six seconds a notification lived: the sentence is still above the card.
  await page.waitForTimeout(7000);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(`没能用 ${MODEL} 开一个新对话，本会话保持不变：${INTERNAL}`);

  // The retry is the same button: this fork goes through, and lands in a new conversation on the
  // picked model.
  await page.unrouteAll();
  await sendButton(page).click();
  await expect(page).toHaveURL(new RegExp(`/chat/(?!${sessionId}$)[\\w-]+$`));
  await expect(page.getByText(MESSAGE)).toBeVisible();
  const forked = page.url().split("/chat/")[1];
  const detail = await (await page.request.get(`${BASE}/api/sessions/${forked}`)).json();
  expect(detail.session.modelId).toBe(MODEL);
});

test("a fork refused for a missing credential names the model that was picked", async ({
  page,
}) => {
  const { sessionId } = await setUp(page, "modelswitchrefusalmodel");
  const box = await stageModelSwitch(page, sessionId);

  const writes = [];
  await refuseSessionCreates(page, writes, { status: 400, code: "model_credential_missing" });

  await sendButton(page).click();
  const line = refusalLine(page);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(`没能用 ${MODEL} 开一个新对话，本会话保持不变：${CREDENTIAL}`);
  // One attempt, one sentence: a second refusal replaces the first rather than stacking on it.
  await expect(line).toHaveCount(1);
  await expectNoToast(page);
  await expect(box).toHaveValue(MESSAGE);
  await expect(modelChip(page)).toBeVisible();
});

/** The admin master switch, off by default: turned on server-wide before the desk is set up. */
async function enableCompanyMode() {
  const adminCtx = await request.newContext();
  try {
    await login(adminCtx, ADMIN_ID, ADMIN_PASSWORD);
    const res = await adminCtx.put(`${BASE}/api/admin/settings`, { data: { companyMode: true } });
    if (!res.ok()) {
      throw new Error(`enable company mode failed: ${res.status()} ${await res.text()}`);
    }
  } finally {
    await adminCtx.dispose();
  }
}

test("a desk whose model switch is refused never claims the org chart was left alone", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await enableCompanyMode();
  // Unique per run: the organization belongs to the user, so a rerun on the same data root must
  // start from a fresh one.
  const user = `deskrefusal_${Date.now().toString(36)}`;
  await provisionAndLogin(page.request, user, P);
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
  await putModels(page, projectId, [mockModel(MODEL), mockModel(DESK_TARGET)], {
    provider: "custom",
    modelId: MODEL,
  });

  // Company mode on for this user, so its organization's desk conversation is reachable.
  await page.goto("/");
  const modeSwitch = page.getByRole("group", { name: "工作模式" });
  await expect(modeSwitch).toBeVisible();
  await modeSwitch.getByRole("button", { name: /^公司/ }).click();
  await expect(page).toHaveURL(/\/org/);

  // A real organization, with a real CEO desk, created through the API (the flow itself is
  // company.spec's subject); the mock answers the CEO's initialization run.
  const orgId = `deskorg_${Date.now().toString(36)}`;
  const created = await page.request.post(`${BASE}/api/projects/${projectId}/organizations`, {
    data: { orgId, name: "Desk Refusal", mission: "做一个小工具，验证工位换模型被拒时的说法。" },
  });
  expect(created.ok(), "create organization").toBeTruthy();
  const org = await created.json();
  const deskId = org.ceoDeskSessionId;
  expect(deskId, "the organization opened a CEO desk").toBeTruthy();

  // The desk must be idle: `/model` is offered on an idle Session only, and the initialization run
  // is still going when the organization is made.
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`${BASE}/api/sessions/${deskId}`);
        return (await res.json()).session.status;
      },
      { timeout: 120_000 },
    )
    .toBe("idle");

  const box = await stageModelSwitch(page, deskId, DESK_TARGET);

  // The write that lands first: the employee's model. Refused here, so the desk is never renewed,
  // but the sentence still may not promise the chart is untouched.
  const patches = [];
  await page.route("**/api/projects/*/organizations/*/employees/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    patches.push(route.request().postDataJSON());
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal", message: RAW } }),
    });
  });

  await sendButton(page).click();
  const line = refusalLine(page);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(
    `没能把这张桌子换到 ${DESK_TARGET}，这条消息没有发出；桌子现在用哪个模型以组织图为准：${INTERNAL}`,
  );
  await expect(line).not.toContainText("本会话保持不变");
  await expect(line).not.toContainText("RAW");
  await expectNoToast(page);

  // The card kept what the retry needs, and the attempt went as far as the chart write and no
  // further: no new desk, nothing dropped.
  expect(patches).toHaveLength(1);
  expect(patches[0].model).toEqual({ provider: "custom", modelId: DESK_TARGET });
  await expect(box).toHaveValue(MESSAGE);
  await expect(modelChip(page)).toBeVisible();
  await expect(sendButton(page)).toBeEnabled();

  // The chart still names the model the desk really runs on — the sentence pointed the reader there.
  // An absent `model` is the Project default, which is what this desk was opened on.
  const chart = await (
    await page.request.get(`${BASE}/api/projects/${projectId}/organizations/${orgId}/chart`)
  ).json();
  const employee = chart.employees.find((e) => e.agentId === `${orgId}_ceo`);
  expect(employee.model?.modelId ?? MODEL).toBe(MODEL);

  // Past the six seconds a notification lived: the sentence is still above the card.
  await page.waitForTimeout(7000);
  await expect(line).toBeVisible();
  await expect(line).not.toContainText("本会话保持不变");
});
