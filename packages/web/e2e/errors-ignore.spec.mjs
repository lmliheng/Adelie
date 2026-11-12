/**
 * Ignoring a class of errors: the table stops showing it while every record stays in the store.
 *
 * The panel's only way to make a noisy class go away used to be 清空 — which deletes rows for
 * everyone, irreversibly. The ignore rules are the reversible alternative, and the exact claim
 * they make is "nothing is deleted": these tests drive the row action, the notice it leaves
 * behind, and the ignored view that manages the rules, and they read the store through the API
 * on both sides of every step. A regression that quietly deleted the records would still draw
 * the right table, so only the API reads can tell the two apart.
 *
 * The errors are real ones the server recorded itself: the mock rejects the auth prompt with 401
 * (`unauthorized`, an `unexpected` record), reaching `error_records` through the server's own
 * recorder. Every assertion below reads numbers out of responses, so a rerun holds.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";

/**
 * The error table read straight from the API, with `extra` on top (e.g. the ignored side). Read
 * without a range on purpose: the page's own range is a preset the panel applies, and a read wider
 * than it can only make the two assertions below stronger — the record is there whatever the range,
 * and the default side hands back no trace of it.
 */
async function readTable(page, projectId, extra = {}) {
  const u = new URL(`${BASE}/api/projects/${projectId}/usage/errors`);
  u.searchParams.set("offset", "0");
  u.searchParams.set("limit", "50");
  for (const [key, value] of Object.entries(extra)) u.searchParams.set(key, value);
  const res = await page.request.get(u.toString());
  expect(res.ok(), `read ${u.toString()}`).toBeTruthy();
  return await res.json();
}

/** The owner's rules list, straight from the route the panel reads it through. */
async function readRules(page, projectId) {
  const res = await page.request.get(`${BASE}/api/projects/${projectId}/usage/errors/ignores`);
  expect(res.ok(), "read ignore rules").toBeTruthy();
  return (await res.json()).rules;
}

/** Provision the user, point the Project at the mock (a key the mock rejects), open one Session. */
async function prepare(page, userId) {
  await provisionAndLogin(page.request, userId, P);
  const { projects } = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects[0].projectId;
  const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
    data: {
      defaultModel: { provider: "custom", modelId: "claude-4-8" },
      models: [
        {
          provider: "custom",
          modelId: "claude-4-8",
          apiKey: "sk-auth-bad",
          baseUrl: MOCK,
          contextWindow: 200000,
        },
      ],
    },
  });
  expect(put.ok(), "put models").toBeTruthy();
  return { projectId, sessionId: await newSession(page, projectId) };
}

function newSession(page, projectId) {
  return page.request
    .post(`${BASE}/api/projects/${projectId}/agents/default_agent/sessions`, {
      data: { provider: "custom", modelId: "claude-4-8" },
    })
    .then(async (res) => {
      expect(res.ok(), "create session").toBeTruthy();
      return (await res.json()).session.sessionId;
    });
}

/** One failed turn through the API; resolves once the Trace holds its terminal `request_end`. */
async function failedTurn(page, sessionId, text, code) {
  const res = await page.request.post(`${BASE}/api/sessions/${sessionId}/tasks`, {
    data: { input: [{ type: "text", text }] },
  });
  expect(res.status(), "start task").toBe(202);
  await expect
    .poll(
      async () => {
        const { messages } = await (
          await page.request.get(`${BASE}/api/sessions/${sessionId}/messages`)
        ).json();
        return messages.some(
          (m) => m.payload.type === "request_end" && m.payload.error_code === code,
        );
      },
      { timeout: 30_000 },
    )
    .toBe(true);
}

/** One failed turn on the books, and the record the panel will offer to silence. Read before the
 * App loads, so the only record so far is this one (the shell's own 403 lands later). */
async function seedError(page, projectId, sessionId) {
  await failedTurn(page, sessionId, "auth dead test", "auth");
  const { items } = await readTable(page, projectId);
  expect(items.length, "one failed turn is on the books").toBeGreaterThan(0);
  return items[0];
}

/** Silences `target`'s class from its own row; returns the write's answer. */
async function ignoreFromRow(page, target) {
  const row = page.locator("tbody tr").filter({ hasText: target.code }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "忽略这类异常", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(target.code);
  const posted = page.waitForResponse(
    (r) => r.url().includes("/usage/errors/ignores") && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "忽略", exact: true }).click();
  const res = await posted;
  expect(res.ok(), "ignore the class").toBeTruthy();
  return await res.json();
}

test("a row action silences its class, leaves every record in the store, and 撤销 puts it back", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { projectId, sessionId } = await prepare(page, "ignorerow");
  const target = await seedError(page, projectId, sessionId);

  await page.goto("/usage");
  await expect(page.locator("tbody tr").first()).toBeVisible();

  const answer = await ignoreFromRow(page, target);

  // The table loses the class, the notice says how many rows went with it, and the count the
  // stats report comes from the server rather than from the notice.
  await expect(row(page, target)).toHaveCount(0);
  // The same sentence twice: once as the toast that goes on its own, once as the notice that
  // stays with the way back.
  await expect(page.getByRole("button", { name: /本次隐藏 \d+ 条记录/ })).toBeVisible();
  await expect(page.locator("[data-ignore-notice]")).toContainText(
    /已忽略 .* · 本次隐藏 \d+ 条记录/,
  );
  await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeVisible();
  expect(answer.hidden).toBeGreaterThan(0);

  // Nothing was deleted: the records are exactly where they were, behind the rule. The default
  // read leaves them out and the ignored side hands them back — the same rows, same ids.
  const hidden = await readTable(page, projectId, { ignored: "1" });
  const stillThere = hidden.items.filter((i) => i.code === target.code);
  expect(stillThere.length, "the ignored read still sees the record").toBeGreaterThan(0);
  expect(stillThere[0].id).toBe(target.id);
  const plain = await readTable(page, projectId);
  expect(plain.items.some((i) => i.code === target.code)).toBe(false);

  // One rule, this class, and it covers records.
  const [rule] = await readRules(page, projectId);
  expect(rule).toMatchObject({
    source: target.source,
    code: target.code,
    messageLike: null,
  });
  expect(rule.hidden).toBeGreaterThan(0);

  // 撤销 removes the rule itself; every record it covered is back with no write to the store.
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(page.getByText(/^已恢复 .* 的异常$/)).toBeVisible();
  await expect(row(page, target).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "撤销", exact: true })).toHaveCount(0);
  expect(await readRules(page, projectId)).toHaveLength(0);
  const after = await readTable(page, projectId);
  expect(after.items.some((i) => i.code === target.code)).toBe(true);
});

test("the ignored view names the rules, and 取消忽略 re-exposes every record", async ({ page }) => {
  test.setTimeout(120_000);
  const { projectId, sessionId } = await prepare(page, "ignoreview");
  const target = await seedError(page, projectId, sessionId);

  await page.goto("/usage");
  await expect(page.locator("tbody tr").first()).toBeVisible();

  // The row's dialog offers the narrowing before the rule exists — the fragment is what the row
  // button alone cannot express. Left blank here: this test is about the whole class.
  const rowButton = page
    .locator("tbody tr")
    .filter({ hasText: target.code })
    .first()
    .getByRole("button", { name: "忽略这类异常", exact: true });
  await rowButton.click();
  await expect(page.getByRole("dialog").getByLabel("只忽略消息包含以下内容的记录")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await ignoreFromRow(page, target);

  // A clear still names only what a clear deletes: the records behind the rule are neither
  // counted nor hidden — the sentence says so rather than leaving them out silently.
  await page.getByRole("button", { name: "清空", exact: true }).click();
  const clearDialog = page.getByRole("dialog");
  await expect(clearDialog).toBeVisible();
  await expect(clearDialog).toContainText(/另有 \d+ 条已忽略的记录不在此列。/);
  await clearDialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The fourth view is where the rules live, and it reads the other side of them: the rule, what
  // it covers, and the rows it holds back — which is also what its own 清空 would take.
  await page.getByRole("button", { name: "已忽略", exact: true }).click();
  await expect(page.locator("[data-ignore-rule]")).toHaveCount(1);
  const rule = page.locator("[data-ignore-rule]").first();
  await expect(rule).toContainText(target.code);
  await expect(rule).toContainText(/已隐藏 \d+ 条/);
  await expect(page.getByText("被忽略的记录仍在库里，只是不再出现在其他视图里。")).toBeVisible();
  await expect(page.locator("tbody tr").filter({ hasText: target.code }).first()).toBeVisible();

  // 取消忽略 is the same act as 撤销, from the list instead of the notice: rules gone, rows back.
  await rule.getByRole("button", { name: "取消忽略", exact: true }).click();
  await expect(page.getByText(/^已恢复 .* 的异常$/)).toBeVisible();
  await expect(page.getByText("还没有忽略规则。")).toBeVisible();
  expect(await readRules(page, projectId)).toHaveLength(0);

  await page.getByRole("button", { name: "全部", exact: true }).click();
  await expect(page.locator("tbody tr").filter({ hasText: target.code }).first()).toBeVisible();
  const back = await readTable(page, projectId);
  expect(back.items.some((i) => i.code === target.code)).toBe(true);
});

/** The table row standing for a record: the panel folds repeats of a class into one row. */
function row(page, target) {
  return page.locator("tbody tr").filter({ hasText: target.code });
}

test("a refused ignore keeps the card, its sentence and every record", async ({ page }) => {
  test.setTimeout(120_000);
  // A fresh account per run: the rules are the Project's, so a rerun on the same data root would
  // otherwise find the rule a previous run left behind and start from a table with no such row.
  const user = `ignorerefuse_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const { projectId, sessionId } = await prepare(page, user);
  const target = await seedError(page, projectId, sessionId);

  await page.goto("/usage");
  await expect(page.locator("tbody tr").first()).toBeVisible();

  const REFUSAL = { code: "errors_store_closed", message: "ignore store is closed" };
  await page.route("**/api/projects/*/usage/errors/ignores*", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  const targetRow = row(page, target).first();
  await expect(targetRow).toBeVisible();
  await targetRow.getByRole("button", { name: "忽略这类异常", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const sentence = await dialog.innerText();
  await dialog.getByRole("button", { name: "忽略", exact: true }).click();

  // The reason is in the card that asked — the card stays open on the class it named — and it is
  // not a toast: the notification region holds no dismissible button, and the card reads exactly
  // as before plus the one line.
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  expect((await dialog.innerText()).replace(/\n操作被拒绝：[^\n]*/, "")).toBe(sentence);

  // Nothing was silenced: the row is still in the table, there is no notice to undo, and the
  // Project has no rule — the records were never in question.
  await expect(targetRow).toBeVisible();
  await expect(page.locator("[data-ignore-notice]")).toHaveCount(0);
  expect(await readRules(page, projectId)).toHaveLength(0);

  // Reopening the card starts clean, and letting the write through lands exactly as the plain
  // path does: the class leaves the table and one rule takes its place.
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await targetRow.getByRole("button", { name: "忽略这类异常", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(REFUSAL.message)).toHaveCount(0);
  expect(await dialog.innerText()).toBe(sentence);
  await page.unroute("**/api/projects/*/usage/errors/ignores*");
  await dialog.getByRole("button", { name: "忽略", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row(page, target)).toHaveCount(0);
  expect(await readRules(page, projectId)).toHaveLength(1);
});
