/**
 * Regression: a message whose bytes are still on the wire says how far it has got.
 *
 * Attachments ride the task request **inline** as base64 (see the server's attachment-limits.ts:
 * the byte caps go up to 200MB, and a file that size is a ~267MB body once base64 has inflated it).
 * The browser sent it with `fetch`, which reports nothing about an upload, so on a slow link the
 * composer simply sat disabled for as long as it took — minutes, with no word about whether
 * anything was happening at all. A 177MB file is what a user reported this with.
 *
 * The request now goes out over XHR for the reading (api/xhr-upload.ts), and the reading is shown
 * on the package's own long-operation card — the corner progress card an Agent deletion already uses
 * (`startProgress`, driven by features/chat/message-upload-progress.ts).
 *
 * The upload is throttled over CDP, because on loopback the body lands well inside the card's 600ms
 * reveal delay and there would be nothing to observe. What is asserted is what a reader sees: the
 * card up while the body is going out, its bar advancing between readings, and it gone once the
 * message is in the conversation. Nothing is stubbed — the session, the composer, the request and
 * the card are the app's own.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const MODEL = { provider: "custom", modelId: "claude-4-8" };
const MB = 1024 * 1024;
/** The attachment: 3MB of bytes, ~4MB once base64 has inflated it — over the card's 2MB threshold. */
const FILE_MB = 3;
/** What the browser may send per second while this test's request is in flight (~6s for the body). */
const UPLOAD_BYTES_PER_S = 700 * 1024;

/** A Project on the mock, one running-capable Session, and the composer in view. */
async function setUp(page, userId) {
  await provisionAndLogin(page.request, userId, P);
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
  const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
    data: {
      defaultModel: MODEL,
      models: [{ ...MODEL, apiKey: "sk-mock", baseUrl: MOCK, contextWindow: 200000 }],
    },
  });
  expect(put.ok(), "put models").toBeTruthy();
  const created = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
    { data: { ...MODEL, approvalMode: "allow-all" } },
  );
  expect(created.ok(), await created.text()).toBeTruthy();
  return (await created.json()).session.sessionId;
}

test("a big attachment reports its upload while it is going out", async ({ page }) => {
  const sessionId = await setUp(page, "r_upload_progress");
  await page.goto(`/chat/${sessionId}`);
  await expect(page.locator("textarea")).toBeVisible();

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: UPLOAD_BYTES_PER_S,
  });

  // The composer's own attachment picker: any type, no `accept`.
  await page.locator('input[type="file"]:not([accept])').setInputFiles({
    name: "session-2026-11-23-big.jsonl",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(FILE_MB * MB),
  });
  await expect(page.getByRole("button", { name: /^移除文件/ })).toBeVisible();
  await page.getByPlaceholder(/输入消息/).fill("查看这个");
  await page.getByRole("button", { name: "发送" }).click();

  const bar = page.getByRole("progressbar", { name: "正在上传消息" });
  await expect(bar).toBeVisible({ timeout: 15_000 });

  // A reading, not a spinner: the bar knows how much of the body has gone out, and that number
  // moves. The total is the body (bigger than the file, because the attachment is base64 on the
  // wire), and the message is still on its way when the first reading is in.
  await expect
    .poll(async () => Number((await bar.getAttribute("aria-valuenow")) ?? 0))
    .toBeGreaterThan(0);
  const first = Number(await bar.getAttribute("aria-valuenow"));
  const total = Number(await bar.getAttribute("aria-valuemax"));
  expect(total).toBeGreaterThan(FILE_MB * MB);
  expect(first).toBeLessThan(total);
  // The line under the bar is the same pair of byte readings.
  await expect(
    page.getByText(/^\d+(\.\d+)?(B|KB|MB|GB) \/ \d+(\.\d+)?(B|KB|MB|GB)$/),
  ).toBeVisible();

  await page.waitForTimeout(700);
  const second = Number(await bar.getAttribute("aria-valuenow"));
  expect(second).toBeGreaterThan(first);

  // Landed: the card leaves and the message is in the conversation.
  await expect(bar).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText("查看这个")).toBeVisible();
});
