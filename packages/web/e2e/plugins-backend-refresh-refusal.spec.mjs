/**
 * Regression: when the read that follows an install (the one that brings the cards' notices, the
 * actions and the backend report up to date) fails, the page says so where the cards are — past
 * the six seconds a toast lives, over a card that keeps claiming the backend is missing.
 *
 * The Sandbox card offers to install this OS's default backends the moment its switch is turned
 * on and the machine reports none. Installing does land — each package reports itself in a toast —
 * but the cards' live parts are re-read afterwards, and a failure there used to be one more toast:
 * a card still reading "no backend for this OS" stayed that way with nothing left on screen to
 * explain it, six seconds later.
 *
 * Both halves the spec needs are the page's own contract with the server and are stubbed at
 * `page.route`: the configuration it reads (a group with a switch and a backend report, then a
 * refusal on the read after the install) and the install it sends (the deployment list read for
 * the machine id, then the install itself). Leaving the page and coming back is the retry — the
 * section is mounted only while it is the open page.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** The package the card offers on this machine, and the one the install is expected to send. */
const SPEC = "@adelie/sandbox-bwrap";

/** The line the page draws after a failed read that follows an install; `internal`'s own text. */
const STALE =
  "安装之后没能重新读取本机的插件状态（卡片上的状态可能仍是安装前的）：服务器内部错误，请稍后重试。";

/** One group with a switch, a field behind it and the backend report that offers an install. */
const ENTRY = {
  name: "sandbox",
  configuration: {
    title: "Sandbox",
    titleZh: "沙盒",
    switch: "enabled",
    properties: {
      enabled: { type: "boolean", title: "Enable sandbox", titleZh: "启用沙盒" },
      maskPaths: { type: "string", title: "Mask paths", titleZh: "掩码路径" },
    },
  },
  values: {},
  backend: { installed: false, recommended: [SPEC] },
};

/** Sign in as the seeded administrator and give the Project a model (the onboarding overlay). */
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
 * aria-hidden, and a toast is exactly one of the two surfaces this spec tells apart.
 */
function toasts(page) {
  return page.locator('section[aria-label="通知"] button');
}

/** The deployment list the install path reads for the machine id, and the install it sends. */
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
 * Serve the configuration from the fixture, answer the install, and refuse the read that follows
 * it. `state.reads` counts the configuration reads, `state.posts` the install writes; `repair()`
 * makes later reads land again, so the spec can show what the retry does.
 */
async function stub(page, state) {
  const answer = (route, body) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/admin/plugin-config", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    state.reads.push(route.request().url());
    // The first read hydrates the page; every read after an install is the one under test.
    if (state.reads.length === 1 || !state.refuse) {
      return answer(route, { plugins: [state.entry] });
    }
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal", message: "Internal server error" } }),
    });
  });
  await page.route("**/api/projects/*/plugins/installed*", async (route) => {
    if (route.request().method() === "GET") return answer(route, deployment(state.listed));
    if (route.request().method() !== "POST") return route.fallback();
    state.posts.push(route.request().postDataJSON());
    state.listed = [SPEC];
    state.entry = { ...state.entry, backend: { installed: true } };
    return answer(route, deployment(state.listed));
  });
}

test("a failed read after an install says so on the cards, past the toast it used to be", async ({
  page,
}) => {
  await ready(page);
  const state = { entry: ENTRY, reads: [], posts: [], listed: [], refuse: true };
  await stub(page, state);

  await page.goto("/");
  const settings = await openSettings(page, "插件");
  const section = settings.locator("section").first();
  const card = settings.locator('[data-plugin-config="sandbox"]');
  await expect(card).toBeVisible();
  await expect(section.getByRole("alert")).toHaveCount(0);

  // Turning the switch on asks whether to install this OS's backends — the install path under test.
  await card.getByRole("switch", { name: "启用沙盒" }).click();
  const prompt = page.getByRole("dialog", { name: "安装沙盒后端" });
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "安装", exact: true }).click();

  // The install landed (its own toast says so, that half is unchanged) …
  await expect(prompt).toHaveCount(0);
  expect(state.posts).toEqual([{ specifier: SPEC, machineId: "probe-machine" }]);
  // … and the read that was to follow it failed: the reason is on the page, above the cards, not
  // in a notification that dismisses itself.
  await expect(section.getByRole("alert")).toHaveText(STALE);
  await expect(section.getByRole("alert")).toHaveCount(1);
  expect(state.reads).toHaveLength(2);
  await expect(toasts(page).filter({ hasText: "服务器内部错误" })).toHaveCount(0);

  // Six seconds is how long a toast lives; this sentence has to still be there after it, and so
  // does the card it is about — untouched, because nothing changed the drafts.
  await page.waitForTimeout(7_000);
  await expect(section.getByRole("alert")).toHaveText(STALE);
  await expect(card).toBeVisible();
  await expect(toasts(page)).toHaveCount(0);

  // Leaving the page and coming back is the retry: the read lands, the sentence goes, and the
  // cards show what the machine answers now (the backend the install put there).
  state.refuse = false;
  await settings.getByRole("button", { name: "通用", exact: true }).click();
  await settings.getByRole("button", { name: "插件", exact: true }).click();
  const again = settings.locator("section").first();
  await expect(again.getByRole("alert")).toHaveCount(0);
  await expect(settings.locator('[data-plugin-config="sandbox"]')).toBeVisible();
  expect(state.reads.length).toBeGreaterThan(2);
});
