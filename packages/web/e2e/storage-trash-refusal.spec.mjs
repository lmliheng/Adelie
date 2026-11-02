/**
 * Regression: the ledger's trash says, under the row, why a restore or a deletion was refused —
 * and that sentence outlives the six seconds a toast lives.
 *
 * The row is what stays: same id, same size, same state, and the same button is the retry. A toast
 * was the only account of a failure there, so six seconds later the trash looked as if nothing had
 * been pressed at all — on the one page whose "delete for good" is the app's only deletion.
 *
 * The trash read and both writes are stubbed at `page.route`; everything else (the ledger, the
 * mode, the session) is the real server. The entry is a listing the page could have been handed
 * from a real run, and the reason asserted is the app's own sentence for the code the server would
 * send (`internal`).
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** An entry as `GET …/trash` would list one: a compact timestamp id, as a run is moved at. */
const TRASH_ID = "20261103120000";

/** The lines the row draws, in the words of the button that was pressed. */
const RESTORE_REFUSED = `恢复「${TRASH_ID}」被拒：服务器内部错误，请稍后重试。`;
const PURGE_REFUSED = `彻底删除「${TRASH_ID}」被拒：服务器内部错误，请稍后重试。`;

/**
 * Sign in as the seeded administrator (the page is admin-only) and give the Project a model — the
 * onboarding overlay covers the page without one.
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
  // The trash's buttons are gated by the cleanup mode, which is off on an untouched install.
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

/**
 * Answer the trash listing with one entry, and both of its writes with a refusal (500 `internal`)
 * until `letThrough()` — after which they answer the way a run that landed would. The writes are
 * counted, so the spec can tell a request from a dead button.
 */
const SUCCESS = {
  restore: { id: TRASH_ID, restored: ["logs/run"], skipped: [], remaining: false },
  purge: { purged: [{ id: TRASH_ID, bytes: 4096, files: 12 }] },
};

async function stubTrash(page, writes) {
  let refuse = true;
  await page.route("**/api/admin/storage/trash", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        entries: [
          {
            id: TRASH_ID,
            createdAt: "2026-11-03T04:00:00.000Z",
            planId: null,
            bytes: 4096,
            files: 12,
            items: [{ path: "logs/run", bytes: 4096, files: 12 }],
            expired: false,
          },
        ],
        ttlDays: 7,
      }),
    });
  });
  for (const action of ["restore", "purge"]) {
    await page.route(`**/api/admin/storage/trash/${action}`, async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      writes.push({ action, body: route.request().postDataJSON() });
      await route.fulfill({
        status: refuse ? 500 : 200,
        contentType: "application/json",
        // The entry is a fixture, so a "landed" write is answered here too — the real route would
        // refuse an id it never wrote, which is a different refusal than the one under test.
        body: JSON.stringify(
          refuse
            ? { error: { code: "internal", message: "Internal server error" } }
            : SUCCESS[action],
        ),
      });
    });
  }
  return () => {
    refuse = false;
  };
}

test("a refused restore or deletion says so under its row, past the toast it used to be", async ({
  page,
}) => {
  await ready(page);
  const writes = [];
  const letThrough = await stubTrash(page, writes);

  await page.goto("/");
  const settings = await openStorage(page);
  const row = settings.locator("tr", { hasText: TRASH_ID });
  await expect(row).toBeVisible();

  // Refused restore: the row is drawn unchanged, with the reason under its buttons.
  await row.getByRole("button", { name: "恢复", exact: true }).click();
  await expect(row.getByRole("alert")).toHaveText(RESTORE_REFUSED);
  await expect(row.getByRole("alert")).toHaveCount(1);
  // Still listed as it was — nothing was restored, so nothing about the row may change.
  await expect(row).toBeVisible();
  expect(writes.map((w) => w.action)).toEqual(["restore"]);
  expect(writes[0].body).toEqual({ id: TRASH_ID });

  // Six seconds is how long a toast lives; this sentence has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(row.getByRole("alert")).toHaveText(RESTORE_REFUSED);

  // The other button asks its own question, and the line switches to its words.
  await row.getByRole("button", { name: "彻底删除", exact: true }).click();
  await expect(row.getByRole("alert")).toHaveText(PURGE_REFUSED);
  await expect(row.getByRole("alert")).toHaveCount(1);
  expect(writes.map((w) => w.action)).toEqual(["restore", "purge"]);

  // With the refusal lifted the same button works, and the sentence goes: the row is the retry.
  letThrough();
  await row.getByRole("button", { name: "彻底删除", exact: true }).click();
  await expect(row.getByRole("alert")).toHaveCount(0);
  expect(writes.map((w) => w.action)).toEqual(["restore", "purge", "purge"]);
});
