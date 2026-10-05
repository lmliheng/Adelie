// 从公众号后台切到指定小程序后台，并 dump 落地页（URL/标题/AppID/侧边菜单/链接）
// 用法: node to-miniapp.mjs "lmliheng" <out.json> <shot.png>
import { launchStealth } from "./stealth.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const keyword = process.argv[2] || "lmliheng";
const out = process.argv[3] || "/tmp/to-miniapp.json";
const shot = process.argv[4] || "/tmp/to-miniapp.png";

const ctx = await launchStealth(path.join(here, "profile"), { headless: false });
let page = ctx.pages()[0] || (await ctx.newPage());
page.on("framenavigated", (f) => {
  if (f === page.mainFrame()) console.log("NAV", f.url());
});
ctx.on("page", (p) => {
  console.log("NEW PAGE", p.url());
});

await page.goto("https://mp.weixin.qq.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(8000);
console.log("start url", page.url());

// 如果已经是小程序后台，直接 dump
const isMini = /\/wxamp\//.test(page.url());
if (!isMini) {
  await page
    .click(".mp_account_box", { timeout: 8000 })
    .catch((e) => console.log("open err", e.message.split("\n")[0]));
  await page.waitForTimeout(1500);
  const target = page.locator("li.account_box-panel-item", { hasText: "切换账号" }).first();
  const box = await target.boundingBox().catch(() => null);
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  else
    await target
      .click({ timeout: 5000, force: true })
      .catch((e) => console.log("click1 err", e.message.split("\n")[0]));
  await page.waitForTimeout(4000);

  // 弹窗结构 dump（便于排错）
  const dlg = await page.evaluate(() => {
    const d = document.querySelector(".switch-account-dialog");
    if (!d) return null;
    return Array.from(d.querySelectorAll("*"))
      .filter((e) => e.children.length === 0 && (e.innerText || "").trim())
      .map((e) => ({
        cls: (e.className || "").toString().slice(0, 80),
        t: (e.innerText || "").trim().slice(0, 30),
        parentCls: (e.parentElement.className || "").toString().slice(0, 80),
      }));
  });
  console.log("dialog leaves", JSON.stringify(dlg));

  // 弹窗内的小程序行：找精确文本的最小节点，点它的矩形中心
  const row = page.getByText(keyword, { exact: true }).first();
  let rb = await row.boundingBox().catch(() => null);
  if (!rb) {
    // 退一步：点该文本所在的可点击祖先
    rb = await page
      .evaluate((kw) => {
        const els = Array.from(document.querySelectorAll(".switch-account-dialog *")).filter(
          (e) => (e.innerText || "").trim() === kw,
        );
        if (!els[0]) return null;
        let n = els[0];
        for (
          let i = 0;
          i < 4 && n.parentElement && n.parentElement.closest(".switch-account-dialog");
          i++
        )
          n = n.parentElement;
        const r = n.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }, keyword)
      .catch(() => null);
  }
  console.log("row box", JSON.stringify(rb));
  if (rb) await page.mouse.click(rb.x + Math.min(60, rb.width / 2), rb.y + rb.height / 2);
  else
    await row
      .click({ timeout: 5000, force: true })
      .catch((e) => console.log("click2 err", e.message.split("\n")[0]));
  await page.waitForTimeout(10000);
  // 可能开了新标签页
  const pages = ctx.pages();
  console.log("pages now", JSON.stringify(pages.map((p) => p.url())));
  const mini = pages.find((p) => /\/wxamp\//.test(p.url()));
  if (mini) {
    await mini.bringToFront().catch(() => {});
    page = mini;
  }
  console.log("after switch url", page.url());
  const afterText = await page
    .evaluate(() => (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 600))
    .catch(() => "");
  console.log("after switch text:", afterText);
  await page.screenshot({ path: shot.replace(/\.png$/, "-after-switch.png") }).catch(() => {});
}

const info = await page.evaluate(() => {
  const vis = (e) => !!(e.offsetWidth || e.offsetHeight);
  const all = document.body.innerText || "";
  const appids = [...new Set(all.match(/wx[0-9a-f]{16}/g) || [])];
  const links = Array.from(document.querySelectorAll("a[href]"))
    .filter(vis)
    .map((a) => ({ t: (a.innerText || "").trim().slice(0, 16), href: a.getAttribute("href") }))
    .filter((l) => l.href && l.href !== "javascript:;");
  const menu = Array.from(
    document.querySelectorAll(
      '.weui-desktop-menu__item, .weui-desktop-sub-menu__item, [class*="menu__item"]',
    ),
  )
    .filter(vis)
    .map((e) => (e.innerText || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return {
    url: location.href,
    title: document.title,
    appids,
    links: links.slice(0, 80),
    menu,
    text: all.replace(/\s+/g, " ").slice(0, 1500),
  };
});
await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
fs.writeFileSync(out, JSON.stringify(info, null, 2));
console.log("URL", info.url);
console.log("TITLE", info.title);
console.log("APPIDS", JSON.stringify(info.appids));
console.log("MENU", JSON.stringify(info.menu.slice(0, 40)));
console.log("LINKS", JSON.stringify(info.links.slice(0, 40)));
console.log("TEXT", info.text.slice(0, 800));
await ctx.close().catch(() => {});
process.exit(0);
