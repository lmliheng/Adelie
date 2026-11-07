/**
 * Regression: the API tab's three writes that ask nothing first — turning the API on, the approval
 * mode its conversations start with, and turning keyless access off — draw a refusal under the
 * control that asked for it, and it stays there.
 *
 * None of these controls moves optimistically: the switch and the select show what the server
 * answered with, so a refused write leaves the tab exactly as it was. The reason used to arrive as
 * a notification that dismissed itself after six seconds, which left the control looking as if it
 * had been pressed and come back with nothing on screen explaining why — and the worst of the three
 * is keyless access: a refused off leaves anything that can reach the address calling the Agent
 * without a key.
 *
 * Every write is refused at `page.route`, and every check reads the server through the API as
 * well, so the sentence and the server's own state are both covered.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const AGENT = "default_agent";

/** The refusal the stubbed route answers with: its own code resolves to the interface's sentence. */
const REFUSAL = { code: "internal", message: "RAW ENGLISH SERVER MESSAGE" };
/** What that code says in Chinese — the interface's words, never the wire message above. */
const REASON = "服务器内部错误，请稍后重试。";

const apiUrl = (projectId) => `${BASE}/api/projects/${projectId}/agents/${AGENT}/api`;

/**
 * Provision the user, give the Project a model (the onboarding overlay covers the page without
 * one), and put the Agent's API in a known state. The write is absolute, so rerunning this file
 * alone on one data root stays clean.
 */
async function projectWithApi(page, user, state) {
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
          contextWindow: 200000,
        },
      ],
    },
  });
  expect(models.ok(), "put models").toBeTruthy();

  const written = await page.request.put(apiUrl(projectId), { data: state });
  expect(written.ok(), "put the API state").toBeTruthy();

  /** The Agent's API as the server holds it: what the tab reads and writes back. */
  const stored = async () => (await (await page.request.get(apiUrl(projectId))).json()).api;
  return { projectId, stored };
}

/**
 * Take over one write: every request of that method is kept in `seen`, and while `state.refuse`
 * is set it is answered with the server's refusal instead of reaching the real route.
 */
async function interceptWrite(page, pattern, method, state) {
  await page.route(pattern, async (route) => {
    if (route.request().method() !== method) return route.fallback();
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

test("a refused API-on keeps the reason under the switch, and the API off", async ({ page }) => {
  const { stored } = await projectWithApi(page, "r209on", {
    enabled: false,
    open: false,
    approvalMode: "read-only",
  });
  expect((await stored()).enabled).toBe(false);

  const state = { seen: [], refuse: true };
  await interceptWrite(page, "**/api/projects/*/agents/*/api", "PUT", state);

  await page.goto(`/agents/${AGENT}?tab=api`);
  const apiSwitch = page.getByRole("switch", { name: "开启 API 访问" });
  await expect(apiSwitch).toHaveAttribute("aria-checked", "false");
  await apiSwitch.click();

  // The reason is under the switch, in the interface's words, and only once.
  const line = page.getByRole("alert");
  await expect(line).toHaveCount(1);
  await expect(line).toHaveText(`API 访问没有打开，外部程序仍然无法调用：${REASON}`);
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.seen).toHaveLength(1);
  expect(JSON.parse(state.seen[0])).toEqual({ enabled: true });

  // The switch never flipped and the server still has the API off.
  await expect(apiSwitch).toHaveAttribute("aria-checked", "false");
  expect((await stored()).enabled).toBe(false);

  // Seven seconds later (the toast would be long gone) the sentence is still there.
  await page.waitForTimeout(7000);
  await expect(line).toHaveText(`API 访问没有打开，外部程序仍然无法调用：${REASON}`);

  // The switch is the retry: allowed now, the sentence goes and the API comes on.
  state.refuse = false;
  await apiSwitch.click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(state.seen).toHaveLength(2);
  await expect(apiSwitch).toHaveAttribute("aria-checked", "true");
  expect((await stored()).enabled).toBe(true);
  await expect(page.getByText("API 会话的审批模式")).toBeVisible();
});

test("a refused approval-mode change names the mode asked for, under the select", async ({
  page,
}) => {
  const { stored } = await projectWithApi(page, "r209mode", {
    enabled: true,
    open: false,
    approvalMode: "read-only",
  });
  expect((await stored()).approvalMode).toBe("read-only");

  const state = { seen: [], refuse: true };
  await interceptWrite(page, "**/api/projects/*/agents/*/api", "PUT", state);

  await page.goto(`/agents/${AGENT}?tab=api`);
  // The trigger reads the stored mode (the custom select draws a button, not a real <select>).
  const trigger = page.getByRole("button", { name: /审批模式/ });
  await expect(trigger).toContainText("放行只读");
  await trigger.click();
  await page.getByRole("option", { name: "总是询问" }).click();

  const line = page.getByRole("alert");
  await expect(line).toHaveCount(1);
  await expect(line).toHaveText(`审批方式没有改成「总是询问」：${REASON}`);
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.seen).toHaveLength(1);
  expect(JSON.parse(state.seen[0])).toEqual({ approvalMode: "always-ask" });

  // The select fell back to the stored mode, and so did the server.
  await expect(page.getByRole("button", { name: /审批模式/ })).toContainText("放行只读");
  expect((await stored()).approvalMode).toBe("read-only");

  await page.waitForTimeout(7000);
  await expect(line).toHaveText(`审批方式没有改成「总是询问」：${REASON}`);

  // The select is the retry.
  state.refuse = false;
  await page.getByRole("button", { name: /审批模式/ }).click();
  await page.getByRole("option", { name: "总是询问" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(state.seen).toHaveLength(2);
  await expect(page.getByRole("button", { name: /审批模式/ })).toContainText("总是询问");
  expect((await stored()).approvalMode).toBe("always-ask");
});

test("a refused keyless-off says the access is still open, under that switch", async ({ page }) => {
  const { stored } = await projectWithApi(page, "r209open", {
    enabled: true,
    open: true,
    approvalMode: "read-only",
  });
  expect((await stored()).open).toBe(true);

  const state = { seen: [], refuse: true };
  await interceptWrite(page, "**/api/projects/*/agents/*/api", "PUT", state);

  await page.goto(`/agents/${AGENT}?tab=api`);
  const openSwitch = page.getByRole("switch", { name: "允许无密钥访问" });
  await expect(openSwitch).toHaveAttribute("aria-checked", "true");
  // Turning keyless off asks nothing: it is the write with no card, so its sentence goes under it.
  await openSwitch.click();

  const line = page.getByRole("alert");
  await expect(line).toHaveCount(1);
  await expect(line).toHaveText(
    `无密钥访问没有关掉，任何能访问此地址的程序仍然无需密钥就能调用：${REASON}`,
  );
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.seen).toHaveLength(1);
  expect(JSON.parse(state.seen[0])).toEqual({ open: false });

  // The exposure the press tried to close is still open, here and on the server.
  await expect(openSwitch).toHaveAttribute("aria-checked", "true");
  expect((await stored()).open).toBe(true);

  await page.waitForTimeout(7000);
  await expect(line).toHaveText(
    `无密钥访问没有关掉，任何能访问此地址的程序仍然无需密钥就能调用：${REASON}`,
  );

  // The switch is the retry: allowed now, the sentence goes and keyless access closes.
  state.refuse = false;
  await openSwitch.click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(state.seen).toHaveLength(2);
  await expect(openSwitch).toHaveAttribute("aria-checked", "false");
  expect((await stored()).open).toBe(false);
});
