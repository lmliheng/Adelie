/**
 * The conversation's "网络" panel: this page records a turn's own requests, and the line under the
 * assistant reply opens the panel on that turn.
 *
 * - After one turn against the repository's mock model, the reply's inline request line is there
 *   (this turn made HTTP requests and at least one model call).
 * - Clicking the line opens the Network tab on the right dock, recording, with the panel's summary
 *   in the same numbers.
 * - The panel opens from the dock picker as well, with its scope and type controls.
 * - Pausing stops recording — the toolbar says so and the button offers to resume.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const U = "networkuser";
const P = "password123";
/** The mock's second-turn answer (the string it says once a tool call has run). */
const REPLY = "Command finished; the result looks as expected.";

/** Provision the user, aim the Project's model at the mock, open one Session and run one turn. */
async function openSessionWithOneTurn(page) {
  await provisionAndLogin(page.request, U, P);
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
    `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
    { data: { provider: "custom", modelId: "claude-4-8", approvalMode: "allow-all" } },
  );
  expect(created.ok(), "create session").toBeTruthy();
  const sessionId = (await created.json()).session.sessionId;

  await page.goto(`${BASE}/chat/${sessionId}`);
  const composer = page.getByPlaceholder(/输入消息/);
  await composer.waitFor();
  await composer.fill("check the directory");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText(REPLY, { exact: true })).toBeVisible({ timeout: 30_000 });
  return sessionId;
}

/** The dock that is actually on screen (a collapsed one keeps its bodies mounted at zero size). */
const onScreenDock = (page) => page.locator('[data-testid="dock"]:visible');

test("the reply's request line opens the Network panel on that turn", async ({ page }) => {
  await openSessionWithOneTurn(page);

  // The inline line: this turn made requests and at least one model call.
  const inline = page.locator('[data-net-turn="1"]');
  await expect(inline).toBeVisible();
  await expect(inline).toContainText(/个请求/);
  await expect(inline).toContainText(/次模型调用/);

  // Clicking it brings the Network tab up on the right dock, recording.
  await inline.click();
  const dock = onScreenDock(page);
  await expect(dock.getByText("记录中")).toBeVisible();
  await expect(dock.getByText(/\d+ 请求 · \d+ 模型调用/)).toBeVisible();

  // Pausing stops recording; the button then offers to resume.
  await dock.getByRole("button", { name: "暂停" }).click();
  await expect(dock.getByText("已暂停")).toBeVisible();
  await dock.getByRole("button", { name: "继续" }).click();
  await expect(dock.getByText("记录中")).toBeVisible();
});

test("a model row shows what Adelie sent the provider and what came back", async ({ page }) => {
  await openSessionWithOneTurn(page);

  await page.locator('[data-net-turn="1"]').click();
  const dock = onScreenDock(page);
  await expect(dock.getByText("记录中")).toBeVisible();

  // Model rows wear ◆ as their method; the first one is this turn's request to the provider.
  await dock.getByRole("button").filter({ hasText: "◆" }).first().click();

  // What was sent: the request body is the messages/tools/config JSON, fetched from the server
  // when the row opened (the row itself comes from the stream's request_begin/request_end).
  await dock.getByRole("button", { name: "请求", exact: true }).click();
  await expect(dock.getByText("请求体")).toBeVisible();
  await expect(dock.locator("pre").filter({ hasText: '"messages"' })).toBeVisible({
    timeout: 15_000,
  });

  // What came back: the model's own answer, stitched from its stream.
  await dock.getByRole("button", { name: "响应", exact: true }).click();
  await expect(dock.getByText("响应体")).toBeVisible();
  await expect(dock.locator("pre").filter({ hasText: '"text"' })).toBeVisible({
    timeout: 15_000,
  });
});

test("the Network panel opens from the dock picker with its controls", async ({ page }) => {
  const sessionId = await openSessionWithOneTurn(page);

  await page.goto(`${BASE}/chat/${sessionId}`);
  await page.getByPlaceholder(/输入消息/).waitFor();
  await page.getByTestId("dock-toggle-right").click();
  await page.getByTestId("dock-pick-network").click();
  const dock = onScreenDock(page);
  await expect(dock.getByText("记录中")).toBeVisible();
  // Scope (本次回复 / 最近 5 回合 / 全部) and type filters (接口 / 模型 / 流 / 上传).
  await expect(dock.getByRole("button", { name: "本次回复" })).toBeVisible();
  await expect(dock.getByRole("button", { name: "模型" })).toBeVisible();
  await expect(dock.getByRole("searchbox", { name: "搜索" })).toBeVisible();
});

test("a row opens its detail inside the panel, tabs and back included", async ({ page }) => {
  await openSessionWithOneTurn(page);

  await page.locator('[data-net-turn="1"]').click();
  const dock = onScreenDock(page);
  await expect(dock.getByText("记录中")).toBeVisible();

  // Open one real API call's row: the detail replaces the list inside the same panel.
  await dock.getByRole("button").filter({ hasText: "/api/" }).first().click();
  for (const label of ["概述", "请求", "响应", "事件流", "关联"]) {
    await expect(dock.getByRole("button", { name: label, exact: true })).toBeVisible();
  }

  // What was sent: the header table, masked by default.
  await dock.getByRole("button", { name: "请求", exact: true }).click();
  await expect(dock.getByText("请求头")).toBeVisible();

  // Only a stream connection is recorded server-side; on any other row both sides stay as they
  // were (the browser's count, and "not captured" for what the server wrote).
  await dock.getByRole("button", { name: "事件流", exact: true }).click();
  await expect(dock.getByText("服务端写出", { exact: true })).toBeVisible();
  await expect(dock.getByText("未采集").first()).toBeVisible();

  // ← goes back to the list, which is still recording.
  await dock.getByRole("button", { name: "返回" }).click();
  await expect(dock.getByRole("button", { name: "本次回复", exact: true })).toBeVisible();
  await expect(dock.getByText("记录中")).toBeVisible();
});

test("a stream row's events tab reads the server's own frame record", async ({ page }) => {
  await openSessionWithOneTurn(page);

  await page.locator('[data-net-turn="1"]').click();
  const dock = onScreenDock(page);
  await expect(dock.getByText("记录中")).toBeVisible();

  // The Session's stream: the connection this page opened, which it names in the URL
  // (api/sse.ts) so the server can record what it writes on it.
  await dock
    .getByRole("button")
    // The row's text continues past the path (its frame count and its duration), so no `$`.
    .filter({ hasText: /\/api\/sessions\/.+\/stream/ })
    .first()
    .click();
  await dock.getByRole("button", { name: "事件流", exact: true }).click();

  // The count is the server's own — a number, not the placeholder the panel used to draw there.
  const wrote = dock.getByText("服务端写出", { exact: true }).locator("..");
  await expect(wrote).toContainText(/\d+ 帧/, { timeout: 15_000 });
  await expect(wrote).not.toContainText("未采集");
  // And the frames themselves: the snapshot this subscription opened with is frame #1.
  await expect(dock.getByText("写出的帧（新的在上）")).toBeVisible();
  await expect(dock.getByText("#1", { exact: true })).toBeVisible();
});

test("a model row the server no longer keeps says so instead of (empty)", async ({ page }) => {
  // The ring keeps the newest 100 calls process-wide (services/model-exchange-log.ts), so an older
  // row has no bodies to fetch. Answer the fetch with an empty list — the state the panel sees in
  // exactly that case — and read what the request tab says: "（空）" would claim the provider was
  // sent an empty request, which is what this row used to say.
  await page.route("**/model-exchanges*", (route) => route.fulfill({ json: { exchanges: [] } }));
  await openSessionWithOneTurn(page);

  await page.locator('[data-net-turn="1"]').click();
  const dock = onScreenDock(page);
  await expect(dock.getByText("记录中")).toBeVisible();
  await dock.getByRole("button").filter({ hasText: "◆" }).first().click();

  await dock.getByRole("button", { name: "请求", exact: true }).click();
  await expect(dock.getByText("请求体")).toBeVisible();
  await expect(
    dock.getByText("服务器上没有这次调用的记录（模型调用只保留最近 100 次）。"),
  ).toBeVisible({ timeout: 15_000 });
  await expect(dock.getByText("（空）")).toHaveCount(0);

  // The page never saw this call's headers: that table says so rather than reading as "none sent".
  await expect(dock.getByText("未采集").first()).toBeVisible();
});

test("a layout move keeps the reader's place; a tab closed and reopened starts over", async ({
  page,
}) => {
  // The panel body is remounted when the dock moves between edges. The reading controls and the
  // open record are the reader's place and come back; a tab closed and reopened arrives on the
  // surface the place was left on and starts over (features/network/network-place.ts).
  await openSessionWithOneTurn(page);
  await page.locator('[data-net-turn="1"]').click();
  const dock = onScreenDock(page);
  await expect(dock.getByText("记录中")).toBeVisible();

  // Walk away: last five turns, streams only, a search word, one record's detail on 响应.
  await dock.getByRole("button", { name: "最近 5 回合" }).click();
  await dock.getByRole("button", { name: "流", exact: true }).click();
  await dock.getByRole("searchbox", { name: "搜索" }).fill("stream");
  await dock.getByRole("button").filter({ hasText: "/api/" }).first().click();
  await dock.getByRole("button", { name: "响应", exact: true }).click();
  await expect(dock.getByRole("button", { name: "响应", exact: true })).toHaveClass(/font-medium/);

  // The move: right dock → bottom dock. The same record's detail is on screen, on the same tab.
  await dock.getByTestId("dock-move").click();
  const moved = onScreenDock(page);
  await expect(moved.getByRole("button", { name: "响应", exact: true })).toHaveClass(/font-medium/);
  await moved.getByRole("button", { name: "返回" }).click();
  await expect(moved.getByRole("searchbox", { name: "搜索" })).toHaveValue("stream");
  await expect(moved.getByRole("button", { name: "最近 5 回合" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(moved.getByRole("button", { name: "流", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // A tab closed and reopened is not a move: the panel arrives on the surface the place was left
  // on, so it starts over — no search word, the scope back on this reply, the detail shut.
  await moved.getByTestId("dock-tab-close").first().click();
  await page.getByTestId("dock-toggle-bottom").click();
  await page.getByTestId("dock-pick-network").click();
  const reopened = onScreenDock(page);
  await expect(reopened.getByText("记录中")).toBeVisible();
  await expect(reopened.getByRole("searchbox", { name: "搜索" })).toHaveValue("");
  await expect(reopened.getByRole("button", { name: "本次回复" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(reopened.getByRole("button", { name: "返回" })).toHaveCount(0);
});
