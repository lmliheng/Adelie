/**
 * Regression: adding a published plugin to the library from its row — the shelf's one verb —
 * keeps its reason IN that row when the write does not land, instead of in a toast that
 * dismisses itself after six seconds.
 *
 * The fetch writes nothing else: a refusal leaves the plugin exactly as it was (nowhere yet) and
 * leaves the same row standing with the same button, which is the retry. Nothing in the row was
 * typed either, so there is no field to put the reason under — it belongs under the row, and that
 * is where it is drawn now (`role="alert"`, danger colour, two lines, the whole sentence on
 * hover). A 409 is not a refusal: it is the overwrite question, which the row still raises.
 *
 * Both halves the test needs are the page's own contract with the server — the registry it reads
 * (a development data root publishes nothing, so without a fixture there is no shelf row) and the
 * write it sends — and the write is what is measured.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** A published package the build does not ship and the library does not hold: a shelf row. */
const SPEC = "@adelie/probe-shelf";

/** The line this page draws for the code the refused write answers with. */
const REFUSED = "装入插件库失败：下载失败，请确认该地址可以访问。";

/** The registry entry, shaped like the server's own rows. */
const ENTRY = {
  name: SPEC,
  version: "2026.11.6.1",
  description: "A published plugin the shelf offers",
  authors: ["adelie"],
  license: "MIT",
  keywords: ["probe"],
  categories: ["tooling"],
  updatedAt: 1762387200,
};

/**
 * Sign in as the seeded administrator (the shelf's verb is admin-only) and give the Project a
 * model — the onboarding overlay covers the page without one.
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
  return projectId;
}

/** The registry read: one entry nothing else on the page carries, so it lands on the shelf. */
async function stubRegistry(page) {
  await page.route("**/api/plugins/registry", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plugins: [ENTRY] }),
    });
  });
}

/**
 * Take over the import the row sends. `state.mode` is "refuse", "exists" (the 409 that becomes a
 * question) or "land"; `state.posts` keeps every body so the tests can tell what was really sent.
 */
async function stubDownload(page, state) {
  const answer = (route, status, body) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  await page.route("**/api/plugins/download", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    state.posts.push(route.request().postDataJSON());
    if (state.mode === "refuse")
      return answer(route, 502, {
        error: { code: "download_failed", message: "the registry did not answer" },
      });
    if (state.mode === "exists")
      return answer(route, 409, {
        error: {
          code: "plugin_exists",
          message: `A user plugin named ${SPEC.split("/").pop()} is already installed.`,
        },
      });
    return answer(route, 200, {
      plugin: { name: SPEC.split("/").pop(), version: ENTRY.version, description: "" },
    });
  });
}

/** Open the page and unfold the shelf: a typed query opens both lists and narrows them here. */
async function openShelf(page) {
  await page.goto("/plugins");
  const search = page.getByPlaceholder("搜索插件");
  await expect(search).toBeVisible();
  await search.fill("probe-shelf");
  const row = page.getByRole("link", { name: new RegExp("probe-shelf") }).first();
  await expect(row).toBeVisible();
  return row;
}

/** The row's one verb, by the accessible name it carries for this specifier. */
const addVerb = (page) => page.getByRole("button", { name: `装入插件库 ${SPEC}` });

test("a refused add to the library keeps the reason in the row, past six seconds", async ({
  page,
}) => {
  await ready(page);
  const state = { posts: [], mode: "refuse" };
  await stubRegistry(page);
  await stubDownload(page, state);
  await openShelf(page);

  await addVerb(page).click();

  const line = page.getByRole("alert").filter({ hasText: "装入插件库失败" });
  await expect(line).toBeVisible();
  await expect(line).toHaveText(REFUSED);
  // The reason is the row's, not a notification's.
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(REFUSED);
  // The row and its retry are still there: a refusal changed nothing.
  await expect(addVerb(page)).toBeEnabled();

  // Past the six seconds an error notification lived: the sentence is still on screen.
  await page.waitForTimeout(7000);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(REFUSED);

  // The retry is the same button, and it clears the reason of the attempt before it.
  state.mode = "land";
  await addVerb(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "装入插件库失败" })).toHaveCount(0);
  expect(state.posts).toEqual([{ url: SPEC }, { url: SPEC }]);
});

test("a name already taken still asks before overwriting, and draws no refusal line", async ({
  page,
}) => {
  await ready(page);
  const state = { posts: [], mode: "exists" };
  await stubRegistry(page);
  await stubDownload(page, state);
  await openShelf(page);

  await addVerb(page).click();

  const dialog = page.getByRole("dialog", { name: "覆盖同名用户插件" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("probe-shelf");
  await expect(page.getByRole("alert").filter({ hasText: "装入插件库失败" })).toHaveCount(0);

  // The answer re-sends the same request with `overwrite`, and the question closes once it lands.
  state.mode = "land";
  await dialog.getByRole("button", { name: "覆盖导入" }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.posts).toEqual([{ url: SPEC }, { url: SPEC, overwrite: true }]);
});
