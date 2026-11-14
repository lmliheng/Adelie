/**
 * A refused recall of a queued message says so under the line that was pressed.
 *
 * The 撤回 button on a queued steering / follow-up line withdraws the entry server-side and puts
 * its content back into the composer. When the DELETE is refused, the line itself does not move:
 * same content, same button — so that button is the retry, and the reason belongs with it. It used
 * to arrive as a notification that dismissed itself after six seconds while the composer looked as
 * if the press had never happened (7.19's rule: the sentence stays where the attempt was made).
 *
 * The refusal is refused at `page.route`, so the queue the server holds is never touched: every
 * assertion below can also read it back through the API, which is how "nothing was withdrawn" is
 * checked rather than inferred from the pixels.
 *
 * The LLM is mock-llm.mjs's "slow stream test": a ~8s exec_command keeps the Task busy, which is
 * the window a message can be queued in at all.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";

const REFUSAL = '[data-testid="queued-recall-refusal"]';
const notifications = (page) => page.getByRole("region", { name: "通知" });

/** Create a Session for the user's auto-provisioned project, pointed at the mock LLM. */
async function createSession(page, approvalMode) {
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
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
  const res = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
    { data: { provider: "custom", modelId: "claude-4-8", approvalMode } },
  );
  expect(res.ok(), `create session: ${await res.text()}`).toBeTruthy();
  return (await res.json()).session.sessionId;
}

/** Start the slow tool run and approve its command, so the Task is busy for the next ~8s. */
async function busyRun(page, sessionId) {
  await page.goto(`${BASE}/chat/${sessionId}`);
  const ta = page.locator("textarea").first();
  await ta.waitFor();
  await ta.fill("slow stream test");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("执行命令").first()).toBeVisible();
  await page.getByRole("button", { name: "允许" }).click();
  return ta;
}

/** Queue one steering message and wait for its line (content + 撤回 button) to land. */
async function queueSteering(page, ta, text) {
  await ta.fill(text);
  await ta.press("Enter");
  await expect(page.getByText(`插话已排队，将随下一轮送达：${text}`)).toBeVisible();
  await expect(ta).toHaveValue("");
}

/**
 * Answer the next recall DELETE of a steering message with a refusal, keeping every other request
 * untouched. Answers every call while the stub is up, so a retry is refused the same way.
 */
async function refuseRecall(page, { status = 409, code, message }) {
  await page.route("**/api/sessions/*/steer/*", async (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({ error: { code, message } }),
    });
  });
}

/**
 * Nothing was announced in the notification region, read at once. `toHaveCount(0)` retries for the
 * whole expect timeout and so also passes against a toast that simply expired after six seconds —
 * the very behaviour this file is about. Reads the count once, after the refusal has rendered.
 */
async function expectNoToast(page) {
  await page.waitForTimeout(400);
  expect(await notifications(page).getByRole("button").count()).toBe(0);
}

test("a 409 recall says the message already reached the model, under its own line", async ({
  page,
}) => {
  await provisionAndLogin(page.request, "queuerecall409", P);
  const sessionId = await createSession(page, "always-ask");
  const ta = await busyRun(page, sessionId);
  const TEXT = "steer: one more thing about the summary";
  await queueSteering(page, ta, TEXT);

  await refuseRecall(page, {
    code: "not_pending",
    message: "The steering message is no longer pending.",
  });
  await page.getByRole("button", { name: "撤回" }).click();

  const refusal = page.locator(REFUSAL);
  await expect(refusal).toHaveCount(1);
  await expect(refusal).toBeVisible();
  // The server's own sentence, not the English wire message: the reason is the interface's.
  await expect(refusal).toContainText("这条排队消息没能撤回：");
  await expect(refusal).toContainText("该插话已随本轮送达模型，无法撤回。");
  await expect(refusal).not.toContainText("no longer pending");
  // The line it belongs to is still there, with its content and its button — the retry.
  await expect(page.getByText(`插话已排队，将随下一轮送达：${TEXT}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "撤回" })).toBeEnabled();
  // And the message did not come back into the composer, nor was anything announced above the page.
  await expect(ta).toHaveValue("");
  await expectNoToast(page);
});

test("a 500 recall leaves the reason in place, and the next press replaces it", async ({
  page,
}) => {
  await provisionAndLogin(page.request, "queuerecall500", P);
  const sessionId = await createSession(page, "always-ask");
  const ta = await busyRun(page, sessionId);
  const TEXT = "steer: please also check the config file";
  await queueSteering(page, ta, TEXT);

  await refuseRecall(page, { status: 500, code: "internal_error", message: "boom" });
  await page.getByRole("button", { name: "撤回" }).click();
  const refusal = page.locator(REFUSAL);
  await expect(refusal).toHaveCount(1);
  await expect(refusal).toContainText("这条排队消息没能撤回：");
  await expectNoToast(page);

  // Refused again, this time with the other 409 shape: one sentence at a time, and it is the new
  // press's — an old reason under a live button would describe an attempt that is already over.
  await page.unroute("**/api/sessions/*/steer/*");
  await refuseRecall(page, {
    status: 409,
    code: "not_pending",
    message: "The steering message is no longer pending.",
  });
  await page.getByRole("button", { name: "撤回" }).click();
  await expect(refusal).toHaveCount(1);
  await expect(refusal).toContainText("该插话已随本轮送达模型，无法撤回。");
  await expectNoToast(page);
});

test("with two messages queued, only the pressed line owns the sentence", async ({ page }) => {
  await provisionAndLogin(page.request, "queuerecalltwo", P);
  const sessionId = await createSession(page, "always-ask");
  const ta = await busyRun(page, sessionId);
  const FIRST = "steer: first queued message";
  const SECOND = "steer: second queued message";
  await queueSteering(page, ta, FIRST);
  await queueSteering(page, ta, SECOND);

  await refuseRecall(page, {
    code: "not_pending",
    message: "The steering message is no longer pending.",
  });
  // The second line's button: the first `撤回` on screen belongs to FIRST.
  await page.getByRole("button", { name: "撤回" }).nth(1).click();

  const refusal = page.locator(REFUSAL);
  await expect(refusal).toHaveCount(1);
  // It sits below the second line, not below the first: in document order the sentence follows the
  // label it was raised for, which is what "under the button that was pressed" means here.
  const second = page.getByText(`插话已排队，将随下一轮送达：${SECOND}`);
  await expect(second).toBeVisible();
  const secondBox = await second.boundingBox();
  const refusalBox = await refusal.boundingBox();
  expect(refusalBox.y).toBeGreaterThan(secondBox.y + secondBox.height - 1);
  const firstBox = await page.getByText(`插话已排队，将随下一轮送达：${FIRST}`).boundingBox();
  expect(refusalBox.y).toBeGreaterThan(firstBox.y + firstBox.height - 1);
  await expectNoToast(page);
});
