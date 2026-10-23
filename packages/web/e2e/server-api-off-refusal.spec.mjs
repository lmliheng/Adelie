/**
 * Regression: the admin's server-wide "Agent API" switch (Settings › Server › Agent API) asks
 * before it goes off, and that question closes only once its write landed — one the server
 * refused keeps the card with the reason inside it.
 *
 * The card used to close first and write second: when the write came back refused, the server
 * was exactly as it had been (every Agent's API still on), yet the reason arrived as a line
 * under the switch the card had already left behind, and the retry meant opening the card again.
 * It now stays until the outcome is known, drawing a refusal under the sentence it asked with
 * (`ConfirmModal`'s `refusal` slot), so the retry is the same button.
 *
 * The write is the page's own — refused at `page.route` — and every check reads the settings
 * back from the server, so both halves of the contract are covered. The switch is left on at the
 * end: other specs call every Agent's API with the server-wide switch on.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;

/** The refusal the write answers with: its own words prove the reason came back into the card. */
const REFUSAL = { code: "server_settings_read_only", message: "server settings are read-only" };

/** The server-wide switch as the server holds it. */
const stored = async (request) =>
  (await (await request.get(`${BASE}/api/admin/settings`)).json()).settings.agentApiEnabled;

/**
 * Take over the switch's write: `state.seen` keeps every one of them, and while `state.refuse`
 * is set the write is answered with the refusal instead of reaching the real route.
 */
async function interceptWrite(page, state) {
  await page.route("**/api/admin/settings", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    state.seen.push(route.request().postData() ?? "");
    if (!state.refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
}

/** Settings opens on the account menu's row; the switch lives on its Server group. */
async function openServerApiPage(page) {
  // The changes a Project without a model key asks for on the chat page are not part of this
  // test, so the page it starts from is the Agents list — the shell and its account menu with no
  // chat page behind them.
  await page.goto("/agents");
  // The sidebar's user row shares its name with the Project switcher (the initial Project is
  // named after the user), so take the last match — the bottom account menu.
  await page.getByRole("button", { name: ADMIN_ID }).last().click();
  await page.getByRole("menuitem", { name: "设置", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "Agent API", exact: true }).click();
  return settings;
}

/** The card's own text with the refusal line dropped — the only thing a refusal may change. */
async function cardText(card) {
  return (await card.innerText()).replace(/\n操作被拒绝：[^\n]*/, "");
}

/** The notification region: a refusal must not be announced there (that is the old toast). */
const notifications = (page) => page.getByRole("region", { name: "通知" });

test("a refused server-wide API-off keeps the card, its sentence and every Agent's API on", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  expect(await stored(page.request)).toBe(true);

  const state = { seen: [], refuse: true };
  await interceptWrite(page, state);

  await openServerApiPage(page);
  const apiSwitch = page.getByRole("switch", { name: "允许 Agent API" });
  await expect(apiSwitch).toHaveAttribute("aria-checked", "true");
  await apiSwitch.click();
  const dialog = page.getByRole("dialog", { name: "关闭 Agent API？" });
  await expect(dialog).toBeVisible();
  const sentence = await cardText(dialog);

  await dialog.getByRole("button", { name: "关闭", exact: true }).click();

  // The reason is in the card that asked, and it is not a toast.
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.seen).toHaveLength(1);
  await expect(dialog).toBeVisible();
  expect(await cardText(dialog)).toBe(sentence);

  // The switch never flipped and the server still has every Agent's API on.
  await expect(apiSwitch).toHaveAttribute("aria-checked", "true");
  expect(await stored(page.request)).toBe(true);

  // Closing the card decides nothing, and opening it again does not carry the old reason over.
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  await apiSwitch.click();
  const reopened = page.getByRole("dialog", { name: "关闭 Agent API？" });
  await expect(reopened).toBeVisible();
  await expect(reopened.getByText(REFUSAL.message)).toHaveCount(0);

  // The retry is the same card; this time the write lands, and the card closes.
  state.refuse = false;
  await reopened.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(reopened).toHaveCount(0);
  expect(state.seen).toHaveLength(2);
  expect(JSON.parse(state.seen[1])).toEqual({ agentApiEnabled: false });
  await expect(apiSwitch).toHaveAttribute("aria-checked", "false");
  expect(await stored(page.request)).toBe(false);

  // Leave the switch on for the specs that call an Agent's API after this one.
  await apiSwitch.click();
  await expect(apiSwitch).toHaveAttribute("aria-checked", "true");
  expect(await stored(page.request)).toBe(true);
});
