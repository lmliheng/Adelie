#!/usr/bin/env node
/**
 * 端到端冒烟：真服务端 + 真引擎 + mock 模型端点 + 真浏览器。
 *
 * 它回答的是「这套东西到底能不能用」，而不是「能不能编译」：起一个假的 OpenAI 兼容端点
 * （scripts/mock-provider.mjs），让 Adelie 指向它，用 Playwright 打开 Web，发一条任务、
 * 批一次审批，最后检查工作区里**真的**落了文件、浏览器 console 没有 error。
 *
 * 用法：
 *   node scripts/e2e.mjs
 *
 * 需要：playwright 的 chromium。本机从别处借用（见下面两个环境变量），CI 里先
 *   npx playwright install chromium  然后把 ADELIE_PLAYWRIGHT 指到装了 @playwright/test 的目录。
 *
 *   ADELIE_PLAYWRIGHT  能解析 @playwright/test 的 package.json 路径
 *   CHROME_PATH        chromium 可执行文件；不设则在 ~/.cache/ms-playwright 里找最新的
 *
 * 截图落在 --out（默认 /tmp/adelie-e2e）。
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const outArg = process.argv.indexOf("--out");
const OUT = outArg === -1 ? path.join(tmpdir(), "adelie-e2e") : process.argv[outArg + 1];
mkdirSync(OUT, { recursive: true });

/**
 * playwright 的出处：不硬编码某个检出，给一个可覆盖的默认值。
 *
 * `@playwright/test` 与 `playwright-core` 都认 —— 这里只用 `chromium.launch()`，两者
 * 在这一处的 API 完全一样，而 `playwright-core` 常常是机器上唯一现成的那个（它不带
 * 浏览器，浏览器由 CHROME_PATH / ms-playwright 缓存提供）。
 */
function resolvePlaywright() {
  const explicit = process.env.ADELIE_PLAYWRIGHT;
  const candidates = [
    explicit,
    path.join(REPO, "packages", "web", "package.json"),
    "/root/penguin-harness/packages/landing/package.json",
  ].filter((value) => typeof value === "string");
  const modules = ["@playwright/test", "playwright-core"];
  for (const candidate of candidates) {
    for (const name of modules) {
      try {
        return { name, lib: createRequire(candidate)(name) };
      } catch {
        /* 试下一个 */
      }
    }
  }
  throw new Error(
    "找不到 @playwright/test 或 playwright-core。装一个（pnpm add -D @playwright/test -w）" +
      "或把 ADELIE_PLAYWRIGHT 指到能解析它的 package.json。",
  );
}

/** 最近的 chromium 构建；比 playwright 自己钉的那版新也没关系（本机就是这种情况） */
function resolveChrome() {
  if (process.env.CHROME_PATH !== undefined) return process.env.CHROME_PATH;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(homedir(), ".cache", "ms-playwright");
  const revisions = readdirSync(cache)
    .filter((name) => name.startsWith("chromium-"))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const revision of revisions) {
    const candidate = path.join(cache, revision, "chrome-linux64", "chrome");
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

const playwright = resolvePlaywright();
const { chromium } = playwright.lib;
const CHROME = resolveChrome();
console.log(`[e2e] playwright 来自 ${playwright.name}${CHROME === undefined ? '' : `，chromium ${CHROME}`}`);

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(label, probe, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if (await probe()) return;
    } catch {
      /* 还没好 */
    }
    if (Date.now() > deadline) throw new Error(`超时：${label}`);
    await delay(200);
  }
}

const children = [];
const logs = [];
function spawnLogged(label, args, env) {
  const child = spawn(process.execPath, args, {
    cwd: REPO,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => logs.push(`[${label}] ${chunk}`));
  child.stderr.on("data", (chunk) => logs.push(`[${label}!] ${chunk}`));
  children.push(child);
  return child;
}

const mockPort = await freePort();
const serverPort = await freePort();
const workDir = mkdtempSync(path.join(tmpdir(), "adelie-e2e-ws-"));
const sessionsDir = mkdtempSync(path.join(tmpdir(), "adelie-e2e-sessions-"));

console.log(`工作区      ${workDir}`);
console.log(`mock 端点   :${mockPort}   adelie-server :${serverPort}`);
console.log(`截图输出    ${OUT}\n`);

spawnLogged("mock", ["scripts/mock-provider.mjs", "--port", String(mockPort)], {});
spawnLogged(
  "server",
  ["packages/server/dist/main.js"],
  {
    PORT: String(serverPort),
    ADELIE_HOST: "127.0.0.1",
    ADELIE_WEB_DIST: path.join(REPO, "packages/web/dist"),
    ADELIE_SESSIONS_ROOT: sessionsDir,
    OPENAI_API_KEY: "mock-key",
  },
);

const origin = `http://127.0.0.1:${serverPort}`;
const failures = [];
let browser;

try {
  await waitFor("服务端健康检查", async () => (await fetch(`${origin}/api/health`)).ok);
  console.log("health:", await (await fetch(`${origin}/api/health`)).text());

  const configured = await fetch(`${origin}/api/config`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspace: workDir,
      provider: "openai",
      model: "mock",
      baseUrl: `http://127.0.0.1:${mockPort}/v1/chat/completions`,
    }),
  });
  console.log("PATCH /api/config:", configured.status);
  if (!configured.ok) throw new Error(`配置失败：${await configured.text()}`);

  browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("textarea", { timeout: 15000 });
  await page.screenshot({ path: path.join(OUT, "01-empty.png") });

  await page.getByRole("button", { name: /新建会话/ }).click();
  await delay(400);
  await page.locator("textarea").first().fill("在当前工作区创建一个说明文件");
  await page.locator('[data-testid="send"]').click();

  // 审批卡：mock 剧本里的 create_file 需要人工批准 —— 顺带把审批链路也验了
  await page.waitForSelector('[data-testid="approval"]', { timeout: 30000 });
  await page.screenshot({ path: path.join(OUT, "02-approval.png") });
  await page.getByRole("button", { name: /^批准$/ }).click();

  await page.waitForFunction(() => document.body.innerText.includes("已创建 ADELIE_E2E.md"), undefined, {
    timeout: 45000,
  });
  await delay(1000);
  await page.screenshot({ path: path.join(OUT, "03-done.png"), fullPage: true });
  console.log("\n--- 会话区 ---\n" + (await page.locator('[data-testid="messages"]').innerText()).slice(0, 1200));

  // ── 左栏导航：URL 真的变、前进后退可用、深链刷新不白屏 ──
  // 这三件事只有真浏览器能验：pushState 之后 React 有没有跟着换页、刷新时服务端有没有把
  // `/agents` 落回 index.html。它们是「页面能分享出去」的全部前提。
  const NAV = [
    ["projects", "项目"],
    ["agents", "智能体"],
    ["models", "模型"],
    ["plugins", "插件"],
    ["usage", "成本中心"],
  ];
  const titleIs = (text) => document.querySelector("#page-title")?.textContent === text;
  for (const [id, label] of NAV) {
    await page.locator(`[data-testid="nav-${id}"]`).click();
    await page.waitForFunction(titleIs, label, { timeout: 5000 });
    const { pathname } = new URL(page.url());
    if (pathname !== `/${id}`) failures.push(`点「${label}」后 URL 是 ${pathname}，期望 /${id}`);
  }
  await page.screenshot({ path: path.join(OUT, "05-nav-usage.png") });

  await page.goBack();
  await page.waitForFunction(titleIs, "插件", { timeout: 5000 });

  await page.goto(`${origin}/agents`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#page-title", { timeout: 15000 });
  const deepTitle = await page.locator("#page-title").innerText();
  if (deepTitle !== "智能体") failures.push(`深链 /agents 显示的是「${deepTitle}」，期望「智能体」`);

  await page.getByRole("button", { name: "回到对话" }).click();
  await page.waitForSelector("textarea", { timeout: 15000 });
  if (new URL(page.url()).pathname !== "/chat") failures.push("「回到对话」没把 URL 换回 /chat");

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(origin, { waitUntil: "domcontentloaded" });
  await mobilePage.waitForSelector("textarea", { timeout: 15000 });
  await delay(500);
  await mobilePage.screenshot({ path: path.join(OUT, "04-mobile.png") });

  // 手机上没有常驻侧栏，导航在抽屉里：打开抽屉 → 点一项 → 抽屉自己收起来
  await mobilePage.locator('[data-testid="sidebar-toggle"]').click();
  await delay(300);
  await mobilePage.screenshot({ path: path.join(OUT, "06-mobile-rail.png") });
  const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) failures.push(`手机上横向溢出 ${overflow}px（抽屉打开时）`);
  await mobilePage.locator('[data-testid="nav-agents"]').click();
  await mobilePage.waitForSelector("#page-title", { timeout: 5000 });
  // 抽屉是 `transform: translateX(-100%)` 藏起来的，`isVisible()` 仍为 true，
  // 所以看类名：点完导航它必须自己收起来（不然手机上换页后还挡着内容）
  const drawerOpen = await mobilePage
    .locator('[data-testid="sidebar"]')
    .evaluate((el) => el.classList.contains("is-open"));
  if (drawerOpen) failures.push("点导航后抽屉没关上");

  const created = path.join(workDir, "ADELIE_E2E.md");
  console.log(`\n工作区文件 ${created}: ${existsSync(created) ? "存在 ✓" : "不存在 ✗"}`);
  if (!existsSync(created)) failures.push("工作区里没有生成 ADELIE_E2E.md");
  if (consoleErrors.length > 0) failures.push(`浏览器 console 有 ${consoleErrors.length} 条 error`);
  console.log("console errors:", consoleErrors.length === 0 ? "无" : consoleErrors);

  const sessions = await (await fetch(`${origin}/api/sessions`)).json();
  const sessionId = sessions.sessions?.[0]?.id;
  const detail = await (await fetch(`${origin}/api/sessions/${sessionId}`)).json();
  console.log(`回放：runs=${detail.runs?.length} events=${detail.events?.length}`);
  console.log("stopReason:", JSON.stringify(detail.runs?.[0]?.stopReason ?? null));
  if (detail.runs?.[0]?.stopReason?.type !== "task_completed") {
    failures.push("停下来的原因不是 task_completed");
  }
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
  console.error("\nE2E 失败:", error);
  console.error(logs.join("").slice(-2000));
} finally {
  if (browser) await browser.close();
  try {
    await fetch(`${origin}/api/shutdown`, { method: "POST" });
  } catch {
    /* 已经关了 */
  }
  await delay(1200);
  for (const child of children) if (child.exitCode === null) child.kill();
}

console.log(failures.length === 0 ? "\nE2E 全部通过 ✓" : `\nE2E 有问题：\n- ${failures.join("\n- ")}`);
process.exit(failures.length === 0 ? 0 : 1);
