/**
 * Regression: the Models page opens with every provider group collapsed, the user's own
 * toggles are the only thing that opens a group, and an import does not invent one.
 *
 * The page used to open the first group of the catalog on a first visit, and the group
 * import opened the group it had just created. Both were expansion preferences the user
 * never chose: the first answered "which group do you probably want" with a guess that
 * went stale as the catalog grew, the second outlived the import in this Project's stored
 * set. Now nothing is expanded until a header is clicked, search still force-opens the
 * groups that hold matches (clearing the query collapses them again without touching the
 * stored set), and an imported group arrives collapsed like every other one.
 *
 * Storage is read straight out of localStorage under this Project's own key, and the
 * imported group's rows are served by a throwaway provider on a random port — no model
 * key and no network access (see 3.6's blocker in docs/FORK-PROGRESS.md).
 */
import { createServer } from "node:http";
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const P = "password123";

/** One model for the import to find; nothing else is served, so the dialog imports exactly one row. */
const provider = createServer((req, res) => {
  if (req.method !== "GET" || req.url !== "/v1/models") {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ object: "list", data: [{ id: "single-test-model", object: "model" }] }));
});
test.beforeAll(async () => {
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
});
test.afterAll(async () => {
  await new Promise((resolve) => provider.close(resolve));
});

test("model groups start collapsed and only a header toggle writes the preference", async ({
  page,
}) => {
  await provisionAndLogin(page.request, "modelgroups", P);
  const { projects } = await (await page.request.get(`${BASE}/api/projects`)).json();
  const key = `penguin.modelsExpandedGroups.${projects[0].projectId}`;
  const saved = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);

  await page.goto("/models");
  // Every header in the rendered page, in the order the page draws them.
  const toggles = page.locator("section button[aria-expanded]");
  const deepSeek = toggles.filter({ hasText: "DeepSeek" });
  await expect(deepSeek).toBeVisible();

  // A first visit opens nothing — and, since nothing was chosen, writes nothing either.
  await expect(toggles.and(page.locator('[aria-expanded="true"]'))).toHaveCount(0);
  expect(await saved()).toBeNull();

  // The keyboard opens the focused group, and that choice survives a reload.
  await deepSeek.focus();
  await page.keyboard.press("Enter");
  await expect(deepSeek).toHaveAttribute("aria-expanded", "true");
  await page.reload();
  await expect(deepSeek).toHaveAttribute("aria-expanded", "true");
  expect(await saved()).toEqual(["deepseek"]);

  // Search reveals the group that holds the match without writing anything, and clearing
  // the query puts it back the way the user left it.
  const search = page.getByPlaceholder(/搜索模型/);
  const openRouter = toggles.filter({ hasText: "OpenRouter" });
  await search.fill("openrouter");
  await expect(openRouter).toHaveAttribute("aria-expanded", "true");
  await search.fill("");
  await expect(openRouter).toHaveAttribute("aria-expanded", "false");
  await expect(deepSeek).toHaveAttribute("aria-expanded", "true");
  expect(await saved()).toEqual(["deepseek"]);
});

test("an imported group arrives collapsed and leaves the stored preference alone", async ({
  page,
}) => {
  await provisionAndLogin(page.request, "modelgroups", P);
  const { projects } = await (await page.request.get(`${BASE}/api/projects`)).json();
  const key = `penguin.modelsExpandedGroups.${projects[0].projectId}`;
  const saved = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);

  await page.goto("/models");
  const toggles = page.locator("section button[aria-expanded]");
  const deepSeek = toggles.filter({ hasText: "DeepSeek" });
  await expect(deepSeek).toBeVisible();
  // Whatever the first test left behind on a shared data root: start from "deepseek open"
  // only when it is already so, and otherwise open it here (the toggle is the only writer).
  if ((await deepSeek.getAttribute("aria-expanded")) !== "true") await deepSeek.click();
  await expect(deepSeek).toHaveAttribute("aria-expanded", "true");

  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: /新增分组/ }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder(/小写字母/).fill("test-import");
  await dialog.getByText("导入模型", { exact: true }).click();
  // A non-vendor endpoint needs a key filled in before the list can be fetched.
  await dialog.getByLabel(/API key/).fill("fixture");
  await dialog.getByLabel("自定义 base URL").fill(`http://127.0.0.1:${provider.address().port}/v1`);
  await dialog.getByRole("button", { name: /接口协议/ }).click();
  await page.getByRole("menuitemradio", { name: /OpenAI Chat Completions/ }).click();
  await dialog.getByRole("button", { name: "批量导入模型" }).click();
  await expect(dialog).toBeHidden();

  // The new group is there, closed like every other one, and the stored set still holds
  // exactly what the user opened by hand.
  const imported = toggles.filter({ hasText: "test-import" });
  await expect(imported).toHaveAttribute("aria-expanded", "false");
  expect(await saved()).toEqual(["deepseek"]);

  // ... and it is a normal group from then on: clicking it is remembered across a reload.
  await imported.click();
  await expect(imported).toHaveAttribute("aria-expanded", "true");
  await page.reload();
  await expect(imported).toHaveAttribute("aria-expanded", "true");
  await expect(deepSeek).toHaveAttribute("aria-expanded", "true");
});
