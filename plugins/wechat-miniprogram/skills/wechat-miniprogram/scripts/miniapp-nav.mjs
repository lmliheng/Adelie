// 在小程序后台打开指定页面并 dump 文本/按钮；用法: node miniapp-nav.mjs <path> [label] [outDir]
import { launchStealth } from "./stealth.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const p = process.argv[2] || "/wxamp/index/index";
const label = process.argv[3] || "page";
const outDir = process.argv[4] || here;

const ctx = await launchStealth(path.join(here, "profile"), { headless: false });
const page = ctx.pages()[0] || (await ctx.newPage());
await page
  .goto("https://mp.weixin.qq.com/", { waitUntil: "commit", timeout: 60000 })
  .catch((e) => console.log("home goto warn", e.message.split("\n")[0]));
await page.waitForTimeout(14000);
const token = (page.url().match(/token=(\d+)/) || [])[1];
console.log("home", page.url(), "token", token);
if (!token) {
  console.log("NOT LOGGED IN");
  await ctx.close().catch(() => {});
  process.exit(2);
}

await page
  .goto(`https://mp.weixin.qq.com${p}?token=${token}&lang=zh_CN`, {
    waitUntil: "commit",
    timeout: 60000,
  })
  .catch((e) => console.log("goto warn", e.message.split("\n")[0]));
await page.waitForTimeout(15000);
const info = await page.evaluate(() => {
  const vis = (e) => !!(e.offsetWidth || e.offsetHeight);
  const btns = Array.from(document.querySelectorAll('button,a,[role="button"]'))
    .filter(vis)
    .map((e) => ({
      t: (e.innerText || "").replace(/\s+/g, " ").trim().slice(0, 24),
      cls: (e.className || "").toString().slice(0, 70),
      href: e.getAttribute && e.getAttribute("href"),
    }))
    .filter((b) => b.t && b.t.length < 24);
  return {
    url: location.href,
    title: document.title,
    text: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 2500),
    btns: btns.slice(0, 60),
  };
});
await page.screenshot({ path: path.join(outDir, `miniapp-${label}.png`) }).catch(() => {});
fs.writeFileSync(path.join(outDir, `miniapp-${label}.json`), JSON.stringify(info, null, 2));
console.log("URL", info.url);
console.log("TEXT", info.text);
console.log("BTNS", JSON.stringify(info.btns));
await ctx.close().catch(() => {});
process.exit(0);
