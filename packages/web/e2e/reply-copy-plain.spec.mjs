/**
 * A reply's two copy actions, in a real browser: the reply as the Markdown it was written in, and
 * the same words as plain text — pasted where `| --- |` would otherwise show up literally.
 * - 复制回复 writes the source: the table keeps its pipes and its alignment row.
 * - 复制纯文本 writes the words with the markup taken out: no row of dashes, no pipe at a row's
 *   edge, and a bare URL that was autolinked still appearing once.
 * - Each button names itself and confirms on its own (the copy glyph swaps to a check, the
 *   screen-reader region beside it says 已复制) only once the write landed.
 * The mock's default branch drives it: one tool call, then the reply carrying the Markdown table
 * (mock-llm.mjs).
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const U = "replycopyuser";
const P = "password123";
const SENTENCE = "Command finished; the result looks as expected.";
const TABLE_HEAD = "指标 | 标识 | 说明";
const URL =
  "https://example.com/penguin-harness/reports/2026-07/agent-session-0123456789abcdef0123456789abcdef/artifacts/deep-verification-run-with-a-very-long-descriptive-file-name-v3.html";

/** The text currently on the clipboard. */
const clipboard = (page) => page.evaluate(() => navigator.clipboard.readText());

test("a reply copies as Markdown, and beside it as plain text", async ({ page }) => {
  await provisionAndLogin(page.request, U, P);
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
  const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
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
  expect(put.ok(), "put models").toBeTruthy();
  const sess = await (
    await page.request.post(`${BASE}/api/projects/${projectId}/agents/default_agent/sessions`, {
      data: { provider: "custom", modelId: "claude-4-8", approvalMode: "allow-all" },
    })
  ).json();

  await page.goto(`${BASE}/chat/${sess.session.sessionId}`);
  const composer = page.getByPlaceholder(/输入消息/);
  await composer.waitFor();
  await composer.fill("check the directory");
  await page.getByRole("button", { name: "发送" }).click();
  const reply = page.getByText(SENTENCE, { exact: true });
  await expect(reply).toBeVisible({ timeout: 30_000 });

  // Two copies sit at the reply's footer, and the plain-text one is announced as its own action.
  const plainCopy = page.getByRole("button", { name: "复制纯文本" }).first();
  await reply.hover();
  await expect(plainCopy).toBeVisible();

  // The Markdown copy is unchanged: the source, pipes and alignment row included.
  await page.getByRole("button", { name: "复制回复" }).first().click();
  const markdown = await clipboard(page);
  expect(markdown).toContain(SENTENCE);
  expect(markdown).toContain(`| ${TABLE_HEAD} |`);
  expect(markdown).toContain("| --- | --- | --- |");

  // The plain-text copy: the same reply, with the markup taken out. The footer copies the whole
  // turn (the note sent before the tool call included), so the comparison is per construct.
  await plainCopy.click();
  const plain = await clipboard(page);
  expect(plain).toContain(SENTENCE);
  expect(plain).toContain(TABLE_HEAD);
  expect(plain).not.toContain("| ---");
  expect(plain.split("\n").some((line) => line.trimStart().startsWith("|"))).toBe(false);
  // An autolinked bare URL keeps its one copy, rather than reading as "address (address)".
  expect(plain.split(URL)).toHaveLength(2);
  // Feedback follows the write: the check replaces this button's own glyph, and the live region
  // beside it (a sibling of the button, never inside it) is what says so.
  const announcement = page.locator('button[aria-label="复制纯文本"] + span[aria-live="polite"]');
  await expect(announcement).toHaveText("已复制");
});
