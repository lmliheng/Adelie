/**
 * Regression: a group whose key is written by hand told you nothing about that key on its header —
 * the mask that proves the write sits on a card inside the fold, so a folded Venice AI looked
 * exactly the same keyed and unkeyed.
 *
 * The header now carries the connection status's twin: a dot and the words 未配置密钥 / 已配置密钥,
 * drawn for exactly the groups that carry "Enter key" and have no Connect flow of their own. This
 * spec is about the DOM — the line really draws while the group is folded, and it really flips when
 * a key lands. Which groups get it is pinned without a browser in test/model-group-header.test.ts.
 *
 * The groups are the built-in ones the page ships with (the seeded Project's table), so the spec
 * works on the catalog the build was cut from rather than on rows it invents: Venice AI takes no
 * hand-added models, and the two kinds that must NOT get the line — a connect group and Custom —
 * only exist as the catalog draws them.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const P = "password123";
const KEY = "sk-probe-group-key";

/** A fragment of a model id only one group's rows carry, per group the tests ask about. */
const VENICE_MODEL = "uncensored-role-play";
const TOKENDANCE_MODEL = "dots-3-note-preview";
const CUSTOM_MODEL = "Atria";

/** The list is filtered rather than scrolled: a search leaves its group on screen and opens it. */
async function searchFor(page, needle) {
  await page.locator('input[placeholder*="搜索"]').first().fill(needle);
}

const tooltip = (page, text) => page.locator(`[data-tooltip="${text}"]`);

test("a hand-keyed group's folded header says whether a key is configured, and the write flips it", async ({
  page,
}) => {
  await provisionAndLogin(page.request, "gkshand", P);
  await page.goto("/models");
  await searchFor(page, VENICE_MODEL);

  // Folded and unconfigured: the header says so, rather than looking like a keyed group.
  await expect(page.getByRole("button", { name: /^Venice AI/ })).toBeVisible();
  await expect(tooltip(page, "未配置密钥")).toBeVisible();
  await expect(tooltip(page, "已配置密钥")).toHaveCount(0);

  // One key written across the group, through the header's own action.
  await page.getByRole("button", { name: "填写密钥 Venice AI" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("API key").fill(KEY);
  await dialog.getByRole("button", { name: "确认" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The same header now reads the other way, with the key really stored on the server.
  await expect(tooltip(page, "已配置密钥")).toBeVisible();
  await expect(tooltip(page, "未配置密钥")).toHaveCount(0);

  const { projects } = await (await page.request.get(`${BASE}/api/projects`)).json();
  const models = (
    await (await page.request.get(`${BASE}/api/projects/${projects[0].projectId}/models`)).json()
  ).models;
  expect(
    models.find((m) => m.provider === "venice" && m.credential?.apiKeyMasked)?.credential
      ?.apiKeyMasked,
  ).toBeTruthy();
});

test("a connect group reads out its own status, and Custom reads out nothing", async ({ page }) => {
  await provisionAndLogin(page.request, "gksother", P);
  await page.goto("/models");

  // A group with a connect flow says it through Connect's own status, not through the key line.
  await searchFor(page, TOKENDANCE_MODEL);
  await expect(page.getByRole("button", { name: /^TokenDance/ })).toBeVisible();
  await expect(tooltip(page, "未连接")).toBeVisible();
  await expect(tooltip(page, "未配置密钥")).toHaveCount(0);
  await expect(tooltip(page, "已配置密钥")).toHaveCount(0);

  // Custom has no group key at all — neither reading is drawn, though its group is on screen.
  await searchFor(page, CUSTOM_MODEL);
  await expect(page.getByRole("button", { name: /^Custom/ })).toBeVisible();
  await expect(tooltip(page, "未连接")).toHaveCount(0);
  await expect(tooltip(page, "未配置密钥")).toHaveCount(0);
  await expect(tooltip(page, "已配置密钥")).toHaveCount(0);
});
