/**
 * Regression: a shortcut edit the account refused keeps the reason on the page instead of in a
 * notification that dismisses itself after six seconds.
 *
 * The edit applies at once — the browser mirror is written before any request — so the row keeps
 * showing the new chord either way, and a refusal is invisible on the row itself. The write is one
 * PUT for the whole document (every row's edit, and "Reset all"), so the sentence belongs to the
 * page: at its top, above the rows it contradicts, until the next edit replaces it. Before this
 * the reason lived only in a toast, and the next load quietly hydrated the account's copy over the
 * mirror — the change disappearing with nothing left to explain it.
 *
 * The write is stubbed with a 500 carrying a code the interface translates plus an English wire
 * message, which is how the test tells the localized sentence from the raw one.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const U = "shortcutsave";
const P = "password123";

/** The refusal: a code the interface has its own words for, plus a message that must not reach the page. */
const REFUSAL = { code: "internal", message: "RAW ENGLISH SERVER MESSAGE" };
/** The line the page draws for that code (S.errors.byCode), after what failed. */
const REASON = "服务器内部错误，请稍后重试。";
/** What the sentence says about a write that never reached the account (reason last, app-wide shape). */
const HEAD = "快捷键没能保存到账号";

const notifications = (page) => page.getByRole("region", { name: "通知" });

/** Fail every write to the prefs route from now on; `off()` lets the same kind of edit land. */
async function refusePrefsWrites(page) {
  await page.route("**/api/me/prefs", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
  return async () => {
    await page.unroute("**/api/me/prefs");
  };
}

/** Provision a user, give the Project a model (without one the onboarding overlay covers the page). */
async function signedInWithModel(page) {
  await provisionAndLogin(page.request, U, P);
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
  // The overrides are replaced whole on every write and this user may survive from an earlier run,
  // so the page starts from the registry defaults: the rows the test rebinds are predictable.
  const cleared = await page.request.put(`${BASE}/api/me/prefs`, {
    data: { keybindings: { v: 1 } },
  });
  expect(cleared.ok(), "clear keybindings").toBeTruthy();
}

/** The settings dialog, on its Shortcuts page. */
async function openShortcutsPage(page) {
  await page.getByRole("button", { name: U }).last().click();
  await page.getByRole("menuitem", { name: "设置", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "快捷键", exact: true }).click();
  return settings;
}

/** The recorder buttons, one per command, in list order. */
const recorders = (settings) => settings.locator('button[data-tooltip="更改快捷键"]');

/** What the shortcuts page itself says when the account did not take the edit: the server's prefs row. */
async function storedKeybindings(page) {
  const prefs = await (await page.request.get(`${BASE}/api/me/prefs`)).json();
  return prefs.prefs.keybindings ?? null;
}

/** Record a chord on the nth row: activate its recorder, press the combination, wait for the write. */
async function record(page, settings, index, chord) {
  const row = recorders(settings).nth(index);
  const before = await row.textContent();
  const write = page.waitForRequest(
    (req) => req.url().includes("/api/me/prefs") && req.method() === "PUT",
  );
  await row.click();
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press(chord);
  await expect(row).not.toHaveAttribute("aria-pressed", "true");
  await write;
  // The row shows the new chord straight away — that is the whole reason the refusal needs its own
  // place: nothing on the row can say the account never heard.
  await expect
    .poll(async () => (await row.textContent())?.trim() ?? "")
    .not.toBe((before ?? "").trim());
}

test("a refused shortcut save keeps the reason on the page, and the account keeps its old copy", async ({
  page,
}) => {
  await signedInWithModel(page);
  await page.goto(`${BASE}/chat/new`);
  const settings = await openShortcutsPage(page);
  await expect(recorders(settings).first()).toBeVisible();

  const turnOff = await refusePrefsWrites(page);
  const beforeWrite = await storedKeybindings(page);
  await record(page, settings, 0, "Control+Shift+9");

  const refusal = settings.getByTestId("shortcut-save-refusal");
  await expect(refusal).toBeVisible();
  await expect(refusal).toContainText(HEAD);
  await expect(refusal).toContainText(REASON);
  await expect(refusal).toContainText("重新加载后会退回账号上原来的快捷键");
  // The wire's English message never reaches the page: the sentence is the interface's own.
  await expect(refusal).not.toContainText("RAW ENGLISH SERVER MESSAGE");
  // Nothing is toasted for it any more.
  await expect(notifications(page).getByText(REASON)).toHaveCount(0);
  // The account's copy is exactly what it was before the refused edit: the write bought nothing.
  expect(beforeWrite).toEqual({ v: 1 });
  expect(await storedKeybindings(page)).toEqual(beforeWrite);

  // It is not a six-second notification: it is still there after one.
  await page.waitForTimeout(7000);
  await expect(refusal).toBeVisible();

  // The next edit is the retry — and this one lands, so the sentence goes.
  await turnOff();
  await record(page, settings, 1, "Control+Shift+8");
  await expect(refusal).toHaveCount(0);
  const saved = await storedKeybindings(page);
  expect(saved?.linux, "the landed edit reached the account").toBeTruthy();
});
