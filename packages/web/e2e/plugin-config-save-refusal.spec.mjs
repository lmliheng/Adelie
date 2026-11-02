/**
 * Regression: a plugin card whose Save the server refused for a reason that names no field says
 * why on the card, above the Save button that is its retry — not in a toast that dismisses itself
 * after six seconds over a form that looks untouched.
 *
 * The server names the field it validated and turned down (`plugin_config_invalid`), and that
 * sentence renders under the field. Every other way a save can fail is about the card as a whole:
 * the settings group went away under the page (a plugin or a backend was removed),
 * the session expired, the server errored, the machine is unreachable. Those used to go to a
 * notification, which was gone six seconds later while every draft sat exactly as it was.
 *
 * The configuration under test is stubbed at the read (`GET /api/admin/plugin-config`): the real
 * sandbox card hides its fields while the switch is off and offers to install a backend the moment
 * it is turned on, which is another dialog's business. The write under test is the page's own
 * request — `PUT /api/admin/plugin-config` — and the refusal is the app's own sentence for the
 * code the server would answer with (`internal`).
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** One entry with a single text field, so the card is a box and its Save. */
const ENTRY = {
  name: "probe",
  configuration: {
    title: "Probe",
    titleZh: "探针",
    properties: { label: { type: "string", title: "Label", titleZh: "名称" } },
  },
  values: {},
};

/** The refusal the server answers with, and what the card draws for that code. */
const REFUSAL = { code: "internal", message: "Internal server error" };
const SHOWN = "操作被拒绝：服务器内部错误，请稍后重试。";
const TYPED = "探针取值";

/**
 * Sign in as the seeded administrator (the page is admin-only) and give the Project a model —
 * the onboarding overlay covers the page without one.
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
}

/** The settings dialog, opened the way a person opens it: the user menu, then a page. */
async function openSettings(page, section) {
  // The user menu shares its name with the Project switcher, so take the last match (as chat.spec).
  await page.getByRole("button", { name: ADMIN_ID }).last().click();
  await page.getByRole("menuitem", { name: "设置", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: section, exact: true }).click();
  return settings;
}

/**
 * The toast stack by its own hook rather than by role: the modal marks the rest of the page
 * aria-hidden, and a toast is exactly the surface this spec is about — read the DOM, so a toast
 * that is on screen still counts.
 */
function toasts(page) {
  return page.locator('section[aria-label="通知"] button');
}

/**
 * Serve the one entry, and take over its save: every `PUT` is counted, refused while `state.refuse`
 * holds, and answered with the entry as the page's own save would leave it.
 */
async function stubConfig(page, state) {
  await page.route("**/api/admin/plugin-config", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== "/api/admin/plugin-config") return route.fallback();
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ plugins: [ENTRY] }),
      });
      return;
    }
    if (route.request().method() !== "PUT") return route.fallback();
    state.writes.push(route.request().postDataJSON());
    if (state.refuse) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: REFUSAL }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plugins: [{ ...ENTRY, values: { label: TYPED } }] }),
    });
  });
}

test("a refused plugin save says why on its card, past the toast it used to be", async ({
  page,
}) => {
  await ready(page);
  const state = { writes: [], refuse: true };
  await stubConfig(page, state);

  await page.goto("/");
  const settings = await openSettings(page, "插件");
  const card = settings.locator('[data-plugin-config="probe"]');
  await expect(card).toBeVisible();
  await expect(card.getByRole("alert")).toHaveCount(0);

  const box = card.getByRole("textbox", { name: "名称" });
  await box.fill(TYPED);
  await card.getByRole("button", { name: "保存", exact: true }).click();

  // The reason is on the card, above the button that sent it, and it is not a toast.
  await expect(card.getByRole("alert")).toHaveText(SHOWN);
  await expect(card.getByRole("alert")).toHaveCount(1);
  await expect(toasts(page)).toHaveCount(0);
  expect(state.writes).toEqual([{ name: "probe", values: { label: TYPED } }]);
  // Nothing was written: the draft the person typed is still there to retry with.
  await expect(box).toHaveValue(TYPED);

  // Six seconds is how long a toast lives; this sentence has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(card.getByRole("alert")).toHaveText(SHOWN);

  // The same Save retries the same write; the sentence goes as the attempt starts and the save
  // lands this time.
  state.refuse = false;
  await card.getByRole("button", { name: "保存", exact: true }).click();
  await expect(card.getByRole("alert")).toHaveCount(0);
  expect(state.writes).toHaveLength(2);
  // The answer's values are adopted: the box shows what the server now holds.
  await expect(box).toHaveValue(TYPED);
});
