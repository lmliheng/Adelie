import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @playwright/test 是仓库 packages/web 的依赖（插件本身不带依赖），所以从那里解析：
 * 从本文件往上找到 <仓库>/packages/web/package.json，用它的解析器 require。找不到就退回
 * 普通解析（万一以后装在别处）。
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

const { defineConfig } = loadPlaywright();

/**
 * WPS 面板的浏览器冒烟测试（契约 §5）。
 *
 * baseURL 走环境变量：默认打到假桥（fake-bridge.mjs）在 127.0.0.1:3891 起的地址；
 * 主 agent 拿真桥（kit/serve.mjs）跑对照测试时，用 PANEL_BASE_URL 指过去即可。
 * 跑法（仓库的 @playwright/test 装在 packages/web 下）：
 *   cd packages/web && npx playwright test -c ../../plugins/wps-office/test/playwright.config.mjs
 */
export default defineConfig({
  testDir: ".",
  // 这个目录里还躺着桥和安装脚本的 node:test 文件；Playwright 会 import 一切 test 文件，
  // 那不是我们要跑的东西，所以只认面板这份 spec。
  testMatch: /panel\.spec\.mjs$/,
  // 失败截图之类的产物不放仓库里（默认会落在仓库根目录，污染 git status），丢进系统临时目录。
  outputDir: join(tmpdir(), "adelie-wps-panel-playwright"),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PANEL_BASE_URL || "http://127.0.0.1:3891",
    headless: true,
    locale: "zh-CN",
  },
});
