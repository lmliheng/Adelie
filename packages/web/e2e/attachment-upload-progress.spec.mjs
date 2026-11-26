/**
 * Regression: a large attachment is uploaded on its own, and the card that follows it says how far
 * it has got.
 *
 * A big file used to ride the task request **inline** as base64 (see the server's
 * attachment-limits.ts: the byte caps go up to 200MB, and a file that size is a ~267MB body once
 * base64 has inflated it). The browser then held the file, its base64 string and the serialized
 * body at once — which is how a 177MB attachment killed a user's tab halfway through a send. Now a
 * file at or over `DIRECT_UPLOAD_MIN_BYTES` goes to `POST /api/sessions/:id/attachments` as raw
 * bytes first (the browser streams the picked `File` from disk), and the task body carries only the
 * scratchpad path that route handed back.
 *
 * This spec exercises that whole chain against the real server: the bytes leave the browser through
 * the direct route, the card following them measures the *file* (not a base64 body), the message
 * wears the on-disk name, and the file the route wrote into the Session scratchpad is exactly the
 * size the browser sent. The upload is throttled over CDP because on loopback the body lands inside
 * the card's 600ms reveal delay.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const MODEL = { provider: "custom", modelId: "claude-4-8" };
const MB = 1024 * 1024;
/** The attachment: 3MB, over the 2MB threshold, so it takes the direct route. */
const FILE_MB = 3;
/** The picked name; it sanitizes to itself, so it is also the name the file gets in the scratchpad. */
const FILE_NAME = "session-2026-11-23-big.jsonl";
/** What the browser may send per second while this test's upload is in flight (~4.4s for the body). */
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

test("a big attachment is uploaded on its own and lands in the scratchpad whole", async ({
  page,
}) => {
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

  // Where the bytes actually go: the direct route, raw.
  const uploads = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/attachments?")) uploads.push(req);
  });

  // The composer's own attachment picker: any type, no `accept`.
  await page.locator('input[type="file"]:not([accept])').setInputFiles({
    name: FILE_NAME,
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(FILE_MB * MB),
  });
  await expect(page.getByRole("button", { name: /^移除文件/ })).toBeVisible();
  await page.getByPlaceholder(/输入消息/).fill("查看这个");
  await page.getByRole("button", { name: "发送" }).click();

  // The card that belongs to the file, named after it: it appears while the bytes are going out,
  // and its total is the FILE — not a base64 body, which is the whole point of the direct route.
  const bar = page.getByRole("progressbar", { name: `正在上传 ${FILE_NAME}` });
  await expect(bar).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => Number((await bar.getAttribute("aria-valuenow")) ?? 0))
    .toBeGreaterThan(0);
  const first = Number(await bar.getAttribute("aria-valuenow"));
  const total = Number(await bar.getAttribute("aria-valuemax"));
  expect(total).toBe(FILE_MB * MB);
  expect(first).toBeLessThan(total);

  await page.waitForTimeout(700);
  const second = Number(await bar.getAttribute("aria-valuenow"));
  expect(second).toBeGreaterThan(first);

  // Landed: the card leaves, the message is in the conversation, and its file line names the
  // on-disk file — the user sees what actually got attached.
  await expect(bar).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText("查看这个")).toBeVisible();
  await expect(page.getByText(`附加文件：${FILE_NAME}`)).toBeVisible();

  // The bytes went out over the direct route, under the name the composer picked.
  expect(uploads.length).toBeGreaterThan(0);
  expect(new URL(uploads[0].url()).searchParams.get("name")).toBe(FILE_NAME);

  // …and reached the scratchpad whole: the file the route wrote is the size the browser sent.
  const stored = await page.request.get(
    `${BASE}/api/sessions/${sessionId}/scratchpad/${encodeURIComponent(FILE_NAME)}`,
  );
  expect(stored.status()).toBe(200);
  expect((await stored.body()).length).toBe(FILE_MB * MB);
});

test("a small attachment still rides the request and shows up the same way", async ({ page }) => {
  const sessionId = await setUp(page, "r_upload_inline");
  await page.goto(`/chat/${sessionId}`);
  await expect(page.locator("textarea")).toBeVisible();

  const uploads = [];
  page.on("request", (req) => {
    if (req.url().includes("/attachments?")) uploads.push(req);
  });

  await page.locator('input[type="file"]:not([accept])').setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.alloc(MB),
  });
  await expect(page.getByRole("button", { name: /^移除文件/ })).toBeVisible();
  await page.getByPlaceholder(/输入消息/).fill("小文件");
  await page.getByRole("button", { name: "发送" }).click();

  // Same user-visible outcome as the large one — the split is about how the bytes travel, not
  // about what the message looks like.
  await expect(page.getByText("小文件")).toBeVisible();
  await expect(page.getByText("附加文件：notes.txt")).toBeVisible();
  // A file under the threshold never takes the direct route.
  expect(uploads).toHaveLength(0);
  const stored = await page.request.get(`${BASE}/api/sessions/${sessionId}/scratchpad/notes.txt`);
  expect(stored.status()).toBe(200);
  expect((await stored.body()).length).toBe(MB);
});
