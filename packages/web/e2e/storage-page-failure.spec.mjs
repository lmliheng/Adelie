/**
 * Regression: the ledger page's three background failures say why where their own control is, and
 * nothing of it lands in a notification that dismisses itself.
 *
 * Before, all three were a toast plus a sentence without the reason — "could not read the storage
 * report", "could not read the cleanup mode's settings", "the scan failed" — so six seconds later
 * the page said only that something had gone wrong, next to a button that is the retry, and the
 * server's own words were gone. The same page's writes already had a line of their own
 * (storage-settings-refusal.spec.mjs / storage-trash-refusal.spec.mjs); these are the reads and the
 * scan that the mode gates.
 *
 * All three refusals are stubs at `page.route` (`500 internal`, the code the specs already know the
 * sentence for); everything else — the walk, the mode, the trash, the bill — is the real server.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** The shared notification region: a failure must not also land in it. */
const notices = (page) => page.getByRole("region", { name: "通知" });

/**
 * Nothing was raised in the notification region for this refusal, read at once.
 *
 * `toHaveCount(0)` retries for the whole expect timeout, so it would also pass against a toast
 * that simply expired after six seconds — the very behaviour this file is about. This reads the
 * count once, after a short settle so the refusal's own render has landed.
 */
async function expectNoToast(page) {
  await page.waitForTimeout(400);
  expect(await notices(page).getByRole("button").count()).toBe(0);
}

/** The server's own words for `500 internal`, as the app says them in Chinese. */
const REASON = "服务器内部错误，请稍后重试。";

/**
 * Sign in as the seeded administrator (the page is admin-only), give the Project a model — the
 * onboarding overlay covers the page without one — and turn the cleanup mode on, which is what
 * draws the bill and enables the scan.
 */
async function ready(page) {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
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
  const mode = await page.request.put(`${BASE}/api/admin/storage/settings`, {
    data: { enabled: true },
  });
  expect(mode.ok(), "enable cleanup mode").toBeTruthy();
}

/** The settings dialog, opened the way a person opens it: the user menu, then a page. */
async function openStorage(page) {
  // The user menu shares its name with the Project switcher, so take the last match (as chat.spec).
  await page.getByRole("button", { name: ADMIN_ID }).last().click();
  await page.getByRole("menuitem", { name: "设置", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "存储台账", exact: true }).click();
  return settings;
}

/** The refusal body both stubs answer with until they let the request through. */
const REFUSAL = { error: { code: "internal", message: "Internal server error" } };

/**
 * Refuse the requests this predicate picks (500 `internal`) until `letThrough()`; every other
 * request on the same URL falls back to the server. The picked ones are counted, so the spec can
 * tell a request from a dead control.
 */
async function stubRefusal(page, url, picks, seen) {
  let refuse = true;
  await page.route(url, async (route) => {
    if (!picks(route.request())) return route.fallback();
    seen.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    if (!refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify(REFUSAL),
    });
  });
  return () => {
    refuse = false;
  };
}

test("a walk that could not be read says why where the report would be, and the same button retries it", async ({
  page,
}) => {
  await ready(page);
  const seen = [];
  const letThrough = await stubRefusal(
    page,
    "**/api/admin/storage",
    (req) => req.method() === "GET",
    seen,
  );

  await page.goto("/");
  const settings = await openStorage(page);
  const line = settings.getByText(`无法取得存储报告：${REASON}`);
  await expect(line).toBeVisible();
  // Nothing was told through a notification instead: the sentence has its own place on the page.
  await expectNoToast(page);
  // The report itself never arrived, and the page says so in that one sentence.
  await expect(settings.getByText("数据根目录", { exact: true })).toHaveCount(0);

  // Six seconds is how long a toast lives; this sentence has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(line).toBeVisible();

  // With the refusal lifted, the button that asked measures for real and the sentence goes.
  letThrough();
  await settings.getByRole("button", { name: "重新测量", exact: true }).click();
  await expect(line).toHaveCount(0);
  await expect(settings.getByText("数据根目录", { exact: true })).toBeVisible();
  expect(seen.length).toBeGreaterThanOrEqual(2);
});

test("a scan the server refused says why above the bill it did not write", async ({ page }) => {
  await ready(page);
  const seen = [];
  // Only the scan (POST) is refused; the bill listing (GET) is the server's own answer.
  const letThrough = await stubRefusal(
    page,
    "**/api/admin/storage/plans",
    (req) => req.method() === "POST",
    seen,
  );

  /** How many bills the server holds — the page adopts the newest, so this is "was one written". */
  const bills = async () =>
    (await (await page.request.get(`${BASE}/api/admin/storage/plans`)).json()).plans.length;
  const before = await bills();

  await page.goto("/");
  const settings = await openStorage(page);
  await settings.getByRole("button", { name: "重新扫描", exact: true }).click();
  const line = settings.getByText(`扫描失败，没有可以审阅的账单：${REASON}`);
  await expect(line).toBeVisible();
  await expectNoToast(page);
  // The refusal wrote nothing: the server still holds the bills it held before the click.
  expect(await bills()).toBe(before);

  await page.waitForTimeout(7_000);
  await expect(line).toBeVisible();
  expect(seen).toEqual(["POST /api/admin/storage/plans"]);

  // The same button, with the refusal lifted, writes the bill — and the sentence goes with it.
  letThrough();
  await settings.getByRole("button", { name: "重新扫描", exact: true }).click();
  await expect(line).toHaveCount(0);
  await expect(settings.getByText("账单编号", { exact: true })).toBeVisible();
  expect(await bills()).toBe(before + 1);
});

test("a mode that could not be read says why beside the switch it had to guess", async ({
  page,
}) => {
  await ready(page);
  // The mode's own read is the one refused; its write stays the server's.
  const seen = [];
  await stubRefusal(page, "**/api/admin/storage/settings", (req) => req.method() === "GET", seen);

  await page.goto("/");
  const settings = await openStorage(page);
  const line = settings.getByText(`无法读取清理模式设置，因此按「已关闭」处理：${REASON}`);
  await expect(line).toBeVisible();
  await expectNoToast(page);
  // The switch shows the position the page had to assume, which is what the sentence explains.
  const mode = settings.getByRole("switch", { name: "允许人工审核后的清理" });
  await expect(mode).toHaveAttribute("aria-checked", "false");

  await page.waitForTimeout(7_000);
  await expect(line).toBeVisible();
  expect(seen.length).toBe(1);
});
