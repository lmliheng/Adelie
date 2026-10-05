#!/usr/bin/env node
// 用 cas_login.py 产出的 mail_session.json 打开网页邮箱，生成一条「客户端专用密码」。
// 专用密码只在生成时显示一次，生成后请立刻存进密钥库（不要写进代码/仓库）。
//
// 用法：
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright-core \
//   CHROME_PATH=/path/to/chrome \
//   node create_apppw.mjs mail_session.json <密码名称> [--out secret.txt]
//
// 两个坑（本脚本已处理）：
//   1. 弹窗里的「生成」按钮初始带 disabled，输入框必须用**真实键盘事件**输入才会解除，
//      Playwright 的 fill() 不够，要用 click + keyboard.type。
//   2. 生成结果同时来自 user:addAppPwd 的响应体，正则取 password/pwd 字段最稳。

import fs from "node:fs";
import { createRequire } from "node:module";

const PW_MODULE = process.env.PLAYWRIGHT_MODULE || "playwright-core";
const CHROME = process.env.CHROME_PATH || "";
// PLAYWRIGHT_MODULE 可以是包名（playwright-core），也可以是本机安装目录的绝对路径
const require = createRequire(import.meta.url);
let pw;
try {
  pw = require(PW_MODULE);
} catch (e) {
  pw = require(PW_MODULE.replace(/\/+$/, "") + "/index.js");
}
const chromium = pw.chromium;
if (!chromium) {
  console.error(
    `没有从 ${PW_MODULE} 拿到 chromium：检查 PLAYWRIGHT_MODULE 是否指向 playwright / playwright-core`,
  );
  process.exit(2);
}

const [, , sessionFile, name, ...rest] = process.argv;
if (!sessionFile || !name) {
  console.error("用法: node create_apppw.mjs <mail_session.json> <密码名称> [--out secret.txt]");
  process.exit(2);
}
const opts = {};
for (let i = 0; i < rest.length; i += 2) opts[rest[i].replace(/^--/, "")] = rest[i + 1];

(async () => {
  const sess = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
  const browser = await chromium.launch({
    executablePath: CHROME || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    viewport: { width: 1280, height: 800 },
  });
  await ctx.addCookies(
    Object.entries(sess.cookies || {}).map(([k, v]) => ({
      name: k,
      value: v,
      domain: "mail.csu.edu.cn",
      path: "/",
    })),
  );

  const page = await ctx.newPage();
  const bodies = [];
  page.on("response", async (r) => {
    if (!r.url().includes("/coremail/s")) return;
    const func = decodeURIComponent((r.url().match(/func=([^&]+)/) || [])[1] || "");
    if (!/AppPwd/i.test(func)) return;
    try {
      bodies.push({ func, text: await r.text() });
    } catch (e) {
      /* ignore */
    }
  });

  await page.goto(`https://mail.csu.edu.cn/coremail/XT5/index.jsp?sid=${sess.sid}#setting`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(6000);
  await page.getByText("个人信息", { exact: true }).first().click({ timeout: 10000 });
  await page.waitForTimeout(2000);
  await page.getByText("邮箱密码", { exact: true }).first().click({ timeout: 10000 });
  await page.waitForTimeout(4000);

  await page.locator("li.j-add-item").first().click({ timeout: 10000 });
  await page.waitForTimeout(2500);
  const input = page.locator("input.j-input-name").first();
  await input.click();
  await page.keyboard.type(name, { delay: 60 }); // 必须真实键入，否则确认键仍是 disabled
  await page.waitForTimeout(500);
  await page
    .locator(".u-dialog-btns button[data-role=confirm]")
    .first()
    .click({ force: true, timeout: 10000 });
  await page.waitForTimeout(7000);

  let secret = null;
  for (const b of bodies) {
    const m = b.text.match(/"(?:password|pwd|appPwd|altpwd|secret)"\s*:\s*"([^"]{6,64})"/i);
    if (m) {
      secret = m[1];
      break;
    }
  }
  if (!secret) {
    const txt = (await page.innerText("body")).replace(/\s+/g, " ");
    const m = txt.match(/专用密码[^A-Za-z0-9]{0,20}([A-Za-z0-9]{8,32})/);
    if (m) secret = m[1];
  }

  if (!secret) {
    console.error(
      "没拿到专用密码：确认已在网页邮箱里点开了「客户端专用密码」区块，且密码名称未被占用。",
    );
    await page.screenshot({ path: "apppw-failed.png", fullPage: true });
    await browser.close();
    process.exit(1);
  }

  if (opts.out) {
    fs.writeFileSync(opts.out, secret, { mode: 0o600 });
    console.log(`专用密码已写入 ${opts.out}（len=${secret.length}，请立刻存进密钥库后删除该文件）`);
  } else {
    console.log("专用密码（只显示这一次）:", secret);
  }
  console.log("已创建的专用密码名称:", name, "| 后端接口:", bodies.map((b) => b.func).join(", "));
  await browser.close();
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
