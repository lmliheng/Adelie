/**
 * Regression: a card's own dialog — its install list, the plugin's detail, its delete
 * confirmation — stays on screen when the install snapshot lands.
 *
 * The page enters with an empty snapshot and fills `installed` when every Agent's skills/hooks
 * read answers (plugins-page.tsx). Until that answer, every library card is filed under 「可安装」;
 * the answer refiles the ones the working Agent holds into the installed section, which is a
 * different list — so React unmounts the card and mounts a new instance in its place. A dialog
 * held in the card instance (a `useState` in it) went with the instance: a reader who opened one
 * before the read landed watched it close by itself, with the click that opened it already spent.
 * The page holds which card dialog is open now, the way it already held the install refusal for
 * exactly this reason.
 *
 * The fixture parks that read until the dialog is on screen and only then lets it answer, so each
 * case opens its dialog inside the window the bug needs. The section head's count is how the test
 * knows the refile really happened: 「已安装的插件 (0)」 before, 「已安装的插件 (1)」 after.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const PLUGIN = {
  source: "user",
  name: "probe-plugin",
  description: "A probe plugin.",
  descriptionZh: "一个探针插件。",
  version: "2026.10.22.1",
  skills: [
    {
      name: "probe-skill",
      description: "A probe skill.",
      descriptionZh: "一个探针技能。",
      version: "2026.10.22.1",
    },
  ],
  hooks: [],
};

const search = (page) => page.getByRole("searchbox", { name: "搜索插件" });
const installedSection = (page, n) => page.getByText(`已安装的插件 (${n})`, { exact: true });
const availableSection = (page, n) => page.getByText(`可安装 (${n})`, { exact: true });
const manageButton = (page) =>
  page.getByRole("button", { name: `管理安装 ${PLUGIN.name}`, exact: true });
const deleteButton = (page) =>
  page.getByRole("button", { name: `删除插件 ${PLUGIN.name}`, exact: true });

/** The library as the page reads it: one user plugin, which is the card the tests act on. */
async function stubLibrary(page) {
  await page.route("**/api/plugins", async (route) => {
    if (new URL(route.request().url()).pathname !== "/api/plugins") return route.fallback();
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        groups: [{ id: "probe", title: "Probe", titleZh: "探针", plugins: [PLUGIN] }],
      }),
    });
  });
}

/**
 * Park the install snapshot: the skills read the card's state comes from is answered with this
 * plugin installed, but only once the test says so. `asked` resolves when that read arrives, so a
 * case can be sure the release is what closes the window rather than a page that never asked.
 */
async function holdSnapshot(page) {
  let release;
  let asked;
  const gate = new Promise((resolve) => (release = resolve));
  const askedOnce = new Promise((resolve) => (asked = resolve));
  await page.route("**/api/projects/*/agents/*/skills", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    asked();
    await gate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ skills: PLUGIN.skills }),
    });
  });
  return { asked: askedOnce, release };
}

/** Entry every case shares: the page with the card filed as installable, its snapshot still held. */
async function openHeld(page) {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  await stubLibrary(page);
  const snapshot = await holdSnapshot(page);
  await page.goto("/plugins");
  await search(page).fill(PLUGIN.name);
  await expect(installedSection(page, 0)).toBeVisible();
  await expect(availableSection(page, 1)).toBeVisible();
  return snapshot;
}

test("the install list stays open when the install snapshot lands", async ({ page }) => {
  const snapshot = await openHeld(page);
  await expect(manageButton(page)).toBeVisible();
  await manageButton(page).click();
  const dialog = page.getByRole("dialog", { name: `管理安装：${PLUGIN.name}` });
  await expect(dialog).toBeVisible();

  await snapshot.asked;
  snapshot.release();

  // The refile happened: the card is now counted with the installed ones…
  await expect(installedSection(page, 1)).toBeVisible();
  await expect(availableSection(page, 1)).toHaveCount(0);
  // …and the dialog the reader opened is still the one on screen.
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: `管理安装：${PLUGIN.name}` })).toBeVisible();
});

test("the plugin's detail stays open when the install snapshot lands", async ({ page }) => {
  const snapshot = await openHeld(page);
  // The card's name is the button that opens the detail (its title is the plugin name).
  await page.getByText(PLUGIN.name, { exact: true }).click();
  const dialog = page.getByRole("dialog", { name: PLUGIN.name });
  await expect(dialog).toBeVisible();

  await snapshot.asked;
  snapshot.release();

  await expect(installedSection(page, 1)).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: PLUGIN.name })).toBeVisible();
});

test("the delete confirmation stays open when the install snapshot lands", async ({ page }) => {
  const snapshot = await openHeld(page);
  await expect(deleteButton(page)).toBeVisible();
  await deleteButton(page).click();
  const dialog = page.getByRole("dialog", { name: `删除 ${PLUGIN.name}` });
  await expect(dialog).toBeVisible();

  await snapshot.asked;
  snapshot.release();

  await expect(installedSection(page, 1)).toBeVisible();
  await expect(dialog).toBeVisible();
  // Still the confirmation it was: the button that would delete the plugin is in it.
  await expect(dialog.getByRole("button", { name: "删除插件", exact: true })).toBeVisible();
});
