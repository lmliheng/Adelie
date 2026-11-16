/**
 * A Stop the server did not take in the API tab's Try it says why under the button that asked.
 *
 * Stop is one POST on the Session (`/api/sessions/:id/abort`), and the catch behind it used to
 * raise a notification that dismissed itself after six seconds: a 500 left the panel exactly as it
 * looked before the press — the run still going, the same Stop button — with nothing anywhere
 * saying the press did not land. Once the notification was gone, the screen said nothing had
 * happened at all.
 *
 * Now the reason is drawn under that same Stop button (which is the retry, because nothing was
 * stopped), and a 404 — the Session is gone, so the run it asked about is over too — says nothing:
 * a sentence about a stop that no longer has a subject would outlive it.
 *
 * The run is driven with the mock's "slow text test" prompt (~8 s of text deltas), so the panel is
 * still running when Stop is pressed. The POST is refused at `page.route`, so the abort never
 * reaches the server.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const AGENT = "default_agent";

/** The refusal: a code the interface translates, plus a message that must not reach the page. */
const REFUSED = { code: "internal", message: "RAW ENGLISH SERVER MESSAGE" };
/** The line the page draws for that code, after what failed (S.agent.apiTryStopRefused). */
const EXPECTED = "没能停下这次运行，它仍在继续：服务器内部错误，请稍后重试。";

/** The notification region: a refused Stop must be said in the panel, not announced up here. */
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

/**
 * Provision the user, aim the Project's model at the mock, turn the Agent's API on, and open the
 * Agent's API tab.
 */
async function openTryIt(page, user) {
  await provisionAndLogin(page.request, user, "password123");
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
  const models = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
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
  expect(models.ok(), "put models").toBeTruthy();
  const api = await page.request.put(`${BASE}/api/projects/${projectId}/agents/${AGENT}/api`, {
    data: { enabled: true, open: false },
  });
  expect(api.ok(), `put the API state: ${await api.text()}`).toBeTruthy();
  await page.goto(`/agents/${AGENT}?tab=api`);
}

/** Run the mock's slow prompt and wait until the run is under way (its first row is on screen). */
async function runSlow(page) {
  await page.getByLabel("试一试").fill("slow text test");
  await page.getByRole("button", { name: "运行" }).click();
  await expect(page.getByTestId("api-try-row").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "停止" })).toBeVisible();
}

test("a refused Stop says why under its button, stays there, and the button is still the retry", async ({
  page,
}) => {
  await openTryIt(page, "trystop");
  await runSlow(page);

  await page.route("**/api/sessions/*/abort", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSED }),
    }),
  );

  await page.getByRole("button", { name: "停止" }).click();
  const refusal = page.getByTestId("api-try-stop-refusal");
  await expect(refusal).toBeVisible();
  // The dictionary's sentence, not the wire's English, and it says the run is still going.
  await expect(refusal).toHaveText(EXPECTED);
  await expect(refusal).toHaveAttribute("role", "alert");
  await expect(refusal).not.toContainText("RAW ENGLISH");
  // Nothing was stopped: Stop is still here, and pressing it again is the retry.
  await expect(page.getByRole("button", { name: "停止" })).toBeEnabled();
  await expectNoToast(page);

  // It does not dismiss itself: the retry it belongs to is still on screen four seconds later,
  // with the run still writing rows.
  await page.waitForTimeout(4000);
  await expect(refusal).toBeVisible();
  await expect(page.getByRole("button", { name: "停止" })).toBeVisible();

  // Let the same button through: the run is aborted and the sentence goes with it.
  await page.unroute("**/api/sessions/*/abort");
  await page.getByRole("button", { name: "停止" }).click();
  await expect(refusal).toHaveCount(0, { timeout: 30_000 });
  const done = page.getByTestId("api-try-row").filter({ hasText: "run.done" });
  await expect(done).toContainText("aborted", { timeout: 30_000 });
});

test("a Session that is already gone is not worth a word", async ({ page }) => {
  await openTryIt(page, "trystop2");
  await runSlow(page);

  // 404 is the shape a Session that no longer exists answers: the run it asked about is over too,
  // so nothing is said about the stop.
  await page.route("**/api/sessions/*/abort", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "not_found", message: "no such Session" } }),
    }),
  );

  await page.getByRole("button", { name: "停止" }).click();
  await page.waitForTimeout(1500);
  expect(await page.getByTestId("api-try-stop-refusal").count()).toBe(0);
  await expectNoToast(page);
  await expect(page.getByRole("button", { name: "停止" })).toBeVisible();
});
