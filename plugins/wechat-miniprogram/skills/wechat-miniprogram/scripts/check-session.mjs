// 复用已持久化的 profile 验证登录态是否还在，并回报账号信息
import { launchStealth } from "./stealth.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const shot = process.argv[2] || path.join(here, "home.png");
const infoOut = process.argv[3] || path.join(here, "session-check.json");

const ctx = await launchStealth(path.join(here, "profile"), { headless: false });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto("https://mp.weixin.qq.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(7000);

const info = await page.evaluate(() => {
  const t = (s) => {
    const e = document.querySelector(s);
    return e ? (e.innerText || "").trim().slice(0, 60) : null;
  };
  return {
    title: document.title,
    nickname:
      t(".weui-desktop-account__nickname") || t(".account__nickname") || t('[class*="nickname"]'),
    menus: Array.from(document.querySelectorAll(".weui-desktop-menu__link, .weui-desktop-menu a"))
      .map((e) => (e.innerText || "").trim())
      .filter(Boolean)
      .slice(0, 30),
  };
});
await page.screenshot({ path: shot }).catch(() => {});
const out = {
  url: page.url(),
  loggedIn: page.url().includes("/cgi-bin/home") || page.url().includes("token="),
  ...info,
  shot,
};
fs.writeFileSync(infoOut, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await ctx.close();
