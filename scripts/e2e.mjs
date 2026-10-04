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

/** playwright 的出处：不硬编码某个检出，给一个可覆盖的默认值 */
function resolvePlaywright() {
  const explicit = process.env.ADELIE_PLAYWRIGHT;
  const candidates = [
    explicit,
    path.join(REPO, "packages", "web", "package.json"),
    "/root/penguin-harness/packages/landing/package.json",
  ].filter((value) => typeof value === "string");
  for (const candidate of candidates) {
    try {
      return createRequire(candidate)("@playwright/test");
    } catch {
      /* 试下一个 */
    }
  }
  throw new Error(
    "找不到 @playwright/test。装一个（pnpm add -D @playwright/test -w）或把 ADELIE_PLAYWRIGHT " +
      "指到能解析它的 package.json。",
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

const { chromium } = resolvePlaywright();
const CHROME = resolveChrome();

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

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(origin, { waitUntil: "domcontentloaded" });
  await mobilePage.waitForSelector("textarea", { timeout: 15000 });
  await delay(500);
  await mobilePage.screenshot({ path: path.join(OUT, "04-mobile.png") });

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
