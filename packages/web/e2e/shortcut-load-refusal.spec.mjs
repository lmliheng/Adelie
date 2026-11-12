/**
 * Regression: a shortcut read the account refused keeps the reason on the page, instead of leaving
 * the rows looking like the account's own shortcuts.
 *
 * The keymap has to exist before any request answers (the dispatcher installs at module evaluation),
 * so the browser mirror is what the rows read until `GET /api/me/prefs` arrives. When that read is
 * refused the mirror simply stands — here the previous session's document, so one row reads
 * "未设置" — and an edit would write that document back whole, because one PUT replaces
 * `keybindings` rather than merging. Before this the page said nothing: no notification, no line,
 * just rows that were not the account's.
 *
 * The read is stubbed with a 500 carrying a code the interface translates plus an English wire
 * message, which is how the test tells the localized sentence from the raw one.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const U = "shortcutread";
const P = "password123";

/** The refusal: a code the interface has its own words for, plus a message that must not reach the page. */
const REFUSAL = { code: "internal", message: "RAW ENGLISH SERVER MESSAGE" };
/** The line the page draws for that code (S.errors.byCode), after what failed. */
const REASON = "服务器内部错误，请稍后重试。";
/** What the sentence says about the rows it stands above (reason last, app-wide shape). */
const HEAD = "没能从账号读取快捷键";

const notifications = (page) => page.getByRole("region", { name: "通知" });

/** Fail every read of the prefs route until the returned `off()` restores it. */
async function refusePrefsReads(page) {
  await page.route("**/api/me/prefs", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
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

/** Provision a user and give the Project a model (without one the onboarding overlay covers the page). */
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
  // The account holds no overrides, and this user may survive from an earlier run: both the stored
  // copy and the rows are then predictable.
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

test("a refused shortcut read says the rows came from this browser, and a reload retries", async ({
  page,
}) => {
  await signedInWithModel(page);

  // What the previous session left in this browser: one unbound command the account never held.
  const mirror = { v: 1, linux: { "editor.save": null } };
  await page.addInitScript(
    (doc) => localStorage.setItem("penguin.keybindings", JSON.stringify(doc)),
    mirror,
  );
  const turnOff = await refusePrefsReads(page);

  await page.goto(`${BASE}/chat/new`);
  const settings = await openShortcutsPage(page);

  const refusal = settings.getByTestId("shortcut-load-failure");
  await expect(refusal).toBeVisible();
  await expect(refusal).toContainText(HEAD);
  await expect(refusal).toContainText(REASON);
  await expect(refusal).toContainText("盖掉账号上原来的按键");
  // The wire's English message never reaches the page: the sentence is the interface's own.
  await expect(refusal).not.toContainText("RAW ENGLISH SERVER MESSAGE");
  // The rows below it are the mirror, not the account's copy: that is what the sentence is about.
  await expect(settings.getByText("未设置", { exact: true })).toHaveCount(1);
  // Nothing is toasted for it, and the account's copy is untouched.
  await expect(notifications(page).getByText(REASON)).toHaveCount(0);
  const prefs = await (await page.request.get(`${BASE}/api/me/prefs`)).json();
  expect(prefs.prefs.keybindings).toEqual({ v: 1 });

  // It is not a six-second notification: it is still there after one.
  await page.waitForTimeout(7000);
  await expect(refusal).toBeVisible();

  // A reload is the retry — the read now answers, so the account's copy replaces the mirror.
  await turnOff();
  await page.reload();
  const again = await openShortcutsPage(page);
  await expect(again.getByTestId("shortcut-load-failure")).toHaveCount(0);
  await expect(again.getByText("未设置", { exact: true })).toHaveCount(0);
});
