/**
 * WPS 面板的浏览器冒烟测试（契约 §5）—— 用 Playwright/Chromium 打开假桥提供的
 * `/addin/index.html`，页面里 stub-wps.js 生效，于是整个面板（ribbon、命令通道、聊天流、
 * 文档操作）能在没有 WPS 的机器上真的跑一遍。
 *
 * 跑法（仓库的 @playwright/test 装在 packages/web 下）：
 *   cd /root/adelie-fork/packages/web
 *   npx playwright test -c /root/adelie-fork/plugins/wps-office/test/playwright.config.mjs
 * 换端口：PANEL_BASE_URL=http://127.0.0.1:3892/ 同时给 config 与这份 spec 用。
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { startFakeBridge } from "./fake-bridge.mjs";

/**
 * @playwright/test 是仓库 packages/web 的依赖（插件本身不带依赖），从那里解析；
 * 与 playwright.config.mjs 里的同一段逻辑，两个文件各自独立可用。
 */
function loadPlaywright() {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    const manifest = join(directory, "packages", "web", "package.json");
    if (existsSync(manifest)) return createRequire(manifest)("@playwright/test");
    directory = dirname(directory);
  }
  return createRequire(import.meta.url)("@playwright/test");
}

const { test: base, expect } = loadPlaywright();

const BASE_URL = process.env.PANEL_BASE_URL || "http://127.0.0.1:3891";
const PORT = Number(new URL(BASE_URL).port || 3891);

let bridge;

/** 每个用例一份控制台/页面错误清单；资源类的无关噪声（favicon、连接中断）不算。 */
const test = base.extend({
  errors: async ({ page }, use) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (text.includes("favicon") || text.includes("ERR_ABORTED")) return;
      errors.push(`console: ${text}`);
    });
    await use(errors);
  },
});

test.beforeAll(async () => {
  bridge = await startFakeBridge({ port: PORT });
});

test.afterAll(async () => {
  await bridge.close();
});

test.beforeEach(() => {
  bridge.reset();
});

/** 打开面板并等它就绪（连上桥、发送按钮可用）。 */
async function openPanel(page) {
  await page.goto("/addin/index.html");
  await expect(page.locator("#send")).toBeVisible();
  await expect(page.locator("#conn-text")).toHaveText("已连接 Adelie");
  await expect(page.locator("#doc-line")).toContainText("季度报告.docx");
}

test("面板渲染出来，并把文档概况报给桥（契约 §2.1）", async ({ page, errors }) => {
  await openPanel(page);

  await expect(page.getByRole("heading", { name: "让 Adelie 直接改这篇文档" })).toBeVisible();
  await expect(page.locator("#doc-line")).toContainText("5 段");

  const state = await bridge.waitFor((snapshot) => snapshot.hellos.length > 0);
  const hello = state.hellos.at(-1);
  expect(hello.doc.name).toBe("季度报告.docx");
  expect(hello.doc.path).toContain("季度报告.docx");
  expect(hello.doc.paragraphs).toBe(5);
  expect(hello.doc.selection).toBeNull(); // 没有选区时是 null
  expect(hello.panel.version).toBe("1.0.0");
  expect(hello.panel.ua).toContain("Chrome");

  expect(errors).toEqual([]);
});

test("ribbon：加载时存 ribbonUI，点按钮开关任务窗格（契约 §1）", async ({ page, errors }) => {
  await openPanel(page);

  const ribbon = await page.evaluate(() => {
    const loaded = window.ribbon.OnAddinLoad({ id: "ribbon-ui" });
    const stored = window.Application.ribbonUI;
    window.ribbon.OnAction({ Id: "btnAdeliePanel" });
    const panes = [...window.__fakeWps.state.taskPanes.values()];
    const opened = {
      key: window.Application.PluginStorage.getItem("adelie_taskpane_id"),
      pane: { ...panes[0] },
    };
    window.ribbon.OnAction({ Id: "btnAdeliePanel" });
    return {
      loaded,
      stored: stored?.id,
      image: window.ribbon.GetImage(),
      opened,
      toggled: panes[0].Visible,
    };
  });

  expect(ribbon.loaded).toBe(true);
  expect(ribbon.stored).toBe("ribbon-ui");
  expect(ribbon.opened.key).toBe("fake-pane-1");
  expect(ribbon.opened.pane.Url).toBe(`${BASE_URL}/addin/index.html`);
  expect(ribbon.opened.pane.Caption).toBe("Adelie");
  expect(ribbon.opened.pane.Visible).toBe(true);
  expect(ribbon.opened.pane.DockPosition).toBe(2); // msoCTPDockPositionRight
  expect(ribbon.opened.pane.Width).toBeGreaterThan(0);
  expect(ribbon.toggled).toBe(false); // 再点一次是收起
  expect(ribbon.image).toBe("images/icon.svg");

  expect(errors).toEqual([]);
});

test("发送问题会把文字与上下文交给桥（契约 §2.4）", async ({ page, errors }) => {
  await openPanel(page);

  await page.fill("#input", "把第 2 段的标题改简洁");
  await page.press("#input", "Enter"); // Enter 发送（IME 安全的那条路径）

  const state = await bridge.waitFor((snapshot) => snapshot.asks.length > 0);
  expect(state.asks.at(-1)).toEqual({
    text: "把第 2 段的标题改简洁",
    context: "selection",
    tail: 120,
  });
  await expect(page.locator(".msg.user")).toHaveText("把第 2 段的标题改简洁");
  await expect(page.locator("#input")).toHaveValue("");

  // 切到「整篇文档」再发一条，带上的上下文跟着变
  await page.click('button[data-context="document"]');
  await expect(page.locator('button[data-context="document"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.fill("#input", "通读全文");
  await page.click("#send");
  await expect.poll(async () => bridge.state.asks.length).toBe(2);
  expect(bridge.state.asks.at(-1).context).toBe("document");

  expect(errors).toEqual([]);
});

test("流式 delta 收尾成回复气泡，并给出「写进文档」（契约 §2.4）", async ({ page, errors }) => {
  await openPanel(page);

  await bridge.pushEvent("status", { running: true });
  await expect(page.locator("#send")).toBeDisabled();

  await bridge.pushEvent("delta", { text: "好的，" });
  await bridge.pushEvent("delta", { text: "我把第 2 段改短。" });
  await expect(page.locator(".msg.assistant .turn-text")).toHaveText("好的，我把第 2 段改短。");

  await bridge.pushEvent("done", { text: "好的，我把第 2 段改短。" });
  await expect(page.locator("#send")).toBeEnabled();
  await expect(page.getByRole("button", { name: "写进文档" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("思考过程、工具行、错误行都按契约显示（契约 §2.4）", async ({ page, errors }) => {
  await openPanel(page);

  await bridge.pushEvent("thinking", { text: "先看看第 2 段有多长。" });
  await expect(page.locator(".thinking-body")).toHaveText("先看看第 2 段有多长。");

  await bridge.pushEvent("tool", {
    id: "t1",
    name: "exec_command",
    summary: "读取文档",
    state: "running",
  });
  await expect(page.locator(".tool-line .tool-name")).toContainText("exec_command");
  await expect(page.locator(".tool-line")).toHaveAttribute("data-state", "running");
  await bridge.pushEvent("tool", {
    id: "t1",
    name: "exec_command",
    summary: "改完第 2 段",
    state: "done",
  });
  await expect(page.locator(".tool-line")).toHaveAttribute("data-state", "done");
  await expect(page.locator(".tool-line .tool-summary")).toHaveText("改完第 2 段");

  await bridge.pushEvent("error", { message: "模型连接失败" });
  await expect(page.locator(".error-line")).toHaveText("模型连接失败");

  expect(errors).toEqual([]);
});

test("审批卡片：允许会回桥，Esc 等于拒绝（契约 §2.4）", async ({ page, errors }) => {
  await openPanel(page);

  await bridge.pushEvent("approval", {
    toolCallId: "call-1",
    name: "exec_command",
    summary: "要改第 3 段",
  });
  await expect(page.locator(".approval")).toContainText("exec_command 需要你的允许");
  await page.getByRole("button", { name: "允许" }).click();
  await expect.poll(async () => bridge.state.approvals.length).toBe(1);
  expect(bridge.state.approvals.at(-1)).toEqual({ toolCallId: "call-1", decision: "allow" });
  await expect(page.locator(".approval")).toContainText("已允许 exec_command");

  await bridge.pushEvent("approval", {
    toolCallId: "call-2",
    name: "write_file",
    summary: "要写文件",
  });
  await page.keyboard.press("Escape");
  await expect.poll(async () => bridge.state.approvals.length).toBe(2);
  expect(bridge.state.approvals.at(-1)).toEqual({ toolCallId: "call-2", decision: "deny" });

  expect(errors).toEqual([]);
});

test("桥推 doc.replace：假文档真的改了，面板回了 result（契约 §2.2、§3、§5）", async ({
  page,
  errors,
}) => {
  await openPanel(page);

  const before = await page.evaluate(() => window.__fakeWps.paragraphTexts());
  expect(before[2]).toBe("本季度共交付三个版本，用户反馈集中在加载速度上。");

  const response = await bridge.runCommand({
    op: "doc.replace",
    args: {
      index: 3,
      text: "本季度交付三个版本，反馈集中在加载速度。",
      expect: "本季度共交付三个版本，用户反馈集中在加载速度上。",
    },
  });

  expect(response.ok).toBe(true);
  expect(response.result).toEqual({ index: 3, text: "本季度交付三个版本，反馈集中在加载速度。" });

  const after = await page.evaluate(() => window.__fakeWps.paragraphTexts());
  expect(after[2]).toBe("本季度交付三个版本，反馈集中在加载速度。");
  expect(after.length).toBe(5);
  // 段落样式没被动过（替换只动正文）
  const styles = await page.evaluate(() =>
    window.__fakeWps.activeDocument().paragraphs.map((item) => item.style),
  );
  expect(styles[2]).toBe("正文");

  expect(errors).toEqual([]);
});

test("expect 不匹配必须报「段落已变，先重新读取」，而且一个字都不改（契约 §3）", async ({
  page,
  errors,
}) => {
  await openPanel(page);

  const before = await page.evaluate(() => window.__fakeWps.paragraphTexts());
  const response = await bridge.runCommand({
    op: "doc.replace",
    args: { index: 3, text: "不该写进去", expect: "其实不是这一段" },
  });

  expect(response.ok).toBe(false);
  expect(response.error).toBe("段落已变，先重新读取");

  const after = await page.evaluate(() => window.__fakeWps.paragraphTexts());
  expect(after).toEqual(before);

  expect(errors).toEqual([]);
});

test("同一个 id 只回答一次（契约 §2.2）", async ({ page, errors }) => {
  await openPanel(page);
  await bridge.waitForCommandClient();

  bridge.pushCommand({ id: "dup-1", op: "doc.read", args: { from: 1, to: 1 } });
  bridge.pushCommand({ id: "dup-1", op: "doc.read", args: { from: 1, to: 1 } });

  await expect
    .poll(async () => bridge.state.results.filter((item) => item.id === "dup-1").length)
    .toBe(1);
  await page.waitForTimeout(300);
  expect(bridge.state.results.filter((item) => item.id === "dup-1").length).toBe(1);
  const answers = bridge.state.results.filter((item) => item.id === "dup-1");
  expect(answers[0].ok).toBe(true);
  expect(answers[0].result.paragraphs[0].text).toBe("季度报告草稿");

  expect(errors).toEqual([]);
});

test("其余 op：read 截断、search、insertAfter、delete、break、reveal、create（契约 §3）", async ({
  page,
  errors,
}) => {
  await openPanel(page);

  // doc.read：1 起闭区间，带样式
  const read = await bridge.runCommand({ op: "doc.read", args: { from: 2, to: 3 } });
  expect(read.ok).toBe(true);
  expect(read.result.paragraphs).toEqual([
    { index: 2, text: "一、本季度概况", style: "标题 2" },
    { index: 3, text: "本季度共交付三个版本，用户反馈集中在加载速度上。", style: "正文" },
  ]);
  expect(read.result.truncated).toBe(false);

  // doc.read：超过 400 段要截断
  await page.evaluate(() => {
    const many = [];
    for (let i = 1; i <= 450; i += 1) many.push({ text: `第 ${i} 段`, style: "正文" });
    window.__fakeWps.setParagraphs(many);
  });
  const capped = await bridge.runCommand({ op: "doc.read", args: {} });
  expect(capped.result.paragraphs.length).toBe(400);
  expect(capped.result.paragraphs.at(-1).index).toBe(400);
  expect(capped.result.truncated).toBe(true);

  // doc.search：大小写不敏感、跳过空段
  await page.evaluate(() =>
    window.__fakeWps.setParagraphs([
      { text: "Alpha 计划", style: "正文" },
      { text: "", style: "正文" },
      { text: "alpha beta", style: "正文" },
    ]),
  );
  const empty = await bridge.runCommand({ op: "doc.search", args: { query: "   " } });
  expect(empty.ok).toBe(false);
  expect(empty.error).toContain("搜索词不能为空");
  const search = await bridge.runCommand({ op: "doc.search", args: { query: "ALPHA" } });
  expect(search.result.matches).toEqual([
    { index: 1, text: "Alpha 计划" },
    { index: 3, text: "alpha beta" },
  ]);

  // doc.insertAfter：新段落沿用前一段样式，返回新段号
  await page.evaluate(() =>
    window.__fakeWps.setParagraphs([
      { text: "标题", style: "标题 1" },
      { text: "正文一", style: "正文" },
    ]),
  );
  const inserted = await bridge.runCommand({
    op: "doc.insertAfter",
    args: { index: 1, text: "新的一段" },
  });
  expect(inserted.result).toEqual({ index: 2, text: "新的一段" });
  const afterInsert = await page.evaluate(() => window.__fakeWps.activeDocument().paragraphs);
  expect(afterInsert.map((item) => item.text)).toEqual(["标题", "新的一段", "正文一"]);
  expect(afterInsert[1].style).toBe("标题 1");

  // doc.break：分页符插在该段之后（段落标记之前）
  const broken = await bridge.runCommand({ op: "doc.break", args: { index: 1, kind: "page" } });
  expect(broken.ok).toBe(true);
  expect(broken.result).toEqual({ index: 1 });
  const pageBreak = await page.evaluate(() => window.__fakeWps.paragraphTexts()[0]);
  expect(pageBreak).toBe("标题\f");
  const badKind = await bridge.runCommand({
    op: "doc.break",
    args: { index: 1, kind: "pagebreak" },
  });
  expect(badKind.ok).toBe(false);
  expect(badKind.error).toContain("kind 只能是");

  // doc.reveal：把选区挪到这一段上
  const revealed = await bridge.runCommand({ op: "doc.reveal", args: { index: 3 } });
  expect(revealed.result).toEqual({ index: 3 });
  const selection = await page.evaluate(() => {
    const doc = window.__fakeWps.state.documents[window.__fakeWps.state.active];
    return {
      selection: { ...doc.selection },
      expected: {
        start: doc.paraStart(3),
        end: doc.paraStart(3) + doc.paragraphs[2].text.length + 1,
      },
    };
  });
  expect(selection.selection).toEqual(selection.expected);

  // doc.delete：删掉中间一段
  const deleted = await bridge.runCommand({
    op: "doc.delete",
    args: { index: 2, expect: "新的一段" },
  });
  expect(deleted.result).toEqual({ index: 2 });
  const afterDelete = await page.evaluate(() => window.__fakeWps.paragraphTexts());
  expect(afterDelete).toEqual(["标题\f", "正文一"]);

  // doc.delete：最后一段要拦住并提示 doc.create
  await page.evaluate(() =>
    window.__fakeWps.setParagraphs([{ text: "只剩这一段", style: "正文" }]),
  );
  const last = await bridge.runCommand({ op: "doc.delete", args: { index: 1 } });
  expect(last.ok).toBe(false);
  expect(last.error).toContain("doc.create");

  // doc.create：新建空白文档并切过去
  const created = await bridge.runCommand({ op: "doc.create", args: {} });
  expect(created.ok).toBe(true);
  const newDoc = await page.evaluate(() => window.__fakeWps.activeDocument());
  expect(newDoc.paragraphs.length).toBe(1);
  expect(newDoc.paragraphs[0].text).toBe("");
  const summary = await bridge.runCommand({ op: "doc.summary", args: {} });
  expect(summary.result.paragraphs).toBe(1);
  expect(summary.result.name).toBe(created.result.name);

  // 不认识的 op 也要回答（失败也算回答）
  const unknown = await bridge.runCommand({ op: "doc.nope", args: {} });
  expect(unknown.ok).toBe(false);
  expect(unknown.error).toContain("不认识的文档操作");

  expect(errors).toEqual([]);
});

test("选区变了以后防抖上报，带上 1 起的段号（契约 §2.1）", async ({ page, errors }) => {
  await openPanel(page);
  await bridge.waitFor((snapshot) => snapshot.hellos.length > 0);

  await page.evaluate(() => window.__fakeWps.selectParagraphs(2, 3));

  await expect
    .poll(async () => bridge.state.hellos.filter((hello) => hello.doc?.selection).length, {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);

  const hello = bridge.state.hellos.filter((item) => item.doc?.selection).at(-1);
  expect(hello.doc.selection.from).toBe(2);
  expect(hello.doc.selection.to).toBe(3);
  expect(hello.doc.selection.text).toContain("本季度共交付三个版本");
  await expect(page.locator("#doc-line")).toContainText("选中第 2–3 段");

  expect(errors).toEqual([]);
});

test("「写进文档」把回复按段落插进文档（契约 §2.4）", async ({ page, errors }) => {
  await openPanel(page);

  await bridge.pushEvent("done", { text: "第一段回复\n第二段回复" });
  await page.getByRole("button", { name: "写进文档" }).click();

  await expect
    .poll(async () => (await page.evaluate(() => window.__fakeWps.paragraphTexts())).length)
    .toBe(7);
  const texts = await page.evaluate(() => window.__fakeWps.paragraphTexts());
  expect(texts.slice(-2)).toEqual(["第一段回复", "第二段回复"]);
  await expect(page.locator(".toast")).toContainText("已写入 2 段");

  expect(errors).toEqual([]);
});

test("打开面板会回放这篇文档聊过的历史（契约 §2.4）", async ({ page, errors }) => {
  await bridge.reset();
  await bridge.set({
    history: [
      { role: "user", text: "之前的问题" },
      { role: "assistant", text: "之前的回答" },
    ],
  });
  await openPanel(page);

  await expect(page.locator(".msg.user")).toHaveText("之前的问题");
  await expect(page.locator(".msg.assistant .turn-text")).toHaveText("之前的回答");

  expect(errors).toEqual([]);
});

test("深浅色切换会记住（web-design）", async ({ page, errors }) => {
  await openPanel(page);

  const before = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  await page.click("#theme");
  const after = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  expect(after).toBe(!before);

  await page.reload();
  await expect(page.locator("#send")).toBeVisible();
  const reloaded = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  expect(reloaded).toBe(after);

  expect(errors).toEqual([]);
});
