/**
 * A reply's picture offers what the Agent can do with it.
 *
 * Opening a picture in a conversation used to offer saving it and stepping through the batch. The
 * lightbox now also carries whatever the conversation hands it (`actions`), and for a reply that
 * is the two things the image tool can do from a Workspace file: split it into layers, or redraw
 * from it with the instruction left for the user to finish. Both are sentences to the Agent — the
 * App has no image endpoint of its own — so what this spec checks in a real browser is exactly the
 * two ends that only a browser can show: the buttons appear only once the Agent really has the
 * Skill, and a click closes the overlay and lands on the page underneath with the picture's own
 * path already in it.
 *
 * Seeded through the API against the mock model (mock-llm.mjs, branch "image reply test"), with a
 * real PNG in the Session's Workspace first — the picture has to load for its thumbnail to be the
 * button the click goes to.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const U = "replypictureaction";
const P = "password123";

/** A 2×2 PNG, the same one reply-image.spec uses: real enough that a browser decodes it. */
const PNG_2X2 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVQIW2P8z8Dwn4GBgYGJAQ0AAB6nAgHkPj0eAAAAAElFTkSuQmCC";

/** The Agent this spec drives: created without plugins, so it starts with no image Skill at all. */
const AGENT = "pic_actions_agent";

test("a reply picture's actions need the Agent's image Skill, and act on the page", async ({
  page,
}) => {
  await provisionAndLogin(page.request, U, P);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;

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

  // A plain Agent — no plugins, therefore no `seedream` Skill — and a Workspace already holding
  // the picture the reply will name.
  const created = await page.request.post(`${BASE}/api/projects/${projectId}/agents`, {
    data: { agentId: AGENT },
  });
  expect(created.ok() || created.status() === 409, await created.text()).toBeTruthy();

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-reply-picture-actions-"));
  fs.writeFileSync(path.join(workspace, "shot.png"), Buffer.from(PNG_2X2, "base64"));

  const sess = await (
    await page.request.post(`${BASE}/api/projects/${projectId}/agents/${AGENT}/sessions`, {
      data: { provider: "custom", modelId: "claude-4-8", workspace },
    })
  ).json();
  const sessionId = sess.session.sessionId;

  await page.goto(`${BASE}/chat/${sessionId}`);
  const composer = page.getByPlaceholder(/输入消息/);
  await composer.waitFor();
  await composer.fill("image reply test, please");
  await page.getByRole("button", { name: "发送" }).click();

  const pictures = page.locator(".md-body img");
  await expect(pictures).toHaveCount(3, { timeout: 30_000 });
  const picture = pictures.nth(0);
  await expect
    .poll(() => picture.evaluate((img) => img.complete && img.naturalWidth > 0), {
      timeout: 15_000,
    })
    .toBe(true);

  // —— Without the Skill: the bar is exactly the download, the picture opens all the same ——
  const scrim = page.locator(".ui-scrim");
  await picture.click();
  await expect(scrim).toHaveCount(1);
  await expect(scrim.getByRole("link", { name: "下载" })).toBeVisible();
  await expect(scrim.getByRole("button", { name: "拆图层" })).toHaveCount(0);
  await expect(scrim.getByRole("button", { name: "照这张改一版" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(scrim).toHaveCount(0);

  // —— Install the image tool on that Agent (the library's `use-seedream`, which ships the
  // `seedream` Skill) and reload: the two buttons are there ——
  const install = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/${AGENT}/plugins`,
    { data: { names: ["use-seedream"] } },
  );
  expect(install.ok(), await install.text()).toBeTruthy();
  const skills = await (
    await page.request.get(`${BASE}/api/projects/${projectId}/agents/${AGENT}/skills`)
  ).json();
  expect(skills.skills.map((s) => s.name)).toContain("seedream");

  await page.reload();
  await picture.waitFor();
  await picture.click();
  await expect(scrim).toHaveCount(1);
  const redraw = scrim.getByRole("button", { name: "照这张改一版" });
  await expect(redraw).toBeVisible();

  // —— Redraw stops at the composer: the instruction carries the picture's own Workspace path,
  // the overlay is gone, and nothing was posted ——
  await redraw.click();
  await expect(scrim).toHaveCount(0);
  await expect(composer).toHaveValue(
    "用 seedream 技能，以工作区里的 `shot.png` 作为参考图改一版：",
  );

  // —— Layer split goes out at once, as a message of the user's own, still naming the Skill ——
  await composer.fill("");
  await picture.click();
  await expect(scrim).toHaveCount(1);
  await scrim.getByRole("button", { name: "拆图层" }).click();
  await expect(scrim).toHaveCount(0);
  await expect(page.getByText("使用技能：seedream", { exact: false })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("拆成图层（--layers）", { exact: false })).toBeVisible();
});
