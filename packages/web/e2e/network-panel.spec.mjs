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

  // What the stream delivered: the browser's side is counted, the server's is still a placeholder.
  await dock.getByRole("button", { name: "事件流", exact: true }).click();
  await expect(dock.getByText("服务端写出", { exact: true })).toBeVisible();
  await expect(dock.getByText("未采集").first()).toBeVisible();

  // ← goes back to the list, which is still recording.
  await dock.getByRole("button", { name: "返回" }).click();
  await expect(dock.getByRole("button", { name: "本次回复", exact: true })).toBeVisible();
  await expect(dock.getByText("记录中")).toBeVisible();
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
