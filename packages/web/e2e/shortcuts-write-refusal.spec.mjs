/**
 * Regression: the draft screen's shortcuts ask before they write, and a refused write keeps the
 * question — with the server's words inside it — instead of closing on the way out.
 *
 * Both dialogs used to dismiss themselves on the click: the editor closed before the request even
 * left, so a refused save rolled the list back and took the title and prompt the user had just
 * typed with it, and the delete card closed on a toast that dismissed itself while the row it had
 * failed to remove stayed on screen. Both now close only once the write landed: a refusal leaves
 * the editor exactly as it was (fields, caret, the Save button that retries the same write) and
 * the delete card carries `ConfirmModal`'s `refusal` slot.
 *
 * The refusal is a 500 with its own code (`prefs_readonly`), which nothing in the app translates —
 * so the sentence that shows up is the one the probe sent, proving the card reports the server.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const U = "shortcutrefusal";
const P = "password123";

/** The refusal: a code no client translation covers, so its message reaches the dialog verbatim. */
const REFUSAL = { code: "prefs_readonly", message: "prefs are read-only right now" };
const SHOWN = `操作被拒绝：${REFUSAL.message}`;

const SEED = {
  id: "sc-e2e-refusal",
  title: "探针快捷指令",
  prompt: "探针正文：把这段填进输入框。",
};
const RENAMED = "改名后的快捷指令";

/** Fail every write to the prefs route from now on; `off()` lets the same click land. */
async function refusePrefsWrites(page) {
  const turnOff = async () => {
    await page.unroute("**/api/me/prefs");
  };
  await page.route("**/api/me/prefs", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
  return turnOff;
}

test("shortcuts: a refused save and a refused delete keep their dialog, with the server's words", async ({
  page,
}) => {
  await provisionAndLogin(page.request, U, P);

  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  // A Project needs a model, or the onboarding overlay covers the draft page.
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

  // One shortcut to edit and to delete, seeded through the route the folder reads.
  const seeded = await page.request.put(`${BASE}/api/me/prefs`, {
    data: { draftShortcuts: [SEED] },
  });
  expect(seeded.ok(), "seed a shortcut").toBeTruthy();

  await page.goto(`${BASE}/chat/new`);
  const folder = page.getByRole("button", { name: /我的快捷指令/ });
  await folder.click();
  await expect(page.getByRole("button", { name: SEED.title })).toBeVisible();

  // ---- the editor: a refused save keeps the dialog and the typed text ----------------------
  await page.getByRole("button", { name: "编辑" }).first().click();
  const editor = page.getByRole("dialog");
  await expect(editor).toBeVisible();

  const title = editor.getByLabel("名称");
  await title.fill(RENAMED);

  let turnOff = await refusePrefsWrites(page);
  await editor.getByRole("button", { name: "保存" }).click();

  // Still open, still saying why, and the rename the user typed is still in the field.
  await expect(editor).toBeVisible();
  await expect(editor.getByText(SHOWN)).toBeVisible();
  await expect(title).toHaveValue(RENAMED);

  // The same button retries the same write: the card closes once it lands, and only then.
  await turnOff();
  await editor.getByRole("button", { name: "保存" }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByRole("button", { name: RENAMED })).toBeVisible();

  // ---- the delete card: a refused delete keeps the card and the row ------------------------
  await page.getByRole("button", { name: "删除" }).first().click();
  const card = page.getByRole("dialog");
  await expect(card).toBeVisible();

  turnOff = await refusePrefsWrites(page);
  await card.getByRole("button", { name: "删除" }).click();

  await expect(card).toBeVisible();
  await expect(card.getByText(SHOWN)).toBeVisible();
  // Nothing was removed: the row is still there for the retry the card now offers.
  await expect(page.getByRole("button", { name: RENAMED })).toBeVisible();

  await turnOff();
  await card.getByRole("button", { name: "删除" }).click();
  await expect(card).toBeHidden();
  await expect(page.getByRole("button", { name: RENAMED })).toHaveCount(0);

  // And the write really landed: the stored list no longer holds the shortcut.
  const prefs = await (await page.request.get(`${BASE}/api/me/prefs`)).json();
  expect(prefs.prefs.draftShortcuts).toEqual([]);
});
