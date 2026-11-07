/**
 * Regression: the messaging card's Save says why a write did not land — in the card, above that
 * button — instead of leaving the form exactly as it was with the reason in a notification that
 * dismissed itself after six seconds.
 *
 * Save persists the selected channel's credentials and writes nothing optimistically: the fields
 * keep every value that was typed, the saved baseline does not move (so the form still reads as
 * unsaved), and the success toast never comes. Six seconds later the screen therefore read exactly
 * as it had before the press, while the credential the server rejected is a field on that same
 * form. The sentence now stays at the end of the card — above Save in both hosts, which is what
 * lets the dialog (footer Save) and the conversation's Messaging panel (Save under the form) share
 * one slot — until the next save or a channel switch.
 *
 * Both hosts are travelled: the first two tests use the session-row dialog, the third opens the
 * dock panel. Only the write that must be refused is taken over; the login, the Session and the
 * stored binding are real. The binding points at a closed local port, so nothing here reaches the
 * internet.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";

/** Where this channel's connector dials: nothing listens on port 9, so nothing leaves the machine. */
const DEAD_ORIGIN = "http://127.0.0.1:9";
/** The row menu action that opens the dialog (`S.messaging.bindAction`). */
const OPEN = "远程控制";
/** The labels of the two Save actions this spec presses (dialog footer and panel body). */
const SAVE = "保存";
/** The app's own sentence for a failed request (`internal`), not the server's wire message. */
const REFUSED_LINE = "保存失败：服务器内部错误，请稍后重试。";
/** The toast a save that landed pops (`S.common.saved`). */
const SAVED_TOAST = "已保存";

/**
 * Run one action from a Session row's "更多" menu. The trigger is a hover-revealed icon sitting
 * over the row's own clickable surface: when the click lands a frame before the row has re-laid
 * itself out, it hits the row (which navigates) and the menu never opens. So the open is retried
 * and verified — the same helper chat.spec.mjs uses for the same menu.
 */
async function pickRowAction(page, row, name) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await row.hover();
    await row.getByRole("button", { name: "更多" }).click();
    const item = page.getByRole("button", { name, exact: true });
    if (await item.count()) {
      await item.first().click();
      return;
    }
    await page.keyboard.press("Escape");
  }
  throw new Error(`the row menu never offered "${name}"`);
}

/**
 * Configure the mock model, create one titled conversation and bind Feishu to it; returns its id.
 *
 * `appId` is unique per test: one account may hold only one enabled connection, and these tests
 * share a data root, so a fixed id would let an earlier run's leftover row answer the later one
 * with a 409 that has nothing to do with what is being measured.
 */
async function seed(page, projectId, title, appId) {
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

  const created = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
    { data: { provider: "custom", modelId: "claude-4-8" } },
  );
  expect(created.ok(), "create session").toBeTruthy();
  const sessionId = (await created.json()).session.sessionId;

  const renamed = await page.request.patch(`${BASE}/api/sessions/${sessionId}`, {
    data: { title },
  });
  expect(renamed.ok(), "rename session").toBeTruthy();

  // The stored binding is what the form opens on; the write this spec measures is a NEW one.
  const bound = await page.request.put(`${BASE}/api/sessions/${sessionId}/messaging/feishu`, {
    data: { appId, appSecret: "saved-app-secret", baseDomain: DEAD_ORIGIN },
  });
  expect(bound.ok(), "bind feishu").toBeTruthy();
  return sessionId;
}

/**
 * Take over the Feishu binding write. `state.answer` picks what it does: `"refuse"` (the request
 * itself failing) or `"accept"` (letting the real route run); every call records the body, so a
 * test can check it carried the form's values.
 */
async function stubSave(page, state) {
  await page.route("**/api/sessions/*/messaging/feishu", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    state.seen.push(route.request().postDataJSON());
    if (state.answer === "accept") return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal", message: "RAW ENGLISH MESSAGE" } }),
    });
  });
}

/**
 * Collect the page's console errors. The editor's own poll touches `/api/projects/…/machines`,
 * which answers 403 to anyone but an administrator, and this spec stubs a 500 on purpose — the
 * app's normal behaviour for this account and the answer under test — so those are recognised by
 * status and path and everything else fails.
 */
function watchConsole(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    errors.push({ text: msg.text(), url: msg.location()?.url ?? "" });
  });
  return {
    unexpected: () =>
      errors.filter(({ text, url }) => {
        const status = /status of (\d{3})/.exec(text)?.[1];
        if (status === "403" && url.includes("/machines")) return false;
        if (status === "500" && url.includes("/messaging/")) return false;
        return true;
      }),
  };
}

/** Open the binding dialog from the seeded row (it opens on Feishu, the only bound channel). */
async function openDialog(page, title) {
  await page.goto("/chat");
  const sidebar = page.getByRole("complementary");
  const row = sidebar.locator("li", { hasText: title }).first();
  await expect(row).toBeVisible();
  await pickRowAction(page, row, OPEN);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The notification region: a refusal must not be announced there (that is the old toast). */
const notifications = (page) => page.getByRole("region", { name: "通知" });

test("a refused save keeps the reason in the form, and only there", async ({ page }) => {
  const console_ = watchConsole(page);
  await provisionAndLogin(page.request, "savetest", P);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const title = `e2e refused save ${Date.now()}`;
  await seed(page, projectId, title, `save-refused-${Date.now()}`);

  const state = { seen: [], answer: "refuse" };
  await stubSave(page, state);
  const dialog = await openDialog(page, title);

  // A real edit, so the form is dirty when the write is refused and the test can tell that the
  // refusal changed nothing on it.
  const appId = dialog.getByLabel("App ID", { exact: true });
  await appId.fill("cli_save_edited");
  await dialog.getByRole("button", { name: SAVE, exact: true }).click();

  // The sentence sits in the card, exactly once, in the interface's own words.
  await expect(dialog.getByRole("alert")).toHaveText(REFUSED_LINE);
  await expect(dialog.getByRole("alert")).toHaveCount(1);
  await expect(dialog.getByRole("alert")).not.toContainText("RAW ENGLISH MESSAGE");
  // Not a toast: the notification region holds nothing to dismiss.
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  // The write travelled, carrying the edited value.
  expect(state.seen).toHaveLength(1);
  expect(state.seen[0].appId).toBe("cli_save_edited");

  // Six seconds is how long a toast lives; this line has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(dialog.getByRole("alert")).toHaveText(REFUSED_LINE);
  // And the form is untouched: the edit is still in the field, Save is still pressable.
  await expect(appId).toHaveValue("cli_save_edited");
  await expect(dialog.getByRole("button", { name: SAVE, exact: true })).toBeEnabled();
  expect(console_.unexpected()).toEqual([]);
});

test("the next save replaces the sentence, and a write that lands clears it", async ({ page }) => {
  const console_ = watchConsole(page);
  await provisionAndLogin(page.request, "saveretry", P);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const title = `e2e retried save ${Date.now()}`;
  await seed(page, projectId, title, `save-retried-${Date.now()}`);

  const state = { seen: [], answer: "refuse" };
  await stubSave(page, state);
  const dialog = await openDialog(page, title);
  await dialog.getByLabel("App ID", { exact: true }).fill("cli_save_retried");
  await dialog.getByRole("button", { name: SAVE, exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(REFUSED_LINE);

  // Same button, second press: this time the write lands, so the sentence goes and the ordinary
  // saved toast arrives — the refusal was about the attempt, not about the credential.
  state.answer = "accept";
  await dialog.getByRole("button", { name: SAVE, exact: true }).click();
  await expect(notifications(page).getByText(SAVED_TOAST)).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  expect(state.seen).toHaveLength(2);
  expect(state.seen[1].appId).toBe("cli_save_retried");
  expect(console_.unexpected()).toEqual([]);
});

test("the conversation's Messaging panel draws the same sentence above its own Save", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await provisionAndLogin(page.request, "savepanel", P);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const title = `e2e panel save ${Date.now()}`;
  const sessionId = await seed(page, projectId, title, `save-panel-${Date.now()}`);

  const state = { seen: [], answer: "refuse" };
  await stubSave(page, state);
  await page.goto(`${BASE}/chat/${sessionId}`);
  await page.getByPlaceholder(/输入消息/).waitFor();
  // The dock's picker opens the panel on the Session the route names. The panel is a tab in the
  // right dock, and a dock that is hidden stays in the DOM at zero size — so "on screen" is
  // `data-open`, the same reading dock.spec.mjs uses.
  await page.getByTestId("dock-toggle-right").click();
  await page.getByTestId("dock-pick-messaging").click();
  const panel = page.locator('[data-testid="dock"][data-position="right"][data-open="true"]');
  await expect(panel.locator('[data-tab-id="messaging"][data-active="true"]')).toBeVisible();

  const appId = panel.getByLabel("App ID", { exact: true });
  await appId.fill("cli_save_panel");
  const save = panel.getByRole("button", { name: SAVE, exact: true });
  await save.click();

  // One slot in the shared body is above Save in both hosts: this is the panel's Save, and the
  // sentence has to sit over it rather than under it.
  const alert = panel.getByRole("alert");
  await expect(alert).toHaveText(REFUSED_LINE);
  const alertBox = await alert.boundingBox();
  const saveBox = await save.boundingBox();
  expect(alertBox.y + alertBox.height).toBeLessThanOrEqual(saveBox.y + 1);
  await expect(notifications(page).getByRole("button")).toHaveCount(0);

  // Past the six seconds a toast would have lived.
  await page.waitForTimeout(7_000);
  await expect(alert).toHaveText(REFUSED_LINE);
  await expect(appId).toHaveValue("cli_save_panel");
  expect(console_.unexpected()).toEqual([]);
});
