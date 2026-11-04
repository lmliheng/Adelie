/**
 * Regression: the built-in browser's "set homepage" dialog keeps a refused save's reason under the
 * address field it is about, for as long as the dialog is open on that entry.
 *
 * The dialog always stayed open on a failure — what it lost was the reason: the words went to a
 * notification that dismissed itself after six seconds, and what stood under it was the very field
 * the sentence named, so the dialog then read exactly as it did before the press. The reason now
 * renders under the entry, next to the Save button that retries it, and any edit of the entry (and
 * the next press) clears it.
 *
 * The panel normally needs the desktop shell, so this spec stubs the one thing the app asks it for
 * (the `<webview>` element in the custom-element registry) and the browser routes inside the page;
 * the server, the sign-in and the Project are real. The refusal carries a code nothing translates
 * (`homepage_refused`), so the sentence on screen can only be the probe's.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** A code no client translation covers, so its message reaches the dialog verbatim. */
const REFUSAL = { code: "homepage_refused", message: "homepage refused by the probe" };
const SHOWN = `无法保存主页：${REFUSAL.message}`;

/** Longer than an error notification stays (6000 ms), so "it left with the toast" is measurable. */
const OUTLIVES_TOAST_MS = 7000;

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

test("built-in browser: a refused homepage save keeps the dialog and its reason, and retries the same entry", async ({
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

  /** Every settings write's body, so the retry can be checked against the first attempt. */
  const writes = [];
  let refuse = true;
  await page.route("**/api/builtin-browser/settings", (route) => {
    if (route.request().method() !== "PUT") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ homepage: null }),
      });
    }
    writes.push(route.request().postDataJSON());
    if (!refuse) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ homepage: "https://example.com/" }),
      });
    }
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
  await page.getByRole("menuitem", { name: "设置主页…" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const field = dialog.getByTestId("builtin-browser-homepage-input");
  await field.fill("example.com");
  await field.press("Enter");

  // The refusal lands under the entry, and the dialog keeps the entry that produced it.
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveText(SHOWN);
  await expect(dialog.getByText("将打开 https://example.com/")).toBeVisible();
  await expect(field).toHaveValue("example.com");
  // Nothing went to the notification stack for it, so there is nothing to expire with.
  expect(writes.length).toBe(1);
  expect(writes[0]).toEqual({ homepage: "https://example.com/" });

  // The claim of this spec: the words are still there after an error notification would be gone.
  await page.waitForTimeout(OUTLIVES_TOAST_MS);
  await expect(dialog.getByRole("alert")).toHaveText(SHOWN);

  // Editing the entry makes the sentence stale at once — it named the address that was there.
  await field.fill("example.org");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  // And so does a fresh attempt that fails again: the reason comes back, once.
  await field.press("Enter");
  await expect(dialog.getByRole("alert")).toHaveText(SHOWN);

  // Allowed this time: the dialog goes, and so does the reason.
  refuse = false;
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toBeHidden();
  // The retry sent the entry as it stood, read the way the address bar reads it.
  expect(writes.at(-1)).toEqual({ homepage: "https://example.org/" });
  expect(writes.length).toBe(3);
});
