/**
 * A refused approval decision keeps its reason inside the block that is still asking.
 *
 * Pressing allow/deny is one POST, and the catch behind it used to answer only 404 and drop
 * everything else: a 500 left the approval block exactly as it looked before the press — both
 * buttons, still enabled, still asking — with no sentence anywhere, not even a notification. The
 * press had not registered and nothing said so.
 *
 * Now the reason is drawn inside that block, above the two buttons (which are the retry, because
 * nothing was written), and a 404 — the call settled, or another window decided it — still says
 * nothing: the block goes on that same answer, so a sentence would outlive its subject.
 *
 * The mock's default first turn is thinking + text + tool_use(exec_command `ls -la`), so under
 * `always-ask` the conversation parks on a real approval point. The POST is refused at
 * `page.route`, so the decision never reaches the server.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const AGENT = "default_agent";

/** The refusal: a code the interface translates, plus a message that must not reach the page. */
const REFUSED = { code: "internal", message: "RAW ENGLISH SERVER MESSAGE" };
/** The line the page draws for that code, after what failed (S.chat.approvalAnswerRefused). */
const EXPECTED = "没能把「允许」交给服务器，这次调用仍在等你回答：服务器内部错误，请稍后重试。";

/** The notification region: a refused decision must be said in the block, not announced up here. */
const notifications = (page) => page.getByRole("region", { name: "通知" });

/**
 * Nothing was raised in the notification region, read at once.
 *
 * `toHaveCount(0)` retries for the whole expect timeout, so it would also pass against a toast
 * that expired after six seconds — the behaviour this file exists to rule out. This reads the
 * count once, after a short settle so the refusal's own render has landed.
 */
async function expectNoToast(page) {
  await page.waitForTimeout(400);
  expect(await notifications(page).getByRole("button").count()).toBe(0);
}

/**
 * Provision the user, aim the Project's model at the mock, and open a Session that stops for
 * approval on every tool call. Returns the Session id.
 */
async function sessionAwaitingApproval(page, user) {
  await provisionAndLogin(page.request, user, "password123");
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
    `${BASE}/api/projects/${projectId}/agents/${AGENT}/sessions`,
    { data: { provider: "custom", modelId: "claude-4-8", approvalMode: "always-ask" } },
  );
  expect(created.ok(), `create session: ${await created.text()}`).toBeTruthy();
  return (await created.json()).session.sessionId;
}

/** Send the mock's default turn and wait for the approval block's two buttons. */
async function sendAndWaitForApproval(page) {
  await page.getByPlaceholder(/输入消息/).fill("请看一下目录");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByRole("button", { name: "允许" })).toBeVisible({ timeout: 30_000 });
}

test("a refused decision says why in the block, stays there, and the buttons are still the retry", async ({
  page,
}) => {
  const sessionId = await sessionAwaitingApproval(page, "approveuser");
  await page.goto(`${BASE}/chat/${sessionId}`);
  await sendAndWaitForApproval(page);

  await page.route("**/api/sessions/*/approvals/*", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSED }),
    }),
  );

  await page.getByRole("button", { name: "允许" }).click();
  const refusal = page.getByTestId("approval-refusal");
  await expect(refusal).toBeVisible();
  // The dictionary's sentence, not the wire's English, and it says the call still waits.
  await expect(refusal).toHaveText(EXPECTED);
  await expect(refusal).toHaveAttribute("role", "alert");
  await expect(refusal).not.toContainText("RAW ENGLISH");
  // Nothing was written: both buttons are still here, and both are pressable again.
  await expect(page.getByRole("button", { name: "允许" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "拒绝" })).toBeEnabled();
  await expectNoToast(page);

  // It does not dismiss itself: the retry it belongs to is still on screen seven seconds later.
  await page.waitForTimeout(7000);
  await expect(refusal).toBeVisible();
  await expect(page.getByRole("button", { name: "允许" })).toBeVisible();

  // Let the same button through: the decision lands, the sentence goes, the turn runs on.
  await page.unroute("**/api/sessions/*/approvals/*");
  await page.getByRole("button", { name: "允许" }).click();
  await expect(refusal).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText("Command finished; the result looks as expected.")).toBeVisible({
    timeout: 30_000,
  });
});

test("a call that already settled is not worth a word", async ({ page }) => {
  const sessionId = await sessionAwaitingApproval(page, "approveuser2");
  await page.goto(`${BASE}/chat/${sessionId}`);
  await sendAndWaitForApproval(page);

  // 404 is the shape a call that finished (or another window's decision) answers: the pending
  // entry goes with it, so the block disappears and nothing is said about it.
  await page.route("**/api/sessions/*/approvals/*", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "tool_call_not_found", message: "no such pending tool call" },
      }),
    }),
  );

  await page.getByRole("button", { name: "允许" }).click();
  await expect(page.getByRole("button", { name: "允许" })).toHaveCount(0, { timeout: 20_000 });
  expect(await page.getByTestId("approval-refusal").count()).toBe(0);
  await expectNoToast(page);
});
