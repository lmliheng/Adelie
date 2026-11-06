/**
 * Regression: the two controls that install a library plugin onto one Agent — the card's
 * one-click "Install to <Agent>" button and a row's toggle in the "manage installs" Modal — keep
 * a refused install's reason under the control that sent it, instead of in a toast that dismisses
 * itself after six seconds.
 *
 * An install moves the page's snapshot optimistically and moves it back when the server refuses,
 * so both controls return to the very button that retries. What used to vanish was the reason: it
 * arrived as a notification over the list, and afterwards the card read exactly as it had before
 * the press, with the files still not installed and nothing saying why. The sentence is drawn
 * under that button or that row now (`role="alert"`, danger colour, two lines, the whole sentence
 * on hover) and names the Agent, which matters in the Modal — one row per Agent.
 *
 * The library listing is stubbed: a development data root ships no user plugin, so without a
 * fixture there is no card to install from. The write itself is what the tests measure (the
 * page's own POST /api/projects/:p/agents/:a/plugins); everything else stays real.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const AGENT = "default_agent";

/** The plugin under test: a user plugin this Project holds on no Agent, so its card offers the install. */
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

/**
 * What the refused install answers with: a code the interface has its own copy for, plus an
 * English message that must not reach the page — that is how the test tells the localized
 * sentence from the server's raw words.
 */
const REFUSAL = { code: "unknown_plugin", message: "RAW ENGLISH SERVER MESSAGE" };
/** The line the page draws for that code (S.errors.byCode), after the plugin and the Agent. */
const REASON = "该插件不在插件库中。";

const notifications = (page) => page.getByRole("region", { name: "通知" });

/** The library as the page reads it: one user plugin, and no Agent holds it. */
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
 * Take over the install; `state.refuse` is flipped by the retry half and `state.writes` keeps
 * every request body, so the tests can tell what was really sent. A written one answers with the
 * Agent's refreshed lists, which is what the real route returns.
 */
async function stubInstall(page, state) {
  await page.route("**/api/projects/*/agents/*/plugins", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    state.writes.push(route.request().postDataJSON());
    if (state.refuse) {
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: REFUSAL }),
      });
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ skills: PLUGIN.skills, hooks: [] }),
    });
  });
}

/** The sentence one refused install leaves: the plugin, the Agent it was going to, and the reason. */
const refusalLine = (page) =>
  page.getByRole("alert").filter({ hasText: `未能将 ${PLUGIN.name} 安装到` });

/** Open the page and unfold both lists: a typed query opens them and leaves this single card. */
async function openPage(page) {
  await page.goto("/plugins");
  const search = page.getByRole("searchbox", { name: "搜索插件" });
  await expect(search).toBeVisible();
  await search.fill(PLUGIN.name);
}

/** The card's own install button, by the accessible name it carries for this plugin. */
const cardInstall = (page) =>
  page.getByRole("button", { name: new RegExp(`^安装到 .+ ${PLUGIN.name}$`) });

test("a refused one-click install keeps the reason under the card's button, past six seconds", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const state = { writes: [], refuse: true };
  await stubLibrary(page);
  await stubInstall(page, state);
  await openPage(page);

  await cardInstall(page).click();

  const line = refusalLine(page);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(new RegExp(`^未能将 ${PLUGIN.name} 安装到 .+：${REASON}$`));
  // The interface's own words for that code, never the server's English message.
  await expect(line).not.toContainText("RAW ENGLISH");
  // The reason is the card's, not a notification's.
  await expect(notifications(page)).not.toContainText("RAW ENGLISH");
  // Nothing was installed, so the button that retries is still there.
  await expect(cardInstall(page)).toBeEnabled();

  // Past the six seconds an error notification lived: the sentence is still under the card.
  await page.waitForTimeout(7000);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(new RegExp(`^未能将 ${PLUGIN.name} 安装到 .+：${REASON}$`));

  // The retry is the same button, and it clears the sentence of the attempt before it.
  state.refuse = false;
  await cardInstall(page).click();
  await expect(refusalLine(page)).toHaveCount(0);
  expect(state.writes).toEqual([{ names: [PLUGIN.name] }, { names: [PLUGIN.name] }]);
});

test("a refused install from a manage-installs row leaves the reason on the card that comes back", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const state = { writes: [], refuse: true };
  await stubLibrary(page);
  await stubInstall(page, state);
  await openPage(page);

  await page.getByRole("button", { name: `管理安装 ${PLUGIN.name}`, exact: true }).click();
  const modal = page.getByRole("dialog", { name: `管理安装：${PLUGIN.name}` });
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: `安装 ${AGENT}`, exact: true }).click();

  // The install marks the plugin present as the request leaves, which files the card into the
  // installed section and closes the Modal with it. The refusal rolls that back, so the card is
  // back in the available list — and the sentence the page kept is drawn under it, naming the
  // Agent the refused row was about.
  const line = refusalLine(page);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(new RegExp(`^未能将 ${PLUGIN.name} 安装到 .+：${REASON}$`));
  await expect(notifications(page)).not.toContainText("RAW ENGLISH");
  await expect(modal).toHaveCount(0);

  // Past the six seconds an error notification lived: the sentence is still under the card.
  await page.waitForTimeout(7000);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(new RegExp(`^未能将 ${PLUGIN.name} 安装到 .+：${REASON}$`));

  // The retry is the same row, one Modal away; it clears the sentence of the attempt before it.
  state.refuse = false;
  await page.getByRole("button", { name: `管理安装 ${PLUGIN.name}`, exact: true }).click();
  const again = page.getByRole("dialog", { name: `管理安装：${PLUGIN.name}` });
  await expect(again).toBeVisible();
  await again.getByRole("button", { name: `安装 ${AGENT}`, exact: true }).click();
  await expect(refusalLine(page)).toHaveCount(0);
  expect(state.writes).toEqual([{ names: [PLUGIN.name] }, { names: [PLUGIN.name] }]);
});
