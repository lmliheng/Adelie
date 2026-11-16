/**
 * A Stop the conversation's composer sent that the server did not take says why above the card.
 *
 * Stop is one POST on the Session (`/api/sessions/:id/abort`), and the catch behind it was
 * `catch(() => undefined)`: a 500 left the composer exactly as it looked before the press — the
 * same Stop button, the run still writing — with nothing anywhere saying the press had not landed.
 * There was not even a notification to expire; the screen simply said nothing had happened, and the
 * reader had no way to tell a lost click from a run that refused to die.
 *
 * Now the reason is drawn in the slot above the card that the refused sends already use
 * (`stop-refusal`), and it says the one thing the button cannot: nothing was stopped, so this run
 * is still going and the same button is the retry. It goes with the run — the moment this Session
 * is idle again — never by a timer. A 404 says nothing: the Session itself is gone, so the run it
 * asked about went with it, and a sentence would outlive its subject.
 *
 * The run is driven with the mock's "background move test" prompt (`sleep 45` in the foreground, so
 * the run is still going when Stop is pressed and stays going for the whole check). The POST is
 * refused at `page.route`, so the abort never reaches the server.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const AGENT = "default_agent";

/** The refusal: a code the interface translates, plus a message that must not reach the page. */
const REFUSED = { code: "internal", message: "RAW ENGLISH SERVER MESSAGE" };
/** The line the page draws for that code (S.chat.stopRefused + the `internal` sentence). */
const EXPECTED = "没能停下这次运行，它仍在继续：服务器内部错误，请稍后重试。";

/** The notification region: a refused Stop must be said above the card, not announced up here. */
const notifications = (page) => page.getByRole("region", { name: "通知" });

/**
 * Nothing was raised in the notification region, read at once.
 *
 * `toHaveCount(0)` retries for the whole expect timeout, so it would also pass against a toast that
 * expired after six seconds — the behaviour this file exists to rule out. This reads the count once,
 * after a short settle so the refusal's own render has landed.
 */
async function expectNoToast(page) {
  await page.waitForTimeout(400);
  expect(await notifications(page).getByRole("button").count()).toBe(0);
}

/** Provision the user, aim the Project's model at the mock, and open a fresh allow-all Session. */
async function openSession(page, user) {
  await provisionAndLogin(page.request, user, "password123");
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
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
    { data: { provider: "custom", modelId: "claude-4-8", approvalMode: "allow-all" } },
  );
  expect(created.ok(), "create session").toBeTruthy();
  const sessionId = (await created.json()).session.sessionId;
  await page.goto(`${BASE}/chat/${sessionId}`);
  return sessionId;
}

/** Start the mock's long foreground command (~45 s) and wait until the run is under way. */
async function startLongRun(page) {
  await page.getByPlaceholder(/输入消息/).fill("background move test");
  await page.getByRole("button", { name: "发送" }).click();
  const stop = page.getByRole("button", { name: "停止" });
  await expect(stop).toBeVisible({ timeout: 30_000 });
  return stop;
}

test("a refused Stop says why above the card, stays there, and the same button is the retry", async ({
  page,
}) => {
  await openSession(page, "stoprefused");
  const stop = await startLongRun(page);

  await page.route("**/api/sessions/*/abort", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSED }),
    }),
  );

  await stop.click();
  const refusal = page.getByTestId("stop-refusal");
  await expect(refusal).toBeVisible();
  // The dictionary's sentence, not the wire's English, and it says the run is still going.
  await expect(refusal).toHaveText(EXPECTED);
  await expect(refusal).toHaveAttribute("role", "alert");
  await expect(refusal).not.toContainText("RAW ENGLISH");
  // Nothing was stopped: the card looks as it did, and that same button is the retry.
  await expect(stop).toBeVisible();
  await expectNoToast(page);

  // It does not dismiss itself: four seconds later the run is still going and so is the sentence.
  await page.waitForTimeout(4000);
  await expect(refusal).toBeVisible();
  await expect(stop).toBeVisible();
  // The refused sentence never took the slot a refused send uses.
  expect(await page.getByTestId("send-refusal").count()).toBe(0);

  // Let the same button through: the run is aborted, and the sentence goes with the run.
  await page.unroute("**/api/sessions/*/abort");
  await stop.click();
  await expect(stop).toHaveCount(0, { timeout: 30_000 });
  await expect(refusal).toHaveCount(0);
});

test("a Stop answered 404 says nothing at all — the Session it asked about is gone", async ({
  page,
}) => {
  await openSession(page, "stopgone");
  const stop = await startLongRun(page);

  await page.route("**/api/sessions/*/abort", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "session_not_found", message: "RAW ENGLISH" } }),
    }),
  );

  await stop.click();
  // Read once, after the press has had time to render: a sentence about a stop without a subject
  // would outlive the Session, so nothing is drawn where a refusal of anything else would be.
  await page.waitForTimeout(800);
  expect(await page.getByTestId("stop-refusal").count()).toBe(0);
  expect(await page.getByTestId("send-refusal").count()).toBe(0);
  await expectNoToast(page);
  // The run itself is untouched by the refused press: Stop is still the button on the card.
  await expect(stop).toBeVisible();
});
