/**
 * Regression: the security page's three rule fields say their own length ceiling, so a paste that
 * the browser cut at the cap does not pass for a value that was entered whole.
 *
 * The route bounds every field (`MAX_RULE_NAME_LEN` 64, `MAX_RULE_PATTERN_LEN` 512,
 * `MAX_RULE_DESCRIPTION_LEN` 300), and the inputs carry the same `maxLength` — so pasting a longer
 * pattern silently drops its tail. A cut pattern that still compiles is then saved as a rule
 * matching something other than what was pasted, with nothing on screen having said a character was
 * dropped. `src/lib/command-policy-rule-limit.ts` mirrors the numbers so the field can say so under
 * itself the moment it reaches them.
 *
 * The text is inserted with the keyboard rather than filled in: `fill()` writes the value past the
 * cap, which is exactly the state a browser never produces for a real user.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;

/** The route's own bounds, mirrored here as the situation being tested. */
const NAME_LIMIT = 64;
const PATTERN_LIMIT = 512;
const DESC_LIMIT = 300;

async function projectIdOf(page) {
  return (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0].projectId;
}

/**
 * Starts each case from a short list of the Project's own factory rules: other specs in this suite
 * store long lists into the same data root, and one of them can leave the add entry point at the
 * 64-rule ceiling where this spec needs it live.
 */
async function storeShortPolicy(page, projectId, extra = []) {
  const stored = await (
    await page.request.get(`${BASE}/api/projects/${projectId}/command-policy`)
  ).json();
  const rules = [...extra, ...stored.defaultRules.slice(0, 2)];
  const put = await page.request.put(`${BASE}/api/projects/${projectId}/command-policy`, {
    data: { enabled: true, rules },
  });
  expect(put.ok(), await put.text()).toBeTruthy();
  return rules.length;
}

/** Opens Project settings → Security policy through the sidebar, the way a user gets there. */
async function openSecurity(page) {
  // A data root with no model credential yet greets the chat page with its guide, which sits
  // above everything on its own scrim — dismiss it before reaching into the sidebar.
  const guide = page.getByRole("dialog", { name: "尚未配置模型 credential" });
  await guide.waitFor({ state: "visible", timeout: 4000 }).catch(() => {});
  if (await guide.count()) await guide.getByRole("button", { name: "稍后" }).click();

  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const project = projects.projects[0];
  const sidebar = page.getByRole("complementary");
  await expect(sidebar).toBeVisible({ timeout: 20000 });
  await sidebar.getByRole("button", { name: project.name ?? project.projectId }).click();
  // Same DOM click as the members spec: the row closes its menu as it opens the dialog.
  await page.getByRole("button", { name: "项目设置" }).evaluate((el) => el.click());
  const dialog = page.getByRole("dialog", { name: "项目设置" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "安全策略" }).click();
  await expect(dialog.getByRole("switch").first()).toBeVisible();
  await expect(dialog.getByRole("button", { name: "保存" })).toBeVisible();
  return dialog;
}

test("a paste longer than a field's ceiling is cut there, and the field says so", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  await storeShortPolicy(page, await projectIdOf(page));

  await page.goto(`${BASE}/chat`);
  const dialog = await openSecurity(page);
  await dialog.getByRole("button", { name: "添加规则" }).click();

  const name = dialog.getByLabel(/^名称/);
  const pattern = dialog.getByLabel(/^正则表达式/);
  const desc = dialog.getByLabel(/^描述/);
  await expect(name).toBeVisible();
  // Nothing is said before any field is touched.
  await expect(dialog.getByTestId(/^command-policy-rule-(name|pattern|desc)-limit$/)).toHaveCount(
    0,
  );

  // The pattern is the field that matters: a long deny list pasted into it arrives cut at 512,
  // and the note names the number so the cut cannot pass for an intact paste.
  await pattern.click();
  await page.keyboard.insertText("a".repeat(PATTERN_LIMIT + 120));
  await expect(pattern).toHaveValue("a".repeat(PATTERN_LIMIT));
  const patternNote = dialog.getByTestId("command-policy-rule-pattern-limit");
  await expect(patternNote).toBeVisible();
  await expect(patternNote).toContainText(String(PATTERN_LIMIT));
  // Only the field that reached its ceiling speaks.
  await expect(dialog.getByTestId("command-policy-rule-name-limit")).toHaveCount(0);
  await expect(dialog.getByTestId("command-policy-rule-desc-limit")).toHaveCount(0);

  // One character back leaves the ceiling, and the sentence goes with it.
  await pattern.press("Backspace");
  await expect(patternNote).toHaveCount(0);

  await name.click();
  await page.keyboard.insertText("n".repeat(NAME_LIMIT + 10));
  await expect(name).toHaveValue("n".repeat(NAME_LIMIT));
  await expect(dialog.getByTestId("command-policy-rule-name-limit")).toContainText(
    String(NAME_LIMIT),
  );

  await desc.click();
  await page.keyboard.insertText("d".repeat(DESC_LIMIT + 40));
  await expect(desc).toHaveValue("d".repeat(DESC_LIMIT));
  await expect(dialog.getByTestId("command-policy-rule-desc-limit")).toContainText(
    String(DESC_LIMIT),
  );
});

test("a rule already at a ceiling says so when its editor opens", async ({ page }) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  // The state a Project really holds after a cut paste: a pattern of exactly the cap, stored.
  const count = await storeShortPolicy(page, await projectIdOf(page), [
    { name: "pinned", pattern: "b".repeat(PATTERN_LIMIT), enabled: true },
  ]);
  expect(count).toBe(3);

  await page.goto(`${BASE}/chat`);
  const dialog = await openSecurity(page);
  await expect(dialog.getByText(new RegExp(`^规则 · ${count}$`))).toBeVisible();
  await dialog.getByRole("button", { name: "编辑" }).first().click();

  const pattern = dialog.getByLabel(/^正则表达式/);
  await expect(pattern).toHaveValue("b".repeat(PATTERN_LIMIT));
  // Up front, before anything is typed: the value on screen is already the one that would save.
  await expect(dialog.getByTestId("command-policy-rule-pattern-limit")).toContainText(
    String(PATTERN_LIMIT),
  );
  await expect(dialog.getByTestId("command-policy-rule-name-limit")).toHaveCount(0);

  // Leave the editor as it was found: nothing is saved by this spec.
  await dialog.getByRole("button", { name: "取消" }).click();
});
