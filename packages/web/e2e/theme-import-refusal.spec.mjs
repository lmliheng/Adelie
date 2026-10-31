/**
 * Regression: a theme import that was REFUSED says why where it was asked — inside the import
 * dialog, and on the registry card whose button was clicked — and the sentence outlives the six
 * seconds a toast lives.
 *
 * Both surfaces stayed as they were on a failure: the dialog kept its file or address (nothing was
 * written), the card kept its button, and the reason arrived as a notification that dismissed
 * itself over them. A reader who looked away was left with a dialog that would not close on
 * success and a grid of cards that all looked untouched, without knowing which one to think about.
 *
 * The catalogue is stubbed rather than fetched: a registry is a remote index (the server reads
 * npmmirror, then jsDelivr), and what this spec is about is what the page does with the answer.
 * The refusals are codes the app has its own sentence for, so the line on screen is the localized
 * one — `registry_theme_not_found` on a card, `download_failed` in the dialog — and a 409
 * `theme_exists` still opens the overwrite question instead of becoming a line.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** The line a refused card / import draws: the shared lead-in plus the app's sentence for the code. */
const CARD_REFUSED = "操作被拒绝：主题库里已经没有这个主题了，刷新一下再看。";
const DIALOG_REFUSED = "操作被拒绝：取不回来：地址、网络或对方的状态码有问题。";

/** The catalogue both tests see: two cards, neither of them installed. */
const CATALOGUE = {
  base: "https://registry.example.invalid/",
  name: "probe registry",
  updatedAt: "2026-11-01T00:00:00Z",
  fetchedAt: 0,
  themes: [
    {
      id: "probe-warm",
      name: "Probe Warm",
      author: "probe",
      description: "a warm card",
      file: "themes/probe-warm.json",
      version: "1.0.0",
      installed: false,
    },
    {
      id: "probe-cool",
      name: "Probe Cool",
      author: "probe",
      description: "a cool card",
      file: "themes/probe-cool.json",
      version: "1.0.0",
      installed: false,
    },
  ],
};

/** What an import that lands answers: the file it wrote and the theme inside it. */
const IMPORTED = { file: "probe-warm.json", theme: { id: "probe-warm", name: "Probe Warm" } };

/**
 * Sign in as the seeded administrator (both surfaces are the admin's) and give the Project a
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

/** The settings dialog, opened the way a person opens it: the user menu, then 外观. */
async function openAppearance(page) {
  // The user menu shares its name with the Project switcher, so take the last match (as chat.spec).
  await page.getByRole("button", { name: ADMIN_ID }).last().click();
  await page.getByRole("menuitem", { name: "设置", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "外观", exact: true }).click();
  return settings;
}

/** One card of the registry grid, found by the name it shows: the card is the name's nearest div. */
function cardOf(scope, name) {
  return scope.getByText(name, { exact: true }).locator("xpath=ancestor::div[1]");
}

/** Refuse the registry import with the answer "that entry is gone"; counted, and switchable. */
async function refuseRegistryImport(page, seen) {
  let refuse = true;
  await page.route("**/api/themes/registry/import", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    seen.push(route.request().postDataJSON());
    if (!refuse) {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(IMPORTED),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "registry_theme_not_found", message: "No such theme: probe-warm" },
      }),
    });
  });
  return () => {
    refuse = false;
  };
}

test("a refused registry import keeps its reason on that card, and only that card", async ({
  page,
}) => {
  await ready(page);
  await page.route("**/api/themes/registry", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(CATALOGUE),
    }),
  );
  const attempts = [];
  const letThrough = await refuseRegistryImport(page, attempts);

  await page.goto("/");
  const settings = await openAppearance(page);
  const warm = cardOf(settings, "Probe Warm");
  const cool = cardOf(settings, "Probe Cool");
  await expect(warm).toBeVisible();
  await expect(cool).toBeVisible();

  await warm.getByRole("button", { name: "导入", exact: true }).click();

  // The reason is on the card that asked, it is not a toast, and the other card says nothing.
  await expect(warm.getByRole("alert")).toHaveText(CARD_REFUSED);
  await expect(cool.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  expect(attempts.map((body) => body.id)).toEqual(["probe-warm"]);

  // Six seconds is how long a toast lives; this line has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(warm.getByRole("alert")).toHaveText(CARD_REFUSED);

  // The same button, second click: this time the import lands, so the sentence goes.
  letThrough();
  await warm.getByRole("button", { name: "导入", exact: true }).click();
  await expect(warm.getByRole("alert")).toHaveCount(0);
  expect(attempts).toHaveLength(2);
});

test("a 409 still asks to overwrite instead of drawing a refusal", async ({ page }) => {
  await ready(page);
  await page.route("**/api/themes/registry", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(CATALOGUE),
    }),
  );
  await page.route("**/api/themes/registry/import", (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "theme_exists", message: "A theme with this id is already installed" },
      }),
    }),
  );

  await page.goto("/");
  const settings = await openAppearance(page);
  const warm = cardOf(settings, "Probe Warm");
  await expect(warm).toBeVisible();

  await warm.getByRole("button", { name: "导入", exact: true }).click();

  // The question, not a refusal: the overwrite card is up and the grid kept its silence.
  await expect(page.getByRole("dialog", { name: "覆盖已导入的主题" })).toBeVisible();
  await expect(warm.getByRole("alert")).toHaveCount(0);
});

test("a refused theme dialog keeps its reason in the dialog, under the address it was about", async ({
  page,
}) => {
  await ready(page);
  await page.route("**/api/themes/registry", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(CATALOGUE),
    }),
  );
  let refuse = true;
  const attempts = [];
  await page.route("**/api/themes/download", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    attempts.push(route.request().postDataJSON());
    if (!refuse) {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(IMPORTED),
      });
      return;
    }
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "download_failed", message: "GET https://example.com/theme.json failed" },
      }),
    });
  });

  await page.goto("/");
  await openAppearance(page);
  await page.getByRole("button", { name: "导入主题…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "导入主题" });
  await expect(dialog).toBeVisible();

  // By address, so no file has to be written: the server would fetch it, and the route answers first.
  await dialog.getByRole("button", { name: "地址", exact: true }).click();
  const address = dialog.getByLabel("主题文件地址");
  await address.fill("https://example.com/theme.json");
  await dialog.getByRole("button", { name: "下载并导入", exact: true }).click();

  // The dialog stays with both the address and the reason; nothing lands in the notification area.
  await expect(dialog.getByRole("alert")).toHaveText(DIALOG_REFUSED);
  await expect(dialog).toBeVisible();
  await expect(address).toHaveValue("https://example.com/theme.json");
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  expect(attempts.map((body) => body.url)).toEqual(["https://example.com/theme.json"]);

  await page.waitForTimeout(7_000);
  await expect(dialog.getByRole("alert")).toHaveText(DIALOG_REFUSED);

  // The confirm beside it retries the same address; this time it lands and the dialog closes.
  refuse = false;
  await dialog.getByRole("button", { name: "下载并导入", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(attempts).toHaveLength(2);
});
