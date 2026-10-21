/**
 * Regression: a settings card's action asks first, and an action the machine did not run keeps
 * that question — with the reason inside it — instead of closing on the way out of the request.
 *
 * The page used to close the confirmation the moment Run was pressed: when the request was
 * refused, or when the group answered `ok: false` ("another task is still running on this
 * card"), the machine was exactly as it was, yet the reason arrived as a toast that dismissed
 * itself after six seconds and sat above the card rather than in it. The card now closes on the
 * answer — only a run the group reports as started closes it — and a refusal leaves it open
 * with the words under its sentence (`ConfirmModal`'s `refusal` slot), so the retry is the same
 * button.
 *
 * The card is stubbed: no group on a development data root reports an action (the Windows
 * sandbox offers its buttons on Windows only), so without a fixture the page has no card with
 * a Run button at all. Both halves the tests need are the page's own contract with the server —
 * the list it reads and the write it sends — and the write is what is measured.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

/** The card as the page reads it: the group, and the one action its heading draws a button for. */
const ENTRY = {
  name: "sandbox-wsl",
  configuration: { title: "WSL", titleZh: "WSL", properties: {} },
  values: {},
  actions: [{ id: "initialize", title: "Initialize sandbox distro", titleZh: "初始化沙盒发行版" }],
};

/** The action's button (its title, in the zh dictionary the suite runs in). */
const ACTION = "初始化沙盒发行版";

/** The request refused: a 500 with its own words proves the reason came back to the card. */
const REFUSAL = { code: "plugin_action_refused", message: "the machine is busy right now" };

/** The group's own answer when it will not run the action (the Windows sandbox's second run). */
const NOT_RUN = "Another task is still running on this card.";

/** What a started action answers: it reports progress on the card, so the card may close. */
const STARTED = "Initialize sandbox distro: its progress shows on the WSL card.";

/**
 * Serve the settings read from the fixture and take over the action write. `state.answer` says
 * what the write answers — a refusal, the group's `ok: false`, or a started run — and
 * `state.posts` keeps every write so the tests can tell how many were sent.
 */
async function stubConfig(page, state) {
  const json = (route, body) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/admin/plugin-config**", async (route) => {
    const req = route.request();
    if (new URL(req.url()).pathname.endsWith("/action")) {
      state.posts.push(req.postDataJSON());
      return state.answer(route, json);
    }
    if (req.method() !== "GET") return route.fallback();
    return json(route, { plugins: [ENTRY] });
  });
}

/** The settings dialog, on the page the card lives on. */
async function openSettings(page) {
  await page.goto("/plugins");
  await page.getByRole("button", { name: "插件设置", exact: true }).click();
  const pane = page.getByRole("dialog", { name: "设置" });
  await expect(pane).toBeVisible();
  return pane;
}

/** The card's action button, then the shared confirmation (named by its own title). */
async function askAction(page) {
  await page.getByRole("button", { name: ACTION, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "执行插件操作" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The card's own text with the refusal line dropped — the only thing a refusal may change. */
async function cardText(dialog) {
  return (await dialog.innerText()).replace(/\n操作被拒绝：[^\n]*/, "");
}

/** The notification region: a refusal must not be announced there (that is the old toast). */
const notifications = (page) => page.getByRole("region", { name: "通知" });

const runButton = (dialog) => dialog.getByRole("button", { name: "执行", exact: true });

test("a refused action keeps the question, the reason and the card", async ({ page }) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const state = {
    posts: [],
    answer: (route, json) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: REFUSAL }),
      }),
  };
  await stubConfig(page, state);

  const pane = await openSettings(page);
  await expect(pane.getByRole("button", { name: ACTION, exact: true })).toBeVisible();
  const dialog = await askAction(page);
  const sentence = await cardText(dialog);

  await runButton(dialog).click();

  // The reason is in the card that asked, and it is not a toast: the notification region holds
  // no dismissible button, and the card reads exactly as it did before the attempt plus one line.
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.posts).toEqual([{ name: ENTRY.name, action: "initialize" }]);
  await expect(dialog).toBeVisible();
  expect(await cardText(dialog)).toBe(sentence);

  // Closing the card decides nothing, and opening it again does not carry the old reason over.
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: ACTION, exact: true })).toBeVisible();
  const reopened = await askAction(page);
  await expect(reopened.getByText(REFUSAL.message)).toHaveCount(0);
});

test("an action the group answers `ok: false` keeps the card, and a started one closes it", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const state = {
    posts: [],
    answer: (route, json) => json(route, { ok: false, message: NOT_RUN, plugins: [ENTRY] }),
  };
  await stubConfig(page, state);

  await openSettings(page);
  const dialog = await askAction(page);
  await runButton(dialog).click();

  // Nothing ran: the card says what the group said, and stays open for the retry.
  await expect(dialog.getByText(NOT_RUN)).toBeVisible();
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  expect(state.posts).toHaveLength(1);

  // The retry is the same card, and this time the group reports it started: the card closes.
  state.answer = (route, json) => json(route, { ok: true, message: STARTED, plugins: [ENTRY] });
  await runButton(dialog).click();
  await expect(dialog).toHaveCount(0);
  expect(state.posts).toHaveLength(2);
  await expect(page.getByRole("button", { name: ACTION, exact: true })).toBeVisible();
});
