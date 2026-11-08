/**
 * Regression: a compaction threshold the server refused leaves its reason **inside** the
 * confirmation that asked for it, next to the Save that retries, and it stays there.
 *
 * The context panel's cutter never writes straight through: a release (or Enter on it) opens a
 * confirmation naming the Agent and the threshold it is about to replace, and that card's Save
 * performs the write. The card stays open on the edited value when the write is refused — so the
 * one sentence explaining it used to arrive as a notification above a dialog the person was still
 * looking at, and vanished after six seconds, leaving a question that looked unanswered.
 *
 * The write is refused at `page.route` and every check reads the server through the API as well,
 * so the sentence and the Agent's own state are both covered.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const AGENT = "default_agent";
/** The model's window, large enough that the cutter's lattice stays well below it. */
const CONTEXT_WINDOW = 200000;
/** What the Agent holds before the write under test, and what it must still hold while refused. */
const THRESHOLD = 100000;
/** One arrow press on the cutter. */
const STEP = 1000;

/** The refusal the stubbed route answers with: its own code resolves to the interface's sentence. */
const REFUSAL = { code: "internal", message: "RAW ENGLISH SERVER MESSAGE" };
/** What that code says in Chinese — the interface's words, never the wire message above. */
const REASON = "服务器内部错误，请稍后重试。";

const configUrl = (projectId) => `${BASE}/api/projects/${projectId}/agents/${AGENT}/config`;

/**
 * Provision the user, give the Project a model (the onboarding overlay covers the page without
 * one) and put the Agent's compaction threshold on a known value. Every write is absolute, so
 * rerunning this file alone on one data root stays clean.
 */
async function projectWithThreshold(page, user) {
  await provisionAndLogin(page.request, user, P);
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
          contextWindow: CONTEXT_WINDOW,
        },
      ],
    },
  });
  expect(models.ok(), "put models").toBeTruthy();
  const written = await page.request.put(configUrl(projectId), {
    data: { config: { compaction: { maxContextLength: THRESHOLD } } },
  });
  expect(written.ok(), "put the threshold").toBeTruthy();
  const sess = await (
    await page.request.post(`${BASE}/api/projects/${projectId}/agents/${AGENT}/sessions`, {
      data: { provider: "custom", modelId: "claude-4-8", approvalMode: "allow-all" },
    })
  ).json();
  /** The threshold the Agent holds right now: what the panel reads and the write changes. */
  const stored = async () =>
    (await (await page.request.get(configUrl(projectId))).json()).config.compaction
      .maxContextLength;
  return { sessionId: sess.session.sessionId, stored };
}

/**
 * Take over the config write: every PUT is kept in `seen`, and while `state.refuse` is set it is
 * answered with the server's refusal instead of reaching the real route.
 */
async function interceptWrite(page, state) {
  await page.route("**/api/projects/*/agents/*/config", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    state.seen.push(route.request().postData() ?? "");
    if (!state.refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
}

/** The notification region: a refusal must not be announced there (that is the old toast). */
const notifications = (page) => page.getByRole("region", { name: "通知" });

test("a refused threshold change keeps the reason inside the card, and the threshold where it was", async ({
  page,
}) => {
  const { sessionId, stored } = await projectWithThreshold(page, "r211threshold");
  expect(await stored()).toBe(THRESHOLD);

  const state = { seen: [], refuse: true };
  await interceptWrite(page, state);

  await page.goto(`/chat/${sessionId}`);
  // The panel's bar (and the cutter on it) is drawn from a measured context, so the Session needs
  // one round in it first. The mock answers this prompt with a command and a closing line, and
  // `allow-all` on the Session keeps the approval out of the way.
  const composer = page.getByPlaceholder(/输入消息/);
  await composer.waitFor();
  await composer.fill("Help me set up @theme");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(
    page.getByText("Command finished; the result looks as expected.").first(),
  ).toBeVisible();

  // The composer's context ring is the panel's trigger; its accessible name carries the figures.
  const ring = page.getByRole("button", { name: /上下文占用/ }).first();
  await ring.waitFor();
  await ring.click();

  // The cutter is a slider on the threshold's own lattice: two steps left, then a release.
  const cutter = page.getByRole("slider", { name: "压缩阈值" });
  await cutter.waitFor();
  expect(await cutter.getAttribute("aria-valuenow")).toBe(String(THRESHOLD));
  await cutter.focus();
  await cutter.press("ArrowLeft");
  await cutter.press("ArrowLeft");
  const asked = THRESHOLD - 2 * STEP;
  await expect(cutter).toHaveAttribute("aria-valuenow", String(asked));
  await cutter.press("Enter");

  // The card that asked: its field holds the proposed number, and Save writes it.
  const field = page.getByLabel("压缩阈值（token）");
  await expect(field).toHaveValue(String(asked));
  await page.getByRole("button", { name: "保存" }).click();

  // The reason is inside the card, in the interface's words, and only once.
  const line = page.getByRole("alert");
  await expect(line).toHaveCount(1);
  await expect(line).toHaveText(`压缩阈值没有改成 98k，Agent 上仍然是原来的值：${REASON}`);
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.seen).toHaveLength(1);
  expect(JSON.parse(state.seen[0])).toEqual({
    config: { compaction: { maxContextLength: asked } },
  });

  // The card is still the question it was — same field, same value — and the Agent did not move.
  await expect(field).toHaveValue(String(asked));
  expect(await stored()).toBe(THRESHOLD);

  // Seven seconds later (the toast would be long gone) the sentence is still in the card.
  await page.waitForTimeout(7000);
  await expect(line).toHaveText(`压缩阈值没有改成 98k，Agent 上仍然是原来的值：${REASON}`);
  await expect(field).toBeVisible();

  // The Save is the retry: allowed now, the sentence goes, the card closes and the write lands.
  state.refuse = false;
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(field).toHaveCount(0);
  expect(state.seen).toHaveLength(2);
  expect(await stored()).toBe(asked);
  // The cutter now stands on the value that was written, not on the one it started from.
  await expect(page.getByRole("slider", { name: "压缩阈值" })).toHaveAttribute(
    "aria-valuenow",
    String(asked),
  );
});
