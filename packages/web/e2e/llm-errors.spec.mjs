/**
 * LLM request-failure recovery. The stop-reason split these tests pin is core's four-value
 * protocol (`completed` / `aborted` / `retryable` / `fatal`, upstream #458): a request either
 * retries on the engine's ladder or ends the turn, and a definitive provider rejection never
 * rides the ladder.
 *
 * 1. A truncated stream is retryable: the mock's first attempt ends one event short (no
 *    message_stop), GenerativeModel ends it `retryable` with error_code "malformed", and the
 *    engine reconnects after its backoff base (2s — see `reconnectBackoffMs`; the full
 *    2+4+8+16+30s ladder is pinned by the engine's unit tests, not by a browser test sitting
 *    through real waits). The 2s wait is exactly the countdown floor, so it shows a live
 *    ticker whose seconds go DOWN; clicking "retry now" (立即重试) skips the rest of the wait
 *    and the turn completes normally — no abort. (An HTTP 5xx would not do here: the protocol
 *    SDK retries 5xx internally, so neither the engine nor the Trace ever sees it.)
 * 2. Give-up: a conversation whose transient failures never stop — clicking 放弃 on the
 *    countdown fires the ordinary abort; the engine's abort-during-backoff path ends the turn
 *    and the composer is immediately usable again.
 * 3. A quota rejection (403 insufficient_user_quota) is FATAL: a 4xx other than 408/429 is in
 *    `isFatalProviderRejection`'s allowlist (core/test/llm.test.ts pins exactly this code), so
 *    the turn ends on the first attempt — the provider's own text on screen, no ladder, no
 *    countdown — and the composer is usable again for a fixed key or another model.
 * 4. An authentication failure (401 invalid_api_key) is fatal too, but RECOVERABLE: only the
 *    model reference is fixed at creation — credentials come from the current Project config —
 *    so updating the key and sending again continues the same conversation (no reload).
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** Provision a user with a configured mock model and one session; returns ids for later config updates. */
async function makeSession(page, userId, apiKey = "sk-mock") {
  await provisionAndLogin(page.request, userId, "password123");
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
    data: {
      defaultModel: { provider: "custom", modelId: "claude-4-8" },
      models: [
        {
          provider: "custom",
          modelId: "claude-4-8",
          apiKey,
          baseUrl: MOCK,
          contextWindow: 200000,
        },
      ],
    },
  });
  const sess = await (
    await page.request.post(`${BASE}/api/projects/${projectId}/agents/default_agent/sessions`, {
      data: { provider: "custom", modelId: "claude-4-8" },
    })
  ).json();
  return { sessionId: sess.session.sessionId, projectId };
}

test("a transient failure retries with a live countdown; 'retry now' skips the wait and the turn completes", async ({
  page,
}) => {
  const { sessionId } = await makeSession(page, "transientuser");

  await page.goto(`${BASE}/chat/${sessionId}`);
  await page.getByPlaceholder(/输入消息/).fill("transient retry test");
  await page.getByRole("button", { name: "发送" }).click();

  // One line for the whole ladder, not one per attempt. The first retry's wait is the
  // backoff base (2s — exactly the countdown floor), so the single retry line advances to
  // its countdown wording right away.
  const ladder = page.getByText(/\[重试\]/);
  await expect(ladder).toHaveCount(1, { timeout: 20000 });
  await expect(ladder).toHaveText(/第 1 次重试/, { timeout: 20000 });

  // A live countdown (whole seconds, ticking down).
  const countdown = page.getByText(/第 1 次重试，\d+ 秒后发起/);
  await expect(countdown).toBeVisible({ timeout: 20000 });
  const readSecs = async () => {
    const txt = await countdown.textContent({ timeout: 500 }).catch(() => null);
    const m = txt === null ? null : /第 1 次重试，(\d+) 秒后发起/.exec(txt);
    return m ? parseInt(m[1], 10) : null;
  };
  const first = await readSecs();
  expect(first).not.toBeNull();
  // Poll until the displayed seconds DECREASE (a live ticker, not a static label).
  let second = first;
  for (let i = 0; i < 12 && second !== null && second >= first; i++) {
    await page.waitForTimeout(300);
    second = await readSecs();
  }
  expect(second).not.toBeNull();
  expect(second).toBeLessThan(first);

  // "Retry now" skips the remaining wait: the retry fires promptly — well before the
  // scheduled 2s would have elapsed (the 1.5s expectation window is the proof: without
  // the skip, the natural timer still had time to go).
  await page.getByRole("button", { name: "立即重试" }).click();
  await expect(page.getByText(/已发起第 1 次重试/)).toBeVisible({
    timeout: 1500,
  });

  // Attempt 2 succeeds: the final answer streams in.
  await expect(page.getByText("Service recovered; the answer is 42.")).toBeVisible({
    timeout: 20000,
  });

  // No abort: the run recovered, the composer stays usable.
  await expect(page.getByText(/已中断/)).toHaveCount(0);
  await expect(page.getByPlaceholder(/输入消息/)).toBeEnabled();

  // Trace: the truncated stream recorded as request_end(retryable, error_code "malformed") —
  // the reconnect path — carrying the real failure detail (the Cost center's errors panel
  // reads it from here) and the announced backoff; no abort event.
  const msgs = await (await page.request.get(`${BASE}/api/sessions/${sessionId}/messages`)).json();
  const retries = msgs.messages.filter(
    (m) => m.payload.type === "request_end" && m.payload.status === "retryable",
  );
  expect(retries.length).toBe(1);
  expect(retries[0].payload.error_code).toBe("malformed");
  // AgentHub's own wording for a stream it saw none of ("Streaming response yielded no
  // events"); the point is that the provider's detail is what the Trace keeps.
  expect(retries[0].payload.error_message).toContain("no events");
  expect(retries[0].payload.retry_in_ms).toBe(2000);
  expect(msgs.messages.some((m) => m.payload.type === "abort")).toBe(false);
});

test("'give up' on the countdown aborts the backoff: the turn ends and the composer is usable again", async ({
  page,
}) => {
  const { sessionId } = await makeSession(page, "giveupuser");

  await page.goto(`${BASE}/chat/${sessionId}`);
  await page.getByPlaceholder(/输入消息/).fill("transient giveup test");
  await page.getByRole("button", { name: "发送" }).click();

  // The mock rejects every request: by the 2s wait before retry #4 the countdown (and its
  // inline controls) are on screen.
  await expect(page.getByRole("button", { name: "放弃" })).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "放弃" }).click();

  // The ordinary abort lands mid-backoff: the engine's abort-during-backoff path ends the
  // turn (abort line, and the retry line flips to the "gave up after attempt N" wording)
  // and the composer is immediately usable again.
  await expect(page.getByText(/已中断/)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/次尝试后放弃/)).toBeVisible();
  await expect(page.getByPlaceholder(/输入消息/)).toBeEnabled();

  // Trace: the abort says why — the backoff was interrupted, not the user's own stop.
  const msgs = await (await page.request.get(`${BASE}/api/sessions/${sessionId}/messages`)).json();
  const abort = msgs.messages.find((m) => m.payload.type === "abort");
  expect(abort.payload.error_code).toBe("backoff_interrupted");
});

test("a quota-403 is a fatal rejection: one attempt, the provider's text on screen, no ladder", async ({
  page,
}) => {
  const { sessionId } = await makeSession(page, "quotauser");

  await page.goto(`${BASE}/chat/${sessionId}`);
  await page.getByPlaceholder(/输入消息/).fill("quota fatal test");
  await page.getByRole("button", { name: "发送" }).click();

  // Fatal means fatal: the error banner names the provider's own rejection, and the
  // reconnect line never appears — a 4xx is not retried.
  await expect(page.getByText(/\[错误\]：模型请求错误/)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/insufficient_user_quota/)).toBeVisible();
  await expect(page.getByText(/\[重试\]/)).toHaveCount(0);
  await expect(page.getByText(/已中断/)).toHaveCount(0);

  // The turn ended; the composer is usable again for a fixed key or another model.
  await expect(page.getByPlaceholder(/输入消息/)).toBeEnabled();

  // Trace: one terminal request, classified fatal → "rejected", carrying the provider's text.
  const msgs = await (await page.request.get(`${BASE}/api/sessions/${sessionId}/messages`)).json();
  const rejected = msgs.messages.filter(
    (m) => m.payload.type === "request_end" && m.payload.error_code === "rejected",
  );
  expect(rejected.length).toBe(1);
  expect(rejected[0].payload.status).toBe("fatal");
  expect(rejected[0].payload.error_message).toContain("insufficient_user_quota");
  expect(rejected[0].payload.retry_in_ms).toBeUndefined();
  expect(msgs.messages.some((m) => m.payload.type === "abort")).toBe(false);
});

test("an auth-401 is fatal but recoverable: the banner names the rejected key, and updating it lets the same conversation continue", async ({
  page,
}) => {
  // The mock rejects the provisioned key (`sk-auth-bad`) with a 401 and accepts any other.
  const { sessionId, projectId } = await makeSession(page, "authuser", "sk-auth-bad");

  await page.goto(`${BASE}/chat/${sessionId}`);
  await page.getByPlaceholder(/输入消息/).fill("auth dead test");
  await page.getByRole("button", { name: "发送" }).click();

  // A dead credential is fatal: one attempt, the provider's text (code and message) on
  // screen, no ladder — retrying the same dead key can never help — and the composer stays
  // usable for the fixed key.
  await expect(page.getByText(/\[错误\]：模型请求错误/)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/invalid_api_key/)).toBeVisible();
  await expect(page.getByText(/invalid x-api-key/)).toBeVisible();
  await expect(page.getByText(/\[重试\]/)).toHaveCount(0);
  await expect(page.getByPlaceholder(/输入消息/)).toBeEnabled();

  // Trace: the credentials failure is the request's own terminal status — fatal, with
  // error_code "auth" — and a fatal turn writes no abort event (there is no interruption to
  // report; the failure is the record).
  const msgs = await (await page.request.get(`${BASE}/api/sessions/${sessionId}/messages`)).json();
  const authEnd = msgs.messages.find(
    (m) => m.payload.type === "request_end" && m.payload.error_code === "auth",
  );
  expect(authEnd).toBeTruthy();
  expect(authEnd.payload.status).toBe("fatal");
  expect(authEnd.payload.error_message).toContain("invalid x-api-key");
  expect(msgs.messages.some((m) => m.payload.type === "abort")).toBe(false);

  // PRIMARY PATH: update the model's key (as the Models page would). The rebuilt runtime
  // re-reads the Project config on the next request, so the SAME conversation continues.
  const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
    data: {
      defaultModel: { provider: "custom", modelId: "claude-4-8" },
      models: [
        {
          provider: "custom",
          modelId: "claude-4-8",
          apiKey: "sk-auth-good",
          baseUrl: MOCK,
          contextWindow: 200000,
        },
      ],
    },
  });
  expect(put.status()).toBe(200);

  await page.getByPlaceholder(/输入消息/).fill("auth dead test after fix");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("Auth restored; hello again.")).toBeVisible({ timeout: 20000 });

  // Reload AFTER the success: replay still contains the failed attempt, but it is followed
  // by a completed request — the composer stays usable and nothing spins a retry.
  await page.reload();
  await expect(page.getByText("Auth restored; hello again.")).toBeVisible({ timeout: 15000 });
  await expect(page.getByPlaceholder(/输入消息/)).toBeEnabled();
  await expect(page.getByText(/\[重试\]/)).toHaveCount(0);
});
