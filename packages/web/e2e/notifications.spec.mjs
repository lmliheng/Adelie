/**
 * Admin notices, end to end in the real app: an admin sends one, and the account it is addressed
 * to sees it in its own account menu — the count on the 通知 row, the notice in the dialog behind
 * it, and the row going quiet once it is read.
 *
 * The first test is about the live path. The admin sends through a second, non-browser client while
 * the recipient's page is already open, and the spec records every inbox read the page issues from
 * that moment on: the count on the row has to appear with NONE, because that is what the user
 * channel (`/api/events`) is for. (The channel's own delivery — the frame on the wire — is what the
 * server-side probe in this round checked directly; here the point is that the page acts on it
 * without being told twice.) The second test is about the audience: a notice addressed to one
 * account is not in anybody else's inbox, checked after a reload so it is the server's own answer
 * rather than the page's memory.
 *
 * Both tests clear the inbox first (`read-all`): one e2e run shares a data root and the accounts are
 * reused across runs, so the count has to start from a known zero to mean anything.
 */
import { test, expect, request } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionAndLogin, provisionUser } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";

/**
 * Provision the user and give the Project a model — without one the onboarding overlay covers the
 * shell. Returns once the account can open its own pages.
 */
async function projectFor(page, user) {
  await provisionAndLogin(page.request, user, P);
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
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
}

/** A signed-in admin client, for the send. Disposed by the caller. */
async function adminClient() {
  const ctx = await request.newContext();
  await login(ctx, ADMIN_ID, ADMIN_PASSWORD);
  return ctx;
}

/** The account menu's own button: the username's last match (the Project switcher shares the name). */
function accountButton(page, user) {
  return page.getByRole("button", { name: user }).last();
}

/** The 通知 row of the open account menu. */
function noticesRow(page) {
  return page.getByRole("menuitem", { name: "通知" });
}

/** Open the account menu on a settled shell and hand back the 通知 row. */
async function openMenu(page, user) {
  // Settled before the menu is touched: a re-render mid-way would close the panel.
  await expect(page.getByRole("heading", { name: "Adelie" })).toBeVisible();
  const button = accountButton(page, user);
  await expect(button).toBeVisible();
  await button.click();
  const row = noticesRow(page);
  await expect(row).toBeVisible();
  return { button, row };
}

test("a notice reaches another account's menu without a reload, and can be read", async ({
  page,
}) => {
  const user = "noticea";
  await projectFor(page, user);

  // Every inbox read the page issues after the notice is sent. The badge below must not need one:
  // that is what "without a reload" means.
  const readsAfterSend = [];
  let sendStarted = false;
  page.on("request", (req) => {
    if (sendStarted && req.method() === "GET" && req.url().includes("/api/notifications")) {
      readsAfterSend.push(req.url());
    }
  });

  // The shell mounts here and keeps the user channel open; the notice below must arrive on it.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Adelie" })).toBeVisible();
  expect((await page.request.post(`${BASE}/api/notifications/read-all`)).ok()).toBeTruthy();

  const admin = await adminClient();
  const title = `维护窗口 ${Date.now()}`;
  const body = "今晚 23:00 起停机维护，期间无法发起对话。";
  sendStarted = true;
  const created = await admin.post(`${BASE}/api/admin/notifications`, {
    data: { scope: "global", title, body },
  });
  expect(created.ok(), "send the notice").toBeTruthy();

  // No reload, and no read either: the badge is the user channel's word.
  const { row } = await openMenu(page, user);
  await expect(row).toContainText("1");
  expect(readsAfterSend, "the badge must come from the user channel").toEqual([]);
  await row.click();

  const dialog = page.getByRole("dialog", { name: "通知" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(title)).toBeVisible();
  await expect(dialog.getByText(body)).toBeVisible();
  await expect(dialog.getByText("全体", { exact: true })).toBeVisible();
  await expect(dialog.getByText(`来自 ${ADMIN_ID}`)).toBeVisible();

  // The footer's "全部标为已读" also holds the row's words, so the row's action is matched exactly.
  const markRead = { name: "标为已读", exact: true };
  await dialog.getByRole("button", markRead).click();
  // Read: the row's own action is gone from the notice.
  await expect(dialog.getByRole("button", markRead)).toHaveCount(0);
  // The dialog's cross and its footer button share the name "关闭"; the footer's is the last.
  await dialog.getByRole("button", { name: "关闭" }).last().click();

  // Reopening re-reads the inbox: the notice is still there, and the row is quiet.
  const reopened = await openMenu(page, user);
  await expect(reopened.row).not.toContainText(/[0-9]/);
  await reopened.row.click();
  const again = page.getByRole("dialog", { name: "通知" });
  await expect(again.getByText(title)).toBeVisible();
  await expect(again.getByRole("button", markRead)).toHaveCount(0);

  await admin.dispose();
});

test("a notice addressed to one account stays out of everyone else's inbox", async ({ page }) => {
  const bystander = "noticeb";
  const addressee = "noticec";
  await projectFor(page, bystander);
  await provisionUser(addressee, P);

  await page.goto("/");
  expect((await page.request.post(`${BASE}/api/notifications/read-all`)).ok()).toBeTruthy();

  const admin = await adminClient();
  const title = `只发给 ${addressee} ${Date.now()}`;
  const created = await admin.post(`${BASE}/api/admin/notifications`, {
    data: { scope: "user", userId: addressee, title, body: "这条只有你能看到。" },
  });
  expect(created.ok(), "send the notice").toBeTruthy();

  // A reload is the strongest form of the check: the server's own answer, not the page's memory.
  await page.reload();
  const { row } = await openMenu(page, bystander);
  await expect(row).not.toContainText(/[0-9]/);
  await row.click();

  const dialog = page.getByRole("dialog", { name: "通知" });
  await expect(dialog).toBeVisible();
  // The notice addressed to the other account is nowhere in this one's inbox.
  await expect(dialog.getByText(title)).toHaveCount(0);
  await expect(dialog.getByText("单对单", { exact: true })).toHaveCount(0);

  await admin.dispose();
});
