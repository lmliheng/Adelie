/**
 * Regression: a refused member write in the Project settings dialog keeps its reason above the
 * table that asked, instead of in a notification that dismisses itself.
 *
 * Granting and revoking a member leave everything on screen either way — the add row keeps the
 * name that was typed, the member's own row keeps its 「移除」 button — so the retry is the same
 * control and the sentence only has to say who was not added or removed and why. Before, the
 * reason lived six seconds in a toast over a table that looked untouched: a member who had in
 * fact NOT been removed looked exactly like one who had, and nothing said otherwise.
 *
 * Both refusals here are the server's own, not stubs: adding an account that does not exist
 * answers 404 `user_not_found`, and removing a member somebody else just removed answers 404
 * `member_not_found`. The retries are real writes too, so "the same button retries" is measured
 * against the server rather than against a route that was taken over.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionUser } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const P = "password123";

/** The shared notification region: a refusal must not also land in it. */
const notices = (page) => page.getByRole("region", { name: "通知" });

/** The first Project's id, as the page sees it. */
async function projectIdOf(page) {
  return (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0].projectId;
}

/** Makes `userId` a member; "already a member" counts as done (this data root outlives a rerun). */
async function ensureMember(page, projectId, userId) {
  const res = await page.request.post(`${BASE}/api/projects/${projectId}/members`, {
    data: { userId },
  });
  expect(res.ok() || res.status() === 409).toBeTruthy();
}

/** Opens Project settings → Members through the sidebar, the way a user gets there. */
async function openMembers(page) {
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const project = projects.projects[0];
  const sidebar = page.getByRole("complementary");
  await expect(sidebar).toBeVisible({ timeout: 20000 });
  await sidebar.getByRole("button", { name: project.name ?? project.projectId }).click();
  // The switcher's rows are plain buttons (its own comment says so: no role="menu").
  // A DOM click: the row closes its menu as it opens the dialog, and the actionability retry
  // that follows that layout change lands on the new scrim. What this spec is about is the
  // dialog's table, not how its menu animates.
  await page.getByRole("button", { name: "项目设置" }).evaluate((el) => el.click());
  const dialog = page.getByRole("dialog", { name: "项目设置" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "成员" }).click();
  // The table arrives with the member list; the add row is the last one.
  await expect(dialog.getByPlaceholder("用户名")).toBeVisible();
  return dialog;
}

test("a refused grant names the account above the table, and the same box retries it", async ({
  page,
}) => {
  // A fresh account per run: this data root outlives a rerun, and a retry has to add a row.
  const U = `member_${Date.now()}`;
  await provisionUser(U, P);
  // The members page is the owner's: the signed-in account is the built-in admin.
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  await page.goto(`${BASE}/chat`);
  const dialog = await openMembers(page);

  // A username nobody has: the server answers 404 user_not_found.
  const ghost = `ghost_${Date.now()}`;
  const box = dialog.getByPlaceholder("用户名");
  // Counted, not pinned: this data root outlives a rerun, and other members may be in the table.
  const rows = dialog.locator("tbody tr");
  const before = await rows.count();
  await box.fill(ghost);
  await dialog.getByRole("button", { name: "添加成员" }).click();

  const refusal = dialog.getByTestId("member-refusal");
  await expect(refusal).toBeVisible();
  await expect(refusal).toHaveAttribute("role", "alert");
  await expect(refusal).toHaveText(`没能把「${ghost}」加进成员，名单没有变化：该用户已不存在。`);
  // The name that was typed is still there, and the table still holds only the owner's row and
  // the add row: the refused account did not become a row.
  await expect(box).toHaveValue(ghost);
  await expect(rows).toHaveCount(before);
  // Nothing was reported through a notification instead.
  await expect(notices(page).getByRole("button")).toHaveCount(0);

  // Six seconds is how long a toast lives: the sentence has to outlive it.
  await page.waitForTimeout(7000);
  await expect(refusal).toBeVisible();

  // The same box is the retry: a real account goes in, the sentence goes away, the row arrives.
  await box.fill(U);
  await dialog.getByRole("button", { name: "添加成员" }).click();
  await expect(refusal).toHaveCount(0);
  await expect(rows).toHaveCount(before + 1);
  await expect(dialog.getByRole("row", { name: new RegExp(U) })).toBeVisible();
  const members = await (
    await page.request.get(`${BASE}/api/projects/${await projectIdOf(page)}/members`)
  ).json();
  expect(members.members.map((m) => m.userId)).toContain(U);
});

test("a refused revocation keeps the row and its reason, and the same button retries it", async ({
  page,
}) => {
  const U = `target_${Date.now()}`;
  await provisionUser(U, P);
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const projectId = await projectIdOf(page);
  // The row the page will draw: this account IS a member when the dialog opens.
  await ensureMember(page, projectId, U);

  await page.goto(`${BASE}/chat`);
  const dialog = await openMembers(page);
  const row = dialog.getByRole("row", { name: new RegExp(U) });
  await expect(row).toBeVisible();

  // Somebody else revokes it meanwhile (another owner, a second tab): the row on screen is stale,
  // which is exactly what the server answers 404 member_not_found for.
  const drop = await page.request.delete(`${BASE}/api/projects/${projectId}/members/${U}`);
  expect(drop.ok()).toBeTruthy();
  // Scoped to the row the sentence is about: other members' rows have the same button.
  await row.getByRole("button", { name: "移除" }).click();

  const refusal = dialog.getByTestId("member-refusal");
  await expect(refusal).toBeVisible();
  await expect(refusal).toHaveText(
    `没能把「${U}」移出成员，名单没有变化：该用户不是本项目的成员。`,
  );
  // The table still shows the row the sentence is about, and nothing was notified.
  await expect(row).toBeVisible();
  await expect(notices(page).getByRole("button")).toHaveCount(0);

  // Put the membership back and press the same button: it lands, so the row and the reason go.
  await ensureMember(page, projectId, U);
  await row.getByRole("button", { name: "移除" }).click();
  await expect(refusal).toHaveCount(0);
  await expect(row).toHaveCount(0);
});
