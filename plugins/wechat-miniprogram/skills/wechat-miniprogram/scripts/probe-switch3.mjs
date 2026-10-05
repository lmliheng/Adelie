// 正确姿势点「切换账号」：先点开左下角账号面板，再点菜单项，观察结果
import { launchStealth } from "./stealth.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || "/tmp/probe-switch3.json";
const shotPrefix = process.argv[3] || "/tmp/probe-switch3";
const ctx = await launchStealth(path.join(here, "profile"), { headless: false });
const page = ctx.pages()[0] || (await ctx.newPage());
page.on("dialog", (d) => {
  console.log("DIALOG", d.type(), d.message());
  d.dismiss().catch(() => {});
});
page.on("framenavigated", (f) => {
  if (f === page.mainFrame()) console.log("NAV", f.url());
});
await page.goto("https://mp.weixin.qq.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(8000);

const items = page.locator("li.account_box-panel-item");
console.log(
  "panel items",
  await items.count(),
  "visible0",
  await items
    .first()
    .isVisible()
    .catch(() => null),
);
await page
  .click(".mp_account_box", { timeout: 5000 })
  .catch((e) => console.log("open err", e.message.split("\n")[0]));
await page.waitForTimeout(1500);
console.log(
  "visible after open",
  await items
    .first()
    .isVisible()
    .catch(() => null),
);
await page.screenshot({ path: `${shotPrefix}-a.png` }).catch(() => {});

const target = page.locator("li.account_box-panel-item", { hasText: "切换账号" }).first();
const box = await target.boundingBox().catch(() => null);
console.log("box", JSON.stringify(box));
if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
else
  await target
    .click({ timeout: 5000, force: true })
    .catch((e) => console.log("click err", e.message.split("\n")[0]));
await page.waitForTimeout(7000);
console.log("url after", page.url());

// 收集可能的 toast / 弹窗文字
const info = await page.evaluate(() => {
  const vis = (e) => !!(e.offsetWidth || e.offsetHeight);
  const dialogs = [];
  for (const e of document.querySelectorAll(
    '[class*="dialog"],[class*="toast"],[class*="modal"],[class*="message_box"],[class*="weui-desktop-dialog"]',
  )) {
    if (!vis(e)) continue;
    const t = (e.innerText || "").replace(/\s+/g, " ").trim();
    if (t)
      dialogs.push({
        cls: (e.className || "").toString().slice(0, 100),
        t: t.slice(0, 300),
        html: e.outerHTML.slice(0, 500),
      });
  }
  const qrs = Array.from(document.querySelectorAll("img"))
    .filter(vis)
    .map((i) => ({
      src: (i.src || "").slice(0, 60),
      w: i.naturalWidth,
      h: i.naturalHeight,
      cls: (i.className || "").toString().slice(0, 60),
    }))
    .filter((i) => i.w > 100 && i.h > 100);
  const clickableTexts = [];
  for (const e of document.querySelectorAll("a,li,div,section,button")) {
    if (!vis(e)) continue;
    const t = (e.innerText || "").replace(/\s+/g, " ").trim();
    if (!t || t.length > 30) continue;
    const cls = (e.className || "").toString();
    if (/account|item|card|select|choose|login__type|dialog/i.test(cls))
      clickableTexts.push({ tag: e.tagName, cls: cls.slice(0, 90), t });
  }
  return {
    url: location.href,
    text: (document.body.innerText || "").replace(/\n{2,}/g, "\n").slice(0, 900),
    dialogs: dialogs.slice(0, 8),
    qrs,
    clickableTexts: clickableTexts.slice(0, 30),
  };
});
await page.screenshot({ path: `${shotPrefix}-b.png` }).catch(() => {});
fs.writeFileSync(out, JSON.stringify(info, null, 2));
console.log("dialogs", JSON.stringify(info.dialogs.slice(0, 3)));
console.log("qrs", JSON.stringify(info.qrs));
console.log("clickable", JSON.stringify(info.clickableTexts.slice(0, 20)));
console.log("text:", info.text.replace(/\n/g, " | ").slice(0, 600));
await ctx.close();
