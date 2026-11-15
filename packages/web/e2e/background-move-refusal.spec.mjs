/**
 * A refused "send to background" on an executing tool call says why, under the row that asked.
 *
 * Once an `exec_command` or `run_subagent` call has been executing for ten seconds its row offers
 * the action; the route then answers 204 (moved), 404 (the call stopped in the click's race
 * window) or 409 (the tool has no background form) — and the card settles by itself for the last
 * two, so neither is worth a word. Anything else is a real failure, and the reason used to arrive
 * as a notification that dismissed itself after six seconds while the row looked exactly as it had
 * before the press: the action was still there, still enabled, and nothing said why pressing it
 * changed nothing.
 *
 * The mock's "background move test" branch runs `sleep 45` inside a 60 s yield window, so the call
 * stays in the foreground past the gate (see mock-llm.mjs). The POST is refused at `page.route`,
 * so the detach never reaches the server.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const U = "bgmoveuser";
const REFUSED = { code: "internal", message: "internal error" };

/** The notification region: a refused action must be said on the row, not announced up here. */
const notifications = (page) => page.getByRole("region", { name: "通知" });

/**
 * Nothing was raised in the notification region for this refusal, read at once.
 *
 * `toHaveCount(0)` retries for the whole expect timeout, so it also passes against a toast that
 * simply expired after six seconds — the very behaviour this file is about. This reads the count
 * once, after a short settle so the refusal's own render has landed.
 */
async function expectNoToast(page) {
  await page.waitForTimeout(400);
  expect(await notifications(page).getByRole("button").count()).toBe(0);
}

/**
 * Provision the user, aim the Project's model at the mock, and open a fresh Session (allow-all:
 * the command runs without an approval stop), returning the Session id.
 */
async function sessionWithMock(page) {
  await provisionAndLogin(page.request, U, P);
  const { projects } = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects[0].projectId;
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
        },
      ],
    },
  });
  expect(put.ok(), "put models").toBeTruthy();
  const created = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
    { data: { provider: "custom", modelId: "claude-4-8", approvalMode: "allow-all" } },
  );
  expect(created.ok(), "create session").toBeTruthy();
  return (await created.json()).session.sessionId;
}

/** Start the mock's long foreground command and wait for the row's action (it needs 10 s). */
async function startAndWaitForAction(page) {
  await page.getByPlaceholder(/输入消息/).fill("background move test");
  await page.getByRole("button", { name: "发送" }).click();
  const action = page.getByRole("button", { name: "转入后台执行" });
  await expect(action).toBeVisible({ timeout: 40_000 });
  return action;
}

test("a refused move says why under the row, stays there, and the action is still the retry", async ({
  page,
}) => {
  const sessionId = await sessionWithMock(page);
  await page.goto(`${BASE}/chat/${sessionId}`);
  const action = await startAndWaitForAction(page);

  await page.route("**/api/sessions/*/tool-calls/*/background", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSED }),
    }),
  );

  await action.click();
  const refusal = page.getByTestId("tool-call-refusal");
  await expect(refusal).toBeVisible();
  // The dictionary's sentence, not the wire's English; the action is still offered one line above.
  await expect(refusal).toHaveText("没能把这次调用转入后台：服务器内部错误，请稍后重试。");
  await expect(refusal).toHaveAttribute("role", "alert");
  await expect(action).toBeVisible();
  await expectNoToast(page);

  // It does not dismiss itself: the retry it belongs to is still on screen seven seconds later.
  await page.waitForTimeout(7000);
  await expect(refusal).toBeVisible();
  await expect(action).toBeVisible();

  // Let the same button through: the move lands, and the sentence goes with the action.
  await page.unroute("**/api/sessions/*/tool-calls/*/background");
  await action.click();
  await expect(refusal).toHaveCount(0, { timeout: 15_000 });
  await expect(action).toHaveCount(0, { timeout: 15_000 });
  // The server handed the work back: the command is in the Session's process list.
  const { processes } = await (
    await page.request.get(`${BASE}/api/sessions/${sessionId}/processes`)
  ).json();
  expect(processes.some((p) => String(p.cmd).includes("sleep 45"))).toBe(true);
});

test("a call that stopped, or a tool with no background form, is not worth a word", async ({
  page,
}) => {
  const sessionId = await sessionWithMock(page);
  await page.goto(`${BASE}/chat/${sessionId}`);
  const action = await startAndWaitForAction(page);

  // 409 is the shape a tool without a background form answers; the row settles by itself.
  await page.route("**/api/sessions/*/tool-calls/*/background", (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "tool_not_detachable", message: "no background form" },
      }),
    }),
  );

  await action.click();
  await page.waitForTimeout(1200);
  expect(await page.getByTestId("tool-call-refusal").count()).toBe(0);
  await expectNoToast(page);
});
