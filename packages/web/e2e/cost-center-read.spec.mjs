/**
 * Regression: the cost center's "N 条未预期错误" notice counts the errors THIS page load can
 * see, and "mark read" remembers exactly what the reader was shown (upstream #1118, landed in
 * this fork as the 62nd round; `docs/FORK-PROGRESS.md` §5.40).
 *
 * The old behaviour was one defect with two halves, both invisible until a reload: the notice
 * read the error probe cached when the app STARTED (so an error that arrived while the tab was
 * open was never counted — the notice and the table right below it disagreed), and "mark read"
 * stamped that same start-up signature (so the newer error was unread again after the reload,
 * and the dot came back). The fix refreshes the probe when the page loads
 * (`usage-page.tsx`) and writes the marker only after a successful PUT
 * (`todo-dismissals.ts`, serialized so an older write cannot land on top of a newer one).
 *
 * The rows are real server-side surprises rather than inserted ones: the mock rejects the auth
 * prompt with 401 (`unexpected`, source `llm` — only a human can replace the key) and the quota
 * prompt with 403 (`unexpected`, a fatal turn). A turn BEFORE the app opens, then a second one
 * after, is exactly the shape the defect hides in. Every number this spec asserts comes out of
 * a response the page itself received, so a rerun on a data root that is not fresh still
 * distinguishes "what the app was told at start-up" from "what is there now".
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";

/** The badge's own one-row read; the app makes this request on load and on the cost center. */
const isErrorProbe = (r) => r.url().includes("/usage/errors") && r.request().method() === "GET";

/** Provision the user, point the Project at the mock (a key the mock rejects), open one Session. */
async function prepare(page, userId) {
  await provisionAndLogin(page.request, userId, P);
  const { projects } = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects[0].projectId;
  const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
    data: {
      defaultModel: { provider: "custom", modelId: "claude-4-8" },
      models: [
        {
          provider: "custom",
          modelId: "claude-4-8",
          apiKey: "sk-auth-bad",
          baseUrl: MOCK,
          contextWindow: 200000,
        },
      ],
    },
  });
  expect(put.ok(), "put models").toBeTruthy();
  return { projectId, sessionId: await newSession(page, projectId) };
}

/** One more Session on the same Project — each failure below gets its own, see `failedTurn`. */
async function newSession(page, projectId) {
  const sess = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
    { data: { provider: "custom", modelId: "claude-4-8" } },
  );
  expect(sess.ok(), "create session").toBeTruthy();
  return (await sess.json()).session.sessionId;
}

/**
 * One failed turn through the API; resolves once the Trace holds its terminal `request_end`.
 *
 * **One Session per prompt**: the mock picks its branch off the whole request body, so a
 * prompt sent as a follow-up rides on top of the previous turn's words — a second Session in
 * the same Project keeps each request's context to the prompt it was meant to match.
 *
 * Both failures reach `error_records` as `llm_fatal`, and the recorder drops a repeat of the
 * same `(source, code, Project)` inside its 2 s window — hence the gap the caller keeps.
 */
async function failedTurn(page, sessionId, text, code) {
  const res = await page.request.post(`${BASE}/api/sessions/${sessionId}/tasks`, {
    data: { input: [{ type: "text", text }] },
  });
  expect(res.status(), "start task").toBe(202);
  await expect
    .poll(
      async () => {
        const { messages } = await (
          await page.request.get(`${BASE}/api/sessions/${sessionId}/messages`)
        ).json();
        return messages.some(
          (m) => m.payload.type === "request_end" && m.payload.error_code === code,
        );
      },
      { timeout: 30_000 },
    )
    .toBe(true);
}

/** The marker the cost center's "mark read" stores for one Project's error trail, as stored. */
async function storedErrorsMarker(page, projectId) {
  const { prefs } = await (await page.request.get(`${BASE}/api/me/prefs`)).json();
  return prefs.todoDismissed?.[projectId]?.errors;
}

test("the notice counts an error that arrived after the app opened, and marking it read keeps it down after a reload", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { projectId, sessionId } = await prepare(page, "costread");

  // One error on the books BEFORE the shell loads: this is what the start-up probe caches.
  await failedTurn(page, sessionId, "auth dead test", "auth");

  // Open the app while catching the badge's own probe: from here on the client's answer is
  // the start-up one, which is what the old cost center kept showing. Every later probe the
  // page makes lands in `latest`, so "did the cost center re-read?" is an observable fact
  // rather than a guess about when a request should have gone out.
  let latest = null;
  page.on("response", (r) => {
    if (!isErrorProbe(r)) return;
    void r
      .json()
      .then((body) => {
        latest = body;
      })
      .catch(() => {});
  });
  const probed = page.waitForResponse(isErrorProbe);
  await page.goto(`/chat/${sessionId}`);
  const atStartup = (await (await probed).json()).total;

  // Past the recorder's dedup window, then a second, different surprise while the tab stays
  // open: a fresh client would see it too, this one would not — until the cost center
  // refreshes its probe on load.
  await page.waitForTimeout(2_500);
  await failedTurn(page, await newSession(page, projectId), "quota fatal test", "rejected");

  // In-app navigation (a document reload would rebuild the cache and hide the defect): mark
  // the window, follow the sidebar's own link, and check the mark survived.
  await page.evaluate(() => {
    window.__costCenterNoReload = 1;
  });
  await page.getByRole("link", { name: "成本中心" }).click();
  await expect.poll(() => latest?.total, { timeout: 15_000 }).toBeGreaterThan(atStartup);
  expect(await page.evaluate(() => window.__costCenterNoReload)).toBe(1);
  const fresh = latest;
  await expect(page.getByText(`${fresh.total} 条未预期错误`)).toBeVisible();

  // "Mark read" remembers the newest error the reader was just shown — not the start-up one.
  await page.getByRole("button", { name: /^标记为已读/ }).click();
  await expect(page.getByText(/条未预期错误/)).toHaveCount(0);
  await expect
    .poll(async () => {
      const { prefs } = await (await page.request.get(`${BASE}/api/me/prefs`)).json();
      return prefs.todoDismissed?.[projectId]?.errors;
    })
    .toBe(fresh.items[0].ts);

  // Reload: the probe now starts from the same newest error the marker was stamped with, so
  // the notice stays down (before the fix it came back, because the marker was the older ts).
  await page.reload();
  await expect(page.getByText(/条未预期错误/)).toHaveCount(0);
});

test("a refused write leaves the notice up, says so, and stores nothing", async ({ page }) => {
  test.setTimeout(120_000);
  const { projectId, sessionId } = await prepare(page, "costrefuse");

  await failedTurn(page, sessionId, "auth dead test", "auth");

  // The write is refused at the network edge: the user must not be told "done" for a marker
  // that never landed (that was the old behaviour — the notice vanished, nothing was stored).
  await page.route("**/api/me/prefs", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "bad_request", message: "prefs store is closed" } }),
    });
  });
  await page.goto("/usage");
  const notice = page.getByText(/^\d+ 条未预期错误$/);
  await expect(notice).toBeVisible();
  // Whatever a previous run on this data root left behind, a refused write must not move it.
  const before = await storedErrorsMarker(page, projectId);
  await page.getByRole("button", { name: /^标记为已读/ }).click();

  await expect(page.getByText(/prefs store is closed/)).toBeVisible();
  await expect(notice).toBeVisible();
  expect(await storedErrorsMarker(page, projectId)).toBe(before);

  // Let the write through: the retry dismisses for real.
  await page.unroute("**/api/me/prefs");
  await page.getByRole("button", { name: /^标记为已读/ }).click();
  await expect(notice).toHaveCount(0);
});
