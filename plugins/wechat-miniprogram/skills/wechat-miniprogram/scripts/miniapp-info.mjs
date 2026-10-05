// 小程序后台信息采集：首页 / 基本设置(AppID) / 开发设置(上传密钥入口)
// 用法: node miniapp-info.mjs <outDir> <shotPrefix>
import { launchStealth } from "./stealth.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] || here;
const shotPrefix = process.argv[3] || path.join(outDir, "miniapp");

const ctx = await launchStealth(path.join(here, "profile"), { headless: false });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto("https://mp.weixin.qq.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(7000);
console.log("home", page.url());
const token = (page.url().match(/token=(\d+)/) || [])[1];
console.log("token", token);

const grab = async (label, url) => {
  await page
    .goto(url, { waitUntil: "domcontentloaded", timeout: 60000 })
    .catch((e) => console.log(label, "goto err", e.message));
  await page.waitForTimeout(7000);
  const info = await page.evaluate(() => {
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight);
    const all = document.body.innerText || "";
    const appids = [...new Set(all.match(/wx[0-9a-f]{16}/g) || [])];
    const links = Array.from(document.querySelectorAll("a[href]"))
      .filter(vis)
      .map((a) => ({ t: (a.innerText || "").trim().slice(0, 20), href: a.getAttribute("href") }))
      .filter((l) => l.href && l.href !== "javascript:;")
      .slice(0, 100);
    const menu = Array.from(
      document.querySelectorAll('[class*="menu__item"], [class*="menu-item"], [class*="nav"] a'),
    )
      .filter(vis)
      .map((e) => (e.innerText || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 60);
    return {
      url: location.href,
      title: document.title,
      appids,
      links,
      menu,
      text: all.replace(/\s+/g, " ").slice(0, 2000),
    };
  });
  await page.screenshot({ path: `${shotPrefix}-${label}.png` }).catch(() => {});
  fs.writeFileSync(path.join(outDir, `miniapp-${label}.json`), JSON.stringify(info, null, 2));
  console.log(`--- ${label} ${info.url}`);
  console.log("  title", info.title, "appids", JSON.stringify(info.appids));
  console.log("  menu", JSON.stringify(info.menu.slice(0, 30)));
  console.log("  text", info.text.slice(0, 700));
  return info;
};

await grab("home", "https://mp.weixin.qq.com/wxamp/index/index?lang=zh_CN&token=" + token);
await grab("basic", `https://mp.weixin.qq.com/wxamp/basicprofile/index?lang=zh_CN&token=${token}`);
await grab(
  "dev",
  `https://mp.weixin.qq.com/wxamp/devprofile/get_profile?lang=zh_CN&token=${token}`,
);

await ctx.close().catch(() => {});
process.exit(0);
