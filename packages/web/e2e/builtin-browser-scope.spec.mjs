/**
 * Regression: the built-in browser belongs to the conversation on screen. Since the browser went
 * per-conversation, the panel reads the registry of the conversation it sits in (`?sessionId=…`,
 * nothing for the default scope) and every action names that conversation, so two conversations
 * never show or act on each other's tabs.
 *
 * The panel normally needs the desktop shell, so this spec stubs the one thing the app asks it
 * for (the `<webview>` element in the custom-element registry) and the browser routes inside the
 * page — the registry answering per conversation, as the server does. The server, the sign-in,
 * the Project and both sessions are real.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** One tab per conversation, told apart by its title. */
const TAB_A = {
  id: 41,
  url: "https://alpha.example/",
  title: "甲站",
  loading: false,
  canGoBack: false,
  canGoForward: false,
};
const TAB_B = {
  id: 42,
  url: "https://beta.example/",
  title: "乙站",
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

test("built-in browser: each conversation shows and acts on its own tabs", async ({ page }) => {
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

  /** Two real conversations: the browser's scope is a Session id. */
  const createSession = async () => {
    const created = await page.request.post(
      `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
      { data: { provider: "custom", modelId: "claude-4-8" } },
    );
    expect(created.ok(), "create session").toBeTruthy();
    return (await created.json()).session.sessionId;
  };
  const sessionA = await createSession();
  const sessionB = await createSession();

  await page.addInitScript(STUB_WEBVIEW);
  await page.route("**/api/builtin-browser/settings", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ homepage: null }),
    }),
  );

  /** Every status read, as the conversation it named ("" = the default scope). */
  const reads = [];
  await page.route("**/api/builtin-browser/status**", (route) => {
    const scope = new URL(route.request().url()).searchParams.get("sessionId") ?? "";
    reads.push(scope);
    const tabs = scope === sessionA ? [TAB_A] : scope === sessionB ? [TAB_B] : [];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        available: true,
        tabs,
        activeTabId: tabs.length === 0 ? null : tabs[0].id,
      }),
    });
  });

  /** What each click asked of which conversation: the activation's body, the close's query. */
  const activates = [];
  await page.route("**/api/builtin-browser/tabs/*/activate", (route) => {
    activates.push(route.request().postDataJSON());
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ tab: TAB_A }),
    });
  });

  /**
   * The right dock with the browser panel in it: the picker asks which panel the first time, and
   * the dock's layout is remembered per conversation, so coming back to one already shows its
   * panel and the picker is not there. The restore happens a moment after the page loads, so the
   * toggle is only pressed once the dock has had that moment to show up by itself — pressing it
   * while the restore is under way would close the dock it just brought back.
   */
  const showBrowser = async () => {
    const dock = page.locator('[data-testid="dock"][data-position="right"]');
    const restored = await dock
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (!restored) {
      await page.getByTestId("dock-toggle-right").click();
      await dock.waitFor();
    }
    const pick = dock.getByTestId("dock-pick-builtin-browser");
    const tablist = dock.getByRole("tablist", { name: "标签页" });
    await expect(pick.or(tablist).first()).toBeVisible();
    if (await pick.isVisible()) await pick.click();
    return dock;
  };
  const strip = (dock) => dock.getByRole("tablist", { name: "标签页" });

  // Conversation A: the strip is A's registry, and clicking that tab acts in A.
  await page.goto(`${BASE}/chat/${sessionA}`);
  const dockA = await showBrowser();
  await expect(strip(dockA).getByRole("tab")).toHaveCount(1);
  await expect(strip(dockA).getByRole("tab")).toHaveText(/甲站/);
  await strip(dockA).getByRole("tab").click();
  await expect.poll(() => activates.at(-1)).toEqual({ sessionId: sessionA });

  // Conversation B: the strip is B's, and A's tab is not on it.
  await page.goto(`${BASE}/chat/${sessionB}`);
  const dockB = await showBrowser();
  await expect(strip(dockB).getByRole("tab")).toHaveCount(1);
  await expect(strip(dockB).getByRole("tab")).toHaveText(/乙站/);
  await strip(dockB).getByRole("tab").click();
  await expect.poll(() => activates.at(-1)).toEqual({ sessionId: sessionB });

  // Back to A: A's own tab is there again.
  await page.goto(`${BASE}/chat/${sessionA}`);
  const dockAgain = await showBrowser();
  await expect(strip(dockAgain).getByRole("tab")).toHaveText(/甲站/);

  // Every read named one conversation, and no read mixed the two.
  expect(reads).toContain(sessionA);
  expect(reads).toContain(sessionB);
  for (const scope of reads) expect([sessionA, sessionB, ""]).toContain(scope);
});
