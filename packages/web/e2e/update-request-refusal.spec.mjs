/**
 * Regression: a request the update modal itself makes — starting the download, or restarting into
 * the release it fetched — says why it was refused inside the modal, above the button that retries
 * it, and nothing of it lands in a notification that dismisses itself.
 *
 * Before, both were one toast ("could not run the update action: …") floating over this very
 * dialog: the modal went on showing the release on offer, or the restart it was waiting for, exactly
 * as it had before the press, and six seconds later the reason was gone — the reader was left
 * looking at a button they had just pressed with no account of what came back. The update flow's
 * own failures (a job that ran and failed, a lookup that answered with an error) already had a
 * place in the modal's body; these two requests did not.
 *
 * The browser's update check is a stub (the release on offer must not depend on GitHub); the
 * refusals are stubs at `page.route` too. The "let through" halves are the real server: it was not
 * launched through the CLI, so `POST /api/version/update` answers at once with `done` /
 * `unsupported` / `not_launched_via_cli` (nothing is spawned) and `POST /api/version/restart`
 * answers `restarting: false` / `no_supervisor` (nothing is restarted).
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;

/** The shared notification region: a failure must not also land in it. */
const notices = (page) => page.getByRole("region", { name: "通知" });

/**
 * Nothing was raised in the notification region for this refusal, read at once.
 *
 * `toHaveCount(0)` retries for the whole expect timeout, so it would also pass against a toast
 * that simply expired after six seconds — the very behaviour this file is about. This reads the
 * count once, after a short settle so the refusal's own render has landed.
 */
async function expectNoToast(page) {
  await page.waitForTimeout(400);
  expect(await notices(page).getByRole("button").count()).toBe(0);
}

/** The server's own words for `500 internal`, as the app says them in Chinese. */
const REASON = "服务器内部错误，请稍后重试。";

/** The refusal body both stubs answer with until they let the request through. */
const REFUSAL = { error: { code: "internal", message: "Internal server error" } };

/** A release newer than anything this checkout runs, so the row offers it. */
const OFFERED = {
  currentVersion: "0.0.1",
  buildDate: null,
  latestVersion: "9.9.9",
  updateAvailable: true,
  releaseUrl: "https://github.com/lmliheng/Adelie/releases/tag/v9.9.9",
  publishedAt: null,
  checkedAt: new Date().toISOString(),
};

/**
 * Sign in as the seeded administrator (the update routes are admin-only), give the Project a model
 * — the onboarding overlay ("尚未配置模型") covers the page without one — and answer the browser's
 * update check with the release above, so the account menu carries an update row.
 *
 * The model is a `custom` entry pointing nowhere on purpose: this spec never sends a message, and
 * the overlay only asks whether the Project has one.
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
          apiKey: "sk-unused",
          baseUrl: "http://127.0.0.1:9",
          contextWindow: 200000,
        },
      ],
    },
  });
  expect(put.ok(), "put models").toBeTruthy();
  await page.route("**/api/version/update-check*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(OFFERED),
    }),
  );
}

/** The update modal, opened the way a person opens it: the user menu, then its update row. */
async function openUpdateModal(page) {
  await page.goto("/");
  // The user menu shares its name with the Project switcher, so take the last match (as chat.spec).
  await page.getByRole("button", { name: ADMIN_ID }).last().click();
  await page.getByRole("menuitem", { name: /新版本 v9\.9\.9 可用/ }).click();
  const modal = page.getByRole("dialog", { name: "软件更新" });
  await expect(modal).toBeVisible();
  return modal;
}

/**
 * Refuse the requests this predicate picks (500 `internal`) until `letThrough()`; every other
 * request on the same URL falls back to the server. The picked ones are counted, so the spec can
 * tell a request from a dead control.
 */
async function stubRefusal(page, url, picks, seen) {
  let refuse = true;
  await page.route(url, async (route) => {
    if (!picks(route.request())) return route.fallback();
    seen.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    if (!refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify(REFUSAL),
    });
  });
  return () => {
    refuse = false;
  };
}

test("a download that could not be started says why in the modal, and the same button retries it", async ({
  page,
}) => {
  await ready(page);
  const seen = [];
  const letThrough = await stubRefusal(
    page,
    "**/api/version/update",
    (req) => req.method() === "POST",
    seen,
  );

  const modal = await openUpdateModal(page);
  await modal.getByRole("button", { name: "下载并更新" }).click();

  const line = modal.getByText(`没能开始下载这次更新，更新没有开始：${REASON}`);
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute("role", "alert");
  // The modal stays on the step it was on: the release is still on offer, the button still there.
  await expect(modal.getByText("新版本 v9.9.9 可用")).toBeVisible();
  await expectNoToast(page);
  // Seven seconds later it is still there — a toast would be gone by now.
  await page.waitForTimeout(7000);
  await expect(line).toBeVisible();

  // The same button, once the backend lets it through: the sentence goes and the run lands — this
  // server was not launched through the CLI, so the job answers at once that it cannot update.
  letThrough();
  await modal.getByRole("button", { name: "下载并更新" }).click();
  await expect(modal.getByTestId("update-request-refusal")).toHaveCount(0, { timeout: 30_000 });
  await expect(
    modal.getByText("当前服务不是通过 penguin web 或 penguin server 启动的，无法从这里更新"),
  ).toBeVisible();
  expect(seen).toContain("POST /api/version/update");
});

test("a restart that was refused says why in the modal, and the same button retries it", async ({
  page,
}) => {
  await ready(page);
  // The download "succeeds" for this case: what is under test is the restart into it.
  await page.route("**/api/version/update", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        state: "done",
        targetVersion: "9.9.9",
        output: "",
        result: { status: "updated", output: "", needsRestart: true },
      }),
    });
  });
  const seen = [];
  const letThrough = await stubRefusal(
    page,
    "**/api/version/restart",
    (req) => req.method() === "POST",
    seen,
  );

  const modal = await openUpdateModal(page);
  await modal.getByRole("button", { name: "下载并更新" }).click();
  await expect(modal.getByText("v9.9.9 已就绪")).toBeVisible();

  await modal.getByRole("button", { name: "重启并更新" }).click();
  const line = modal.getByText(`没能重启，新版本已装好但还没有生效：${REASON}`);
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute("role", "alert");
  // The release is still installed and still waiting for the restart: nothing else moved.
  await expect(modal.getByText("v9.9.9 已就绪")).toBeVisible();
  await expectNoToast(page);
  await page.waitForTimeout(7000);
  await expect(line).toBeVisible();

  // The same button, once the backend lets it through: the sentence goes, and the server's own
  // "nothing supervises this process" answer takes the modal to the manual restart.
  letThrough();
  await modal.getByRole("button", { name: "重启并更新" }).click();
  await expect(modal.getByTestId("update-request-refusal")).toHaveCount(0);
  await expect(modal.getByText(/当前服务不是由 penguin web 或 penguin server 托管/)).toBeVisible();
  await expect(modal.getByRole("button", { name: "重启并更新" })).toHaveCount(0);
  expect(seen).toContain("POST /api/version/restart");
});
