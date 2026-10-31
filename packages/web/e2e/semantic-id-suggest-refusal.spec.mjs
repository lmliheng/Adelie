/**
 * Regression: a create dialog's "generate an id" button says why it did nothing, under the id
 * field, and the sentence outlives the six seconds a toast lives.
 *
 * The button asks the server for an id built from the display name; a model-made id needs no
 * note, a transliteration gets a quiet one and a placeholder an attention-toned one — all three
 * are lines under the field (features/semantic-id/id-suggest-notice.ts). The fourth case is the
 * request itself failing, and there the box is left exactly as it was: that used to arrive as a
 * toast and nothing else, so a reader who looked away from the notification region was left with
 * a button that had done nothing and no reason. It is now the field's own refusal line
 * (`role="alert"`, danger ink, the shared "操作被拒绝：" lead-in), cleared by the next edit or the
 * next attempt.
 *
 * Both tests run against the real server with only the suggest-id POST taken over, exactly the
 * way agent-config-refusal.spec.mjs takes over the writes it refuses: everything else — the
 * login, the Project, the Agents page, the dialog and its validation — is the app's own.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const P = "password123";

/** The proposal route, as the web app reaches it. */
const SUGGEST = /\/api\/projects\/[^/]+\/suggest-id$/;

/** What a refused proposal answers: the route's own 404 for a Project the caller cannot reach. */
const REFUSAL = {
  code: "not_found",
  message: "This project does not exist, or you have no access to it.",
};
/** The line the field draws: the shared lead-in plus the app's sentence for that code. */
const REFUSED_LINE = "操作被拒绝：资源不存在，或你没有访问权限。";
/** How long a toast lives (the notification stack's own lifetime), plus a second of slack. */
const TOAST_LIFE = 7_000;

/** The notification region: a refusal must not be announced there (that is the old toast). */
const notifications = (page) => page.getByRole("region", { name: "通知" });

/**
 * Take over the proposal POST: every request is counted, and while `state.refuse` is set it is
 * answered with the refusal instead of reaching the real route.
 */
async function interceptSuggest(page, state) {
  await page.route(SUGGEST, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    state.seen.push(route.request().url());
    if (!state.refuse) return route.fallback();
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
}

/** The create-Agent dialog, opened from the Agents page, with a name typed in and no id yet. */
async function openCreateDialog(page, user, name) {
  await provisionAndLogin(page.request, user, P);
  await page.goto(`${BASE}/agents`);
  await page.getByRole("button", { name: "手动创建", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "创建 Agent" });
  await expect(dialog).toBeVisible();
  // The id box starts empty, which is what makes "the box was left alone" readable below.
  const id = dialog.getByRole("textbox", { name: /^Agent id/ });
  await expect(id).toHaveValue("");
  // The name box's accessible name carries its hint as well ("名称 留空则使用 Agent id 作为名称").
  await dialog.getByRole("textbox", { name: /^名称/ }).fill(name);
  return { dialog, id, generate: dialog.getByRole("button", { name: "用 AI 生成" }) };
}

test("a refused id proposal says why under the field, and the line outlives the toast", async ({
  page,
}) => {
  const { dialog, id, generate } = await openCreateDialog(page, "probesuggesta", "研究助理");
  const state = { seen: [], refuse: true };
  await interceptSuggest(page, state);

  await generate.click();

  // The reason is under the box that asked, and it is not a toast.
  const line = dialog.getByRole("alert");
  await expect(line).toHaveText(REFUSED_LINE);
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.seen).toHaveLength(1);
  // Nothing was proposed into the box: the request never answered.
  await expect(id).toHaveValue("");

  // Past the lifetime of a toast, the same line is still there — this is the whole point.
  await page.waitForTimeout(TOAST_LIFE);
  await expect(line).toHaveText(REFUSED_LINE);
  await expect(id).toHaveValue("");

  // And it is cleared the moment the user edits the box, not carried over to the next name.
  await id.fill("x");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
});

test("the next attempt after a refusal lands: the line goes and the box gets the id", async ({
  page,
}) => {
  const { dialog, id, generate } = await openCreateDialog(page, "probesuggestb", "研究助理");
  const state = { seen: [], refuse: true };
  await interceptSuggest(page, state);

  await generate.click();
  await expect(dialog.getByRole("alert")).toHaveText(REFUSED_LINE);

  // Let the same button through: the real route answers (a transliterated id here — this data
  // root has no model), the refusal line is gone and what it says about the id takes its place.
  state.refuse = false;
  await generate.click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(id).not.toHaveValue("");
  expect(state.seen).toHaveLength(2);
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
});
