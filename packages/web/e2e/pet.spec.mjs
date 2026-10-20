/**
 * The desktop pet's page, end to end in the real app: /pet is the whole content of the shell's
 * companion window (main.ts loads it there), so what is asserted here is what a person sees on
 * their desktop — the penguin, the panel behind it, and a notice arriving on its own.
 *
 * The shell itself is not part of this suite (Playwright drives a browser), which is exactly the
 * point of the design: everything the pet shows it reads over HTTP, so a browser tab can be held
 * to the same behavior. The two readings that belong to the shell — the model balance's route and
 * the update snapshot — therefore assert their desktop-only wording here; the desktop half is
 * verified by the shell's own smoke run.
 *
 * The notice is the real thing, not a stub: a Session under `always-ask` is sent a Prompt that
 * makes the mock model call a tool, the runtime escalates that call, and the user-channel event
 * about it (session_approvals) is what the pet turns into a bubble.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const U = "petuser";
const P = "password123";

// The penguin bobs — an infinite CSS animation — and Playwright refuses to click an element whose
// box never settles. Reduced motion is the app's own answer to that preference (the global rule in
// styles.css turns every animation off), so the spec emulates it per page; that also pins the pet
// as clickable with animations disabled.

test("the pet shows its readings, and speaks up when a call needs the user", async ({ page }) => {
  await provisionAndLogin(page.request, U, P);

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
          pricing: { cacheRead: 1, cacheWrite: 5, output: 10 },
        },
      ],
    },
  });
  expect(put.ok(), "put models").toBeTruthy();

  await page.goto(`${BASE}/pet`);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const penguin = page.getByRole("button", { name: "点我：余额、新版本和通知" });
  await penguin.waitFor();
  // Nothing else of the app is drawn: this window is 260×240 of chrome, and the app shell
  // (sidebar, chat) must not be in it.
  await expect(page.getByPlaceholder(/输入消息/)).toHaveCount(0);

  // --- the panel behind a click ---
  await penguin.click();
  await expect(page.getByText("模型余额", { exact: true })).toBeVisible();
  await expect(page.getByText("客户端更新", { exact: true })).toBeVisible();
  await expect(page.getByText("通知", { exact: true })).toBeVisible();
  // Both shell-owned readings say so rather than failing, and the pet's own hide action is not
  // offered where there is no pet window to hide.
  await expect(page.getByText("余额只在桌面应用里能读。", { exact: true })).toBeVisible();
  await expect(page.getByText("客户端更新只在桌面应用里能读。", { exact: true })).toBeVisible();
  await expect(page.getByText("暂时没有新通知。", { exact: true })).toBeVisible();
  await expect(page.getByText("隐藏桌宠")).toHaveCount(0);

  // Back to just the penguin, so the bubble below is what is on screen.
  await penguin.click();
  await expect(page.getByText("模型余额", { exact: true })).toHaveCount(0);

  // --- a call that needs the user, announced without anyone touching the app ---
  const sess = await (
    await page.request.post(`${BASE}/api/projects/${projectId}/agents/default_agent/sessions`, {
      data: { provider: "custom", modelId: "claude-4-8", approvalMode: "always-ask" },
    })
  ).json();
  const sessionId = sess.session.sessionId;
  const task = await page.request.post(`${BASE}/api/sessions/${sessionId}/tasks`, {
    data: { input: [{ type: "text", text: "Help me set up @theme" }] },
  });
  expect(task.ok(), "post task").toBeTruthy();

  const bubble = page.getByRole("status");
  await expect(bubble).toContainText("有 1 个工具调用在等你批准", { timeout: 30_000 });

  // The bubble fades on its own; what it said stays in the panel.
  await penguin.click();
  await expect(page.getByText("有 1 个工具调用在等你批准", { exact: true })).toBeVisible();
});
