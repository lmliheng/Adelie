/**
 * Regression: ending a terminal can be REFUSED, and the card that asked is the one that says so.
 *
 * Both ways to end a shell — a dock tab's × and the standalone /terminal window's
 * terminal.close shortcut — ask first in the same confirmation card, and both used to ignore the
 * answer entirely (`void killTerminal(...)`, which swallowed a non-2xx as well as a dead
 * connection): the tab left the strip, or the window closed, while the shell kept running, and
 * nothing on screen said a word. Now the tab goes only once the kill landed, the card stays
 * standing with the server's words inside it, and its own button is the retry.
 *
 * The refusal is the server's own shape — `{error:{code,message}}` — with the two codes a DELETE
 * of a terminal really answers: `terminal_not_found` (this id's shell is already gone) in the
 * dock, `internal` in the window, so both localized sentences are exercised.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const U = "killrefusaluser";
const P = "password123";

/** The card's title, which is also its accessible name. */
const CARD = "关闭此终端？";
/** The confirm button: the action's own verb. */
const CONFIRM = "关闭此终端";
/** The shared lead-in plus each code's own words. */
const NOT_FOUND_REFUSED = "操作被拒绝：该终端已不存在或已被关闭。";
const INTERNAL_REFUSED = "操作被拒绝：服务器内部错误，请稍后重试。";

/** Live shells accumulate across reruns on one server; MAX 12/user would 429. */
async function killAllTerminals(request) {
  const { terminals } = await (await request.get(`${BASE}/api/terminals`)).json();
  for (const t of terminals) await request.delete(`${BASE}/api/terminals/${t.id}`);
  await expect
    .poll(
      async () => {
        const res = await (await request.get(`${BASE}/api/terminals`)).json();
        return res.terminals.filter((t) => t.alive).length;
      },
      { timeout: 10000 },
    )
    .toBe(0);
}

/** How many shells this user has alive right now. */
async function aliveCount(request) {
  const res = await (await request.get(`${BASE}/api/terminals`)).json();
  return res.terminals.filter((t) => t.alive).length;
}

/** A Project without a model pops the onboarding overlay over the dock; configure the mock one. */
async function configureProjectModel(request) {
  const projectId = (await (await request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
  const put = await request.put(`${BASE}/api/projects/${projectId}/models`, {
    data: {
      defaultModel: { provider: "custom", modelId: "claude-4-8" },
      models: [
        {
          provider: "custom",
          modelId: "claude-4-8",
          apiKey: "sk-mock",
          baseUrl: process.env.MOCK_URL,
          contextWindow: 200000,
        },
      ],
    },
  });
  expect(put.ok(), "put models").toBeTruthy();
}

/**
 * Refuses the kill with `code`. Only DELETE is touched: the same path is also probed with GET
 * (attach) and read as a list, and both have to keep working for the page to be usable.
 */
async function refuseKill(page, code) {
  await page.route("**/api/terminals/**", (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    return route.fulfill({
      status: code === "internal" ? 500 : 404,
      contentType: "application/json",
      body: JSON.stringify({ error: { code, message: "refused by the test" } }),
    });
  });
}

/** Lets the same path through again, so the card's button becomes a retry that lands. */
async function allowKill(page) {
  await page.unroute("**/api/terminals/**");
}

/**
 * The terminal page draws its rows as text, so the screen is readable without pixels; "ready"
 * only means the stream is attached, so a sentinel proves the shell is at a prompt (the tag is
 * quote-split: the command's own echo never contains it).
 */
async function waitForShell(page, tag) {
  await expect(page.locator('[data-testid="terminal-status"][data-status="ready"]')).toBeVisible({
    timeout: 20000,
  });
  await page.click(".xterm-screen");
  await page.keyboard.type(`echo ${tag.slice(0, 2)}''${tag.slice(2)}`);
  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.locator(".xterm-rows").innerText(), { timeout: 30000 })
    .toMatch(new RegExp(`${tag}$`, "m"));
}

test("a dock tab's × keeps its refusal in the card, and the shell keeps running", async ({
  page,
}) => {
  await provisionAndLogin(page.request, U, P);
  await configureProjectModel(page.request);
  await killAllTerminals(page.request);
  await page.goto(`${BASE}/chat`);
  await expect(page.locator("aside")).toBeVisible({ timeout: 20000 });

  // Ctrl+` opens a shell in the bottom dock, like Codex / VS Code.
  await page.keyboard.press("Control+Backquote");
  const dock = page.locator('[data-testid="dock"][data-position="bottom"][data-open="true"]');
  await expect(dock).toBeVisible({ timeout: 20000 });
  const tab = dock.locator('[data-testid="dock-tab"][data-terminal-id]');
  await expect(tab).toHaveCount(1);

  const notices = page.getByRole("region", { name: "通知" });
  await refuseKill(page, "terminal_not_found");

  // The tab's × asks first; the answer to that question is a refusal.
  await tab.getByTestId("dock-tab-close").click();
  const card = page.getByRole("dialog", { name: CARD });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: CONFIRM }).click();

  // The reason is drawn inside the card that asked, and nothing is left in the notification
  // region (which is where it used to be — and only for six seconds).
  await expect(card.getByRole("alert")).toHaveText(NOT_FOUND_REFUSED);
  await expect(notices.getByRole("button")).toHaveCount(0);
  // Six seconds is how long a toast lives: the card and its sentence have to outlive it.
  await page.waitForTimeout(7_000);
  await expect(card).toBeVisible();
  await expect(card.getByRole("alert")).toHaveText(NOT_FOUND_REFUSED);
  // Nothing was ended: the tab is still in the strip, and so is the shell.
  await expect(tab).toHaveCount(1);
  expect(await aliveCount(page.request), "the shell is still alive").toBe(1);

  // The same button is the retry: with the server answering again, the kill lands, the tab
  // leaves the strip and the shell is gone — the dock closes because its last tab went.
  await allowKill(page);
  const landed = page.waitForResponse(
    (res) => res.request().method() === "DELETE" && res.url().includes("/api/terminals/"),
  );
  await card.getByRole("button", { name: CONFIRM }).click();
  expect((await landed).status(), "the kill landed").toBe(204);
  await expect(card).toHaveCount(0);
  await expect(page.locator('[data-testid="dock"][data-open="true"]')).toHaveCount(0);
  await expect.poll(() => aliveCount(page.request), { timeout: 10000 }).toBe(0);
});

test("cancelling a refused kill leaves the next card clean", async ({ page }) => {
  await provisionAndLogin(page.request, U, P);
  await configureProjectModel(page.request);
  await killAllTerminals(page.request);
  await page.goto(`${BASE}/chat`);
  await expect(page.locator("aside")).toBeVisible({ timeout: 20000 });
  await page.keyboard.press("Control+Backquote");
  const dock = page.locator('[data-testid="dock"][data-position="bottom"][data-open="true"]');
  await expect(dock).toBeVisible({ timeout: 20000 });
  const tab = dock.locator('[data-testid="dock-tab"][data-terminal-id]');

  await refuseKill(page, "terminal_not_found");
  await tab.getByTestId("dock-tab-close").click();
  const card = page.getByRole("dialog", { name: CARD });
  await card.getByRole("button", { name: CONFIRM }).click();
  await expect(card.getByRole("alert")).toHaveText(NOT_FOUND_REFUSED);

  // Escape closes the card; the sentence belonged to that question, so the next one is clean.
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await tab.getByTestId("dock-tab-close").click();
  const again = page.getByRole("dialog", { name: CARD });
  await expect(again).toBeVisible();
  await expect(again.getByRole("alert")).toHaveCount(0);
});

test("the standalone window keeps its refusal on screen, and its shell running", async ({
  page,
}) => {
  await provisionAndLogin(page.request, U, P);
  await killAllTerminals(page.request);
  await page.goto(`${BASE}/terminal`);
  await waitForShell(page, "KILL_REFUSED_1");

  const notices = page.getByRole("region", { name: "通知" });
  await refuseKill(page, "internal");

  // terminal.close (Ctrl+Alt+`) inside the terminal takes the dock tab's × path.
  await page.click(".xterm-screen");
  await page.keyboard.press("Control+Alt+Backquote");
  const card = page.getByRole("dialog", { name: CARD });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: CONFIRM }).click();

  // The window is the only surface that shell is on, so a refusal must not close it.
  await expect(card.getByRole("alert")).toHaveText(INTERNAL_REFUSED);
  await expect(notices.getByRole("button")).toHaveCount(0);
  await page.waitForTimeout(7_000);
  await expect(card.getByRole("alert")).toHaveText(INTERNAL_REFUSED);
  expect(page.url(), "the window is still here").toContain("/terminal");
  await expect(page.locator('[data-testid="terminal-status"][data-status="ready"]')).toBeVisible();
  expect(await aliveCount(page.request), "the shell is still alive").toBe(1);

  // The same button again, with the server answering, ends the shell it was asked about.
  await allowKill(page);
  const landed = page.waitForResponse(
    (res) => res.request().method() === "DELETE" && res.url().includes("/api/terminals/"),
  );
  await card.getByRole("button", { name: CONFIRM }).click();
  expect((await landed).status(), "the kill landed").toBe(204);
  await expect.poll(() => aliveCount(page.request), { timeout: 10000 }).toBe(0);
});
