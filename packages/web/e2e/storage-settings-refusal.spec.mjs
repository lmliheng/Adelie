/**
 * Regression: the ledger says, beside the control, why a cleanup-mode switch or a pin was refused
 * — and that sentence outlives the six seconds a toast lives.
 *
 * Neither write moves optimistically: the switch shows the position the server answered with, and a
 * refused pin leaves that row's button reading what it read before the click. So a toast was the
 * only account of the failure, and six seconds later the page looked as if nothing had been pressed
 * — on the page whose switch is the gate on every write it offers ("nothing moves without a
 * review"), and whose pin is what keeps a path off later bills.
 *
 * The bill listing and both writes are stubbed at `page.route`; everything else (the ledger, the
 * mode, the session) is the real server. The reason asserted is the app's own sentence for the code
 * the server would send (`internal`).
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** The shared notification region: a refusal must not also land in it. */
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

/** The one path the stubbed bill lists, and the words both refusals use for it. */
const PATH = "workspaces/probe";

/**
 * Sign in as the seeded administrator (the page is admin-only), give the Project a model — the
 * onboarding overlay covers the page without one — and turn the cleanup mode on, which is what
 * draws the bill and enables every control this spec presses.
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

/** A bill a real scan could have written: one movable entry, still inside its day. */
const PLAN = {
  id: "probe-plan",
  root: "/tmp/adelie-probe",
  createdAt: "2026-11-03T04:00:00.000Z",
  expiresAt: "2026-11-04T04:00:00.000Z",
  fingerprint: "probe-fingerprint",
  totalBytes: 4096,
  entries: [
    {
      path: PATH,
      class: "tmp_workspaces",
      bytes: 4096,
      files: 3,
      lastModifiedAt: "2026-11-01T04:00:00.000Z",
      rules: ["empty"],
      fingerprint: "probe-entry",
      executable: true,
    },
  ],
  excluded: [],
  executableClasses: ["tmp_workspaces"],
  appliedAt: null,
  appliedPaths: [],
  usable: true,
  expired: false,
};

/** The refusal both routes answer with until their stub lets a write through. */
const REFUSAL = { error: { code: "internal", message: "Internal server error" } };

/**
 * Answer one settings write with a refusal (500 `internal`) until `letThrough()`. The writes are
 * counted, so the spec can tell a request from a dead control. A read of the same URL (the mode's
 * settings are one) is the server's own answer — only the write is stubbed.
 */
async function stubWrite(page, url, writes, landed) {
  let refuse = true;
  await page.route(url, async (route) => {
    if (route.request().method() === "GET") return route.fallback();
    writes.push(route.request().postDataJSON());
    await route.fulfill({
      status: refuse ? 500 : 200,
      contentType: "application/json",
      body: JSON.stringify(refuse ? REFUSAL : landed),
    });
  });
  return () => {
    refuse = false;
  };
}

test("a refused cleanup-mode switch says so beside the switch, past the toast it used to be", async ({
  page,
}) => {
  await ready(page);
  const writes = [];
  // The mode is on, so the switch asks to turn it off — and the settings answer it lands with is
  // the serviced position, which the page then acts on.
  const letThrough = await stubWrite(page, "**/api/admin/storage/settings", writes, {
    settings: { enabled: false, trashTtlDays: 7, pins: [] },
  });

  await page.goto("/");
  const settings = await openStorage(page);
  const mode = settings.getByRole("switch", { name: "允许人工审核后的清理" });
  await expect(mode).toBeVisible();
  await expect(mode).toHaveAttribute("aria-checked", "true");

  await mode.click();
  const line = settings.getByRole("alert");
  await expect(line).toHaveText("关闭清理模式被拒：服务器内部错误，请稍后重试。");
  // Said once, beside the switch: the same sentence no longer arrives as a toast as well.
  await expectNoToast(page);
  // The switch never moved: the position is the server's answer, not the click.
  await expect(mode).toHaveAttribute("aria-checked", "true");
  expect(writes).toEqual([{ enabled: false }]);

  // Six seconds is how long a toast lives; this sentence has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(settings.getByRole("alert")).toHaveText(
    "关闭清理模式被拒：服务器内部错误，请稍后重试。",
  );

  // With the refusal lifted the same switch works, the mode really turns off, and the line goes.
  letThrough();
  await mode.click();
  await expect(mode).toHaveAttribute("aria-checked", "false");
  await expect(settings.getByRole("alert")).toHaveCount(0);
  expect(writes).toEqual([{ enabled: false }, { enabled: false }]);
});

test("a refused pin says so under the row's own button, past the toast it used to be", async ({
  page,
}) => {
  await ready(page);
  const writes = [];
  // The bill is a fixture, so the page is handed it; the pin itself is the write under test.
  await page.route("**/api/admin/storage/plans", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plans: [PLAN] }),
    });
  });
  // A landed pin answers with the settings blob the page then draws the pins from.
  const letThrough = await stubWrite(page, "**/api/admin/storage/plans/probe-plan/pin", writes, {
    settings: { enabled: true, trashTtlDays: 7, pins: [PATH] },
  });

  await page.goto("/");
  const settings = await openStorage(page);
  const row = settings.locator("tr", { hasText: PATH });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "固定", exact: true }).click();
  await expect(row.getByRole("alert")).toHaveText(
    `固定「${PATH}」被拒：服务器内部错误，请稍后重试。`,
  );
  await expect(row.getByRole("alert")).toHaveCount(1);
  await expectNoToast(page);
  // The button still says "固定": nothing was pinned, so nothing about the row may claim it was.
  await expect(row.getByRole("button", { name: "固定", exact: true })).toBeVisible();
  expect(writes).toEqual([{ path: PATH, pinned: true }]);

  // Six seconds is how long a toast lives; this sentence has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(row.getByRole("alert")).toHaveText(
    `固定「${PATH}」被拒：服务器内部错误，请稍后重试。`,
  );

  // With the refusal lifted the same button works, and the sentence goes: the row is the retry.
  letThrough();
  await row.getByRole("button", { name: "固定", exact: true }).click();
  await expect(row.getByRole("alert")).toHaveCount(0);
  await expect(row.getByRole("button", { name: "取消固定", exact: true })).toBeVisible();
  expect(writes).toEqual([
    { path: PATH, pinned: true },
    { path: PATH, pinned: true },
  ]);
});
