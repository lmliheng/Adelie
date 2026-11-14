/**
 * Regression: the update modal's own "check" request, refused, says why inside the modal — and the
 * modal stops pretending a check is still running.
 *
 * Before, `checkForUpdates()`'s failure was a toast only when the modal was closed
 * (`if (!quiet()) toastError(...)`), so with the modal open a refused check changed nothing at all:
 * with a previous answer the body went on showing it, and with no answer yet the body kept the
 * "正在检查更新…" spinner forever, while the only account of the press had nowhere to go.
 *
 * A refused check is not the flow's `error` state: that one means the server answered — it ran the
 * lookup and the lookup failed. Here our own server never answered, so the sentence says "no answer
 * this time" instead of claiming a failed lookup.
 *
 * The browser's update check is a stub throughout (the release on offer must not depend on GitHub);
 * the server is the real one. Nothing in this file asks the server to update anything, so no job is
 * spawned and nothing is restarted.
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

/** The refusal body the stubbed check answers with until it is let through. */
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

/** The same shape with nothing on offer. */
const UP_TO_DATE = {
  currentVersion: "0.0.1",
  buildDate: null,
  latestVersion: null,
  updateAvailable: false,
  releaseUrl: null,
  publishedAt: null,
  checkedAt: new Date().toISOString(),
};

/**
 * Sign in as the seeded administrator (the check carries the admin's view of the release) and give
 * the Project a model — the onboarding overlay ("尚未配置模型") covers the page without one.
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
}

/**
 * Stub every update check. `passive` answers the app's own load-time lookup (no `force`), `forced`
 * answers the dialog's manual one (`?force=1`); `null` means refuse with 500 `internal`.
 * `letThrough()` flips both to the offered release, which is what the retry has to land on.
 */
async function stubCheck(page, { passive, forced }) {
  const answers = { passive, forced };
  const seen = [];
  await page.route("**/api/version/update-check*", async (route) => {
    const forced = new URL(route.request().url()).searchParams.has("force");
    seen.push(forced ? "forced" : "passive");
    const answer = forced ? answers.forced : answers.passive;
    if (answer === null) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify(REFUSAL),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(answer),
    });
  });
  return {
    seen,
    /** The dialog's checks answer with the offered release from here on; the passive one stays. */
    letThrough() {
      answers.forced = OFFERED;
    },
  };
}

/** The update modal, opened the way a person opens it: the user menu, then its update row. */
async function openUpdateModal(page) {
  await page.goto("/");
  // The user menu shares its name with the Project switcher, so take the last match (as chat.spec).
  await page.getByRole("button", { name: ADMIN_ID }).last().click();
  await page.getByRole("menuitem", { name: "检查更新" }).click();
  const modal = page.getByRole("dialog", { name: "软件更新" });
  await expect(modal).toBeVisible();
  return modal;
}

test("a check that got no answer at all says why in the modal, and the footer offers the retry", async ({
  page,
}) => {
  await ready(page);
  // Nothing is known on this load: the app's own lookup is refused too, so the dialog opens on a
  // blank state rather than on a previous answer.
  const check = await stubCheck(page, { passive: null, forced: null });

  // Opening the dialog starts a check by itself (nothing is known); that one is refused as well.
  const modal = await openUpdateModal(page);
  const line = modal.getByText(`没能检查更新，这次没有问到结果：${REASON}`);
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute("role", "alert");
  // The spinner is gone with it — no answer is coming, and the sentence is the whole account.
  await expect(modal.getByText("正在检查更新…")).toHaveCount(0);
  await expectNoToast(page);
  // Seven seconds later it is still there — a toast would be gone by now.
  await page.waitForTimeout(7000);
  await expect(line).toBeVisible();

  // The footer carries the retry the sentence points at, and pressing it lands on the release.
  check.letThrough();
  await modal.getByRole("button", { name: "检查更新" }).click();
  await expect(modal.getByTestId("update-request-refusal")).toHaveCount(0);
  await expect(modal.getByText("新版本 v9.9.9 可用")).toBeVisible();
  expect(check.seen.filter((k) => k === "forced").length).toBe(2);
});

test("a refused check leaves the previous answer where it was, and says why above the retry", async ({
  page,
}) => {
  await ready(page);
  // The load-time lookup answers (nothing to update), so the dialog has an answer to stand on.
  const check = await stubCheck(page, { passive: UP_TO_DATE, forced: null });

  // An up-to-date flow opens with a check too (opensWithCheck) — this one is refused.
  const modal = await openUpdateModal(page);
  const line = modal.getByText(`没能检查更新，这次没有问到结果：${REASON}`);
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute("role", "alert");
  // The last answer is still true and still on screen; the sentence is about this attempt only.
  await expect(modal.getByText("已是最新版本")).toBeVisible();
  await expect(modal.getByText("正在检查更新…")).toHaveCount(0);
  await expectNoToast(page);
  await page.waitForTimeout(7000);
  await expect(line).toBeVisible();

  // The same button again, once the backend answers: the sentence goes, the offer takes over.
  check.letThrough();
  await modal.getByRole("button", { name: "检查更新" }).click();
  await expect(modal.getByTestId("update-request-refusal")).toHaveCount(0);
  await expect(modal.getByText("新版本 v9.9.9 可用")).toBeVisible();
});
