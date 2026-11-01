/**
 * Regression: a reachability test whose REQUESTS failed says why in the probe block itself
 * (Settings → 服务器 → 代理选项), under the button that ran it, and the sentence outlives the six
 * seconds a toast lives.
 *
 * Every outcome the test can have — reachable, timed out, DNS, refused, TLS — arrives inside a
 * 200 and lands on its target's row. Only the request failing (a lost session, a dead server) is
 * an error, and that one filled no row at all: the block looked exactly as it did before anyone
 * pressed the button, and the reason arrived as a notification over it. A reader who looked away
 * was left with six targets still saying 「未测试」 and no way to tell "not run" from "could not
 * run".
 *
 * The probe route is stubbed rather than travelled: what this spec is about is what the page does
 * with the answer, and reaching six real provider hosts from a test machine would make it depend
 * on the network. The refusal is the app's own sentence for the code the server would send
 * (`internal`), so the line on screen is the localized one behind the shared lead-in.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** The line the block draws: the shared lead-in plus the app's sentence for `internal`. */
const REFUSED = "操作被拒绝：服务器内部错误，请稍后重试。";

/**
 * Sign in as the seeded administrator (the page is admin-only) and give the Project a model —
 * the onboarding overlay covers the page without one.
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
  return projectId;
}

/** The settings dialog, opened the way a person opens it: the user menu, then 代理选项. */
async function openProxy(page) {
  // The user menu shares its name with the Project switcher, so take the last match (as chat.spec).
  await page.getByRole("button", { name: ADMIN_ID }).last().click();
  await page.getByRole("menuitem", { name: "设置", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "代理选项", exact: true }).click();
  return settings;
}

/** The probe block: the heading, its button and the targets it lists — one `<section>`. */
function probeBlock(settings) {
  // Anchored on the block's own heading rather than on the button: while a run is in flight the
  // button reads 「测速中…」, and the block has to stay findable to assert what it says.
  return settings.locator('section:has-text("连通性测速")');
}

/**
 * Answer every probe request with a refusal (500 `internal`), until `letThrough()` — one request
 * per target, so a refusal is what six of them land as. Counted, so the spec can tell how many
 * requests the block really fired.
 */
async function stubProbe(page, seen) {
  let refuse = true;
  await page.route("**/api/admin/settings/proxy-probe/*", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const provider = route.request().url().split("/").pop();
    seen.push(provider);
    if (!refuse) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          probe: {
            provider,
            url: `https://${provider}.example.invalid/v1/models`,
            outcome: "reachable",
            ms: 42,
            status: 200,
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal", message: "Internal server error" } }),
    });
  });
  return () => {
    refuse = false;
  };
}

test("a failed run keeps its reason in the probe block, past the toast it used to be", async ({
  page,
}) => {
  await ready(page);
  const attempts = [];
  const letThrough = await stubProbe(page, attempts);

  await page.goto("/");
  const settings = await openProxy(page);
  const block = probeBlock(settings);
  await expect(block).toBeVisible();
  const notices = page.getByRole("region", { name: "通知" });
  const rows = block.locator("li");
  // The targets are listed before anyone presses the button — the block knows what it will fetch.
  await expect(rows).toHaveCount(6);
  await expect(block.getByRole("alert")).toHaveCount(0);

  // Run it: every request is refused, and the block says so once — not six times, and not as a
  // notification over a block that looks untouched.
  await block.getByRole("button", { name: "测速", exact: true }).click();
  await expect(block.getByRole("alert")).toHaveText(REFUSED);
  await expect(block.getByRole("alert")).toHaveCount(1);
  expect(attempts).toHaveLength(6);
  await expect(notices.getByRole("button")).toHaveCount(0);

  // Nothing was measured: every row still says 「未测试」, and none of them drew the sentence —
  // it is about the run, so it belongs to the block rather than to any one target.
  await expect(block.getByText("未测试", { exact: true })).toHaveCount(6);
  await expect(block.locator("li").getByRole("alert")).toHaveCount(0);
  // The button is the retry, still at rest.
  await expect(block.getByRole("button", { name: "测速", exact: true })).toBeEnabled();

  // Six seconds is how long a toast lives; this sentence has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(block.getByRole("alert")).toHaveText(REFUSED);
  await expect(notices.getByRole("button")).toHaveCount(0);

  // The next run is the retry: it lands, so the sentence of the last attempt goes with it.
  letThrough();
  await block.getByRole("button", { name: "测速", exact: true }).click();
  // Each row carries its own latency, next to the words that say what it means (`· 已连通`, which
  // only a screen reader reads out).
  await expect(rows.filter({ hasText: "42 ms" })).toHaveCount(6);
  await expect(block.getByRole("alert")).toHaveCount(0);
  expect(attempts).toHaveLength(12);
});
