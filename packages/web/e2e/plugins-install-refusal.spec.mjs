/**
 * Regression: installing a module plugin asks first, and a refused install keeps that question —
 * with the server's words inside it — instead of closing on the way out of the request.
 *
 * The page used to close the confirmation from a `finally`: the plugin was still exactly as it
 * was (the server refused, so nothing was listed) but the reason arrived as a toast that
 * dismissed itself after six seconds and sat above the page rather than in the card. The card now
 * closes only once the write landed, and a refusal leaves it open with the reason drawn under its
 * sentence (`ConfirmModal`'s `refusal` slot), so the retry is the same button.
 *
 * The list read is stubbed: a development data root ships no module plugin, so without a fixture
 * the page has no install row at all. Both halves the tests need are the page's own contract with
 * the server — the list it reads and the write it sends — and the write is what is measured.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

/** A module plugin the registry already describes, so the row carries real metadata. */
const SPEC = "@adelie/sandbox-bwrap";

/** The install call the page makes; a 500 with its own words proves the reason came back. */
const REFUSAL = { code: "plugin_store_closed", message: "plugin store is closed" };

/** The list as the page reads it: `listed` are the specifiers this Project already runs. */
function deployment(listed) {
  return {
    plugins: listed.map((specifier) => ({
      specifier,
      active: true,
      builtin: true,
      modules: [],
      replaces: [],
      everywhere: true,
      machines: [],
      here: true,
    })),
    shipped: [SPEC],
    file: ".project_config.toml",
    machineId: "probe-machine",
    restartPending: false,
  };
}

/**
 * Serve the deployment read from a fixture and take over the install write. `state.refuse` is
 * flipped by the retry test; `state.posts` keeps every write so the tests can tell how many were
 * sent.
 */
async function stubDeployment(page, state) {
  const answer = (route, body) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/projects/*/plugins/installed*", async (route) => {
    const req = route.request();
    if (req.method() === "GET") return answer(route, deployment(state.listed));
    if (req.method() !== "POST") return route.fallback();
    state.posts.push(req.postDataJSON());
    if (state.refuse) {
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: REFUSAL }),
      });
    }
    state.listed = [SPEC];
    return answer(route, deployment(state.listed));
  });
}

/** The module row's own install button, then the shared confirmation. */
async function openInstallDialog(page) {
  await page.getByRole("button", { name: `安装 ${SPEC}`, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The card's own text with the refusal line dropped — the only thing a refusal may change. */
async function cardText(dialog) {
  return (await dialog.innerText()).replace(/\n操作被拒绝：[^\n]*/, "");
}

const installButton = (page) => page.getByRole("button", { name: `安装 ${SPEC}`, exact: true });
const removeButton = (page) => page.getByRole("button", { name: `移除 ${SPEC}`, exact: true });

test("a refused install keeps the question, the reason and the row", async ({ page }) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const state = { listed: [], posts: [], refuse: true };
  await stubDeployment(page, state);

  await page.goto("/plugins");
  await expect(installButton(page)).toBeVisible();
  const dialog = await openInstallDialog(page);
  const sentence = await cardText(dialog);

  await dialog.getByRole("button", { name: "安装", exact: true }).click();

  // The reason is in the card that asked, and it is not a toast: the notification region holds no
  // dismissible button, and the card reads exactly as it did before the attempt plus one line.
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  expect(state.posts).toEqual([{ specifier: SPEC }]);
  await expect(dialog).toBeVisible();
  expect(await cardText(dialog)).toBe(sentence);

  // Nothing was installed anywhere: the row still offers Install and no Remove.
  await expect(installButton(page)).toBeVisible();
  await expect(removeButton(page)).toHaveCount(0);

  // Closing the card decides nothing, and opening it again does not carry the old reason over.
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(installButton(page)).toBeVisible();
  const reopened = await openInstallDialog(page);
  await expect(reopened.getByText(REFUSAL.message)).toHaveCount(0);
});

test("the retry after a refused install writes it, and only a written one closes the card", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const state = { listed: [], posts: [], refuse: true };
  await stubDeployment(page, state);

  await page.goto("/plugins");
  await expect(installButton(page)).toBeVisible();
  const dialog = await openInstallDialog(page);
  await dialog.getByRole("button", { name: "安装", exact: true }).click();
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(state.posts).toHaveLength(1);

  // The retry is the same card, and this time the write lands: the card closes and the row is
  // the installed one (Remove, no Install).
  state.refuse = false;
  await dialog.getByRole("button", { name: "安装", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.posts).toHaveLength(2);
  await expect(removeButton(page)).toBeVisible();
  await expect(installButton(page)).toHaveCount(0);
});
