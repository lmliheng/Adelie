/**
 * Regression: the built-in browser's "clear browsing data" card keeps the server's refusal inside
 * itself (`ConfirmModal`'s `refusal` slot), and its ticked kinds with it.
 *
 * The card always stayed open on a failure — what it lost was the reason: the words went to a toast
 * that dismissed itself while the card that had asked the question stood there saying nothing, and
 * the retry the card offers is the only way back to the same selection. The reason now renders
 * under the card's own sentence, next to the button that retries it.
 *
 * The panel normally needs the desktop shell, so this spec stubs the one thing the app asks it for
 * (the `<webview>` element in the custom-element registry) and the browser routes inside the page;
 * the server, the sign-in and the Project are real. The refusal carries a code nothing translates
 * (`clear_data_refused`), so the sentence on screen can only be the probe's.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** A code no client translation covers, so its message reaches the card verbatim. */
const REFUSAL = { code: "clear_data_refused", message: "clear data refused by the probe" };
const SHOWN = `清除失败：${REFUSAL.message}`;

const TAB = {
  id: 1,
  url: "https://example.com/",
  title: "示例站点",
  loading: false,
  canGoBack: false,
  canGoForward: false,
};

/** What the desktop shell provides and a plain browser does not: a `webview` in the registry. */
const STUB_WEBVIEW = () => {
  class StubView extends HTMLElement {
    loadURL() {
      return Promise.resolve();
    }
    reload() {}
    stop() {}
    goBack() {}
    goForward() {}
    focus() {}
    openDevTools() {}
  }
  const get = CustomElementRegistry.prototype.get;
  CustomElementRegistry.prototype.get = function (name) {
    return name === "webview" ? StubView : get.call(this, name);
  };
};

test("built-in browser: a refused clear keeps the card and its reason, and retries the same kinds", async ({
  page,
}) => {
  // The browser's routes are admin-only, so this runs as the seeded administrator.
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);

  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  // A Project needs a model, or the onboarding overlay covers the toolbar.
  const models = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
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
  expect(models.ok(), "put models").toBeTruthy();

  // The dock's two toggles live on a conversation's toolbar, not on the new-chat draft.
  const created = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
    { data: { provider: "custom", modelId: "claude-4-8" } },
  );
  expect(created.ok(), "create session").toBeTruthy();
  const sessionId = (await created.json()).session.sessionId;

  await page.addInitScript(STUB_WEBVIEW);
  await page.route("**/api/builtin-browser/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ available: true, tabs: [TAB], activeTabId: TAB.id }),
    }),
  );
  await page.route("**/api/builtin-browser/settings", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ homepage: null }),
    }),
  );

  /** Every clear-data request's body, so the retry can be checked against the first attempt. */
  const clears = [];
  let refuse = true;
  await page.route("**/api/builtin-browser/clear-data", (route) => {
    const body = route.request().postDataJSON();
    clears.push(body);
    if (!refuse) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  await page.goto(`${BASE}/chat/${sessionId}`);
  await page.getByTestId("dock-toggle-right").click();
  const dock = page.locator('[data-testid="dock"][data-position="right"]');
  await dock.getByTestId("dock-pick-builtin-browser").click();
  await dock.getByRole("button", { name: "更多", exact: true }).click();
  await page.getByRole("menuitem", { name: "清除浏览数据…" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Untick one kind: the refusal has to leave this selection exactly as it is.
  await dialog.getByRole("checkbox", { name: "历史记录" }).click();

  await dialog.getByRole("button", { name: "清除", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText(SHOWN);
  await expect(dialog.getByRole("checkbox", { name: "历史记录" })).not.toBeChecked();
  for (const kind of ["Cookie 与登录状态", "缓存的图片和文件", "网站存储的数据"]) {
    await expect(dialog.getByRole("checkbox", { name: kind })).toBeChecked();
  }
  expect(clears.at(-1).storages).not.toContain("history");

  // The same button, allowed this time: the card goes, and so does the reason.
  refuse = false;
  await dialog.getByRole("button", { name: "清除", exact: true }).click();
  await expect(dialog).toBeHidden();
  // The retry asked for the same kinds the refused attempt did.
  expect(clears.at(-1).storages).not.toContain("history");
  expect(clears.length).toBe(2);
});
