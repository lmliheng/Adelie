// 自动检查：隐私指引审核状态 + 代码是否已提交审核；隐私指引通过后自动重试提交代码审核
// 用法: node auto-submit.mjs [关键词] [状态文件]
import { launchStealth } from "./stealth.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const keyword = process.argv[2] || "待办清单";
const statusPath = process.argv[3] || path.join(here, "auto-submit-status.json");
const log = (...a) => console.log(new Date().toISOString(), ...a);
const out = { at: new Date().toISOString() };

const ctx = await launchStealth(path.join(here, "profile"), { headless: false });
const page = ctx.pages()[0] || (await ctx.newPage());
await page
  .goto("https://mp.weixin.qq.com/", { waitUntil: "commit", timeout: 60000 })
  .catch(() => {});
await page.waitForTimeout(15000);
const token = (page.url().match(/token=(\d+)/) || [])[1];
if (!token) {
  out.state = "NOT_LOGGED_IN";
  fs.writeFileSync(statusPath, JSON.stringify(out, null, 2));
  log("NOT LOGGED IN");
  await ctx.close().catch(() => {});
  process.exit(2);
}
const txt = () => page.evaluate(() => (document.body.innerText || "").replace(/\s+/g, " "));

// 1) 隐私指引状态
await page
  .goto(`https://mp.weixin.qq.com/wxamp/basicprofile/index?token=${token}&lang=zh_CN`, {
    waitUntil: "commit",
    timeout: 60000,
  })
  .catch(() => {});
await page.waitForTimeout(16000);
const basic = await txt();
const pi = basic.indexOf("用户隐私保护指引");
out.privacyLine = basic.slice(pi, pi + 60);
out.privacyOk =
  /审核通过|已更新|已通过/.test(basic.slice(pi, pi + 30)) ||
  !/未更新|审核中|未通过|审核不通过/.test(basic.slice(pi, pi + 30));
log("隐私指引:", out.privacyLine);

// 2) 版本管理状态
await page
  .goto(`https://mp.weixin.qq.com/wxamp/wacodepage/getcodepage?token=${token}&lang=zh_CN`, {
    waitUntil: "commit",
    timeout: 60000,
  })
  .catch(() => {});
await page.waitForTimeout(16000);
const ver = await txt();
const hasReview = /审核版本\s*版本号/.test(ver);
out.hasReviewVersion = hasReview;
out.versionsLine = ver.slice(ver.indexOf("线上版本"), ver.indexOf("线上版本") + 420);
log("版本:", out.versionsLine);
log("已有审核版本:", hasReview);

function summarize(reason) {
  out.state = reason;
  fs.writeFileSync(statusPath, JSON.stringify(out, null, 2));
  log("STATE", reason);
}

if (hasReview) {
  summarize("ALREADY_IN_REVIEW");
  await ctx.close().catch(() => {});
  process.exit(0);
}
if (!out.privacyOk) {
  summarize("WAITING_PRIVACY");
  await ctx.close().catch(() => {});
  process.exit(0);
}

// 3) 隐私通过且无审核版本 → 提交代码审核
const findBtn = () =>
  page.evaluate((kw) => {
    const marker = Array.from(document.querySelectorAll("*")).find(
      (e) => e.children.length === 0 && (e.innerText || "").includes(kw),
    );
    const btns = Array.from(document.querySelectorAll("button,a")).filter(
      (e) => e.offsetWidth && (e.innerText || "").trim() === "提交审核",
    );
    if (!btns.length) return null;
    const my = marker ? marker.getBoundingClientRect().y : 0;
    const chosen = btns
      .map((b) => ({ b, y: b.getBoundingClientRect().y }))
      .filter((o) => o.y > my - 40)
      .sort((a, b) => a.y - b.y)[0];
    const b = chosen ? chosen.b : btns[0];
    b.scrollIntoView({ block: "center" });
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, keyword);

let opened = false;
for (let i = 0; i < 3 && !opened; i++) {
  const p = await findBtn();
  if (!p) break;
  await page.mouse.click(p.x, p.y);
  for (let w = 0; w < 12; w++) {
    await page.waitForTimeout(1000);
    if (/确认提交审核/.test(await txt())) {
      opened = true;
      break;
    }
  }
}
if (!opened) {
  summarize("SUBMIT_BTN_FAILED");
  await ctx.close().catch(() => {});
  process.exit(4);
}

for (const t of ["已仔细阅读", "已阅读并了解平台审核规则"]) {
  const c = await page.evaluate((t) => {
    const el = Array.from(document.querySelectorAll("label,span,div,p"))
      .filter(
        (e) => e.offsetWidth && (e.innerText || "").includes(t) && (e.innerText || "").length < 120,
      )
      .pop();
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + 12, y: r.y + r.height / 2 };
  }, t);
  if (c) {
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(700);
  }
}
const clickText = async (label) => {
  const p = await page.evaluate((label) => {
    const els = Array.from(document.querySelectorAll("button,a,span,div")).filter(
      (e) => e.offsetWidth && e.children.length === 0 && (e.innerText || "").trim() === label,
    );
    if (!els.length) return null;
    els[els.length - 1].scrollIntoView({ block: "center" });
    const r = els[els.length - 1].getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label);
  if (!p) return false;
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(4500);
  log("clicked", label);
  return true;
};
await clickText("下一步");
await clickText("继续提交");
await page.waitForTimeout(12000);
await page
  .screenshot({ path: path.join(here, "auto-submit-final.png"), fullPage: true })
  .catch(() => {});

// 复核是否进了审核
await page
  .goto(`https://mp.weixin.qq.com/wxamp/wacodepage/getcodepage?token=${token}&lang=zh_CN`, {
    waitUntil: "commit",
    timeout: 60000,
  })
  .catch(() => {});
await page.waitForTimeout(15000);
const ver2 = await txt();
out.versionsAfter = ver2.slice(ver2.indexOf("线上版本"), ver2.indexOf("线上版本") + 420);
out.submitted = /审核版本\s*版本号/.test(ver2);
summarize(out.submitted ? "SUBMITTED" : "SUBMIT_NO_EFFECT");
await ctx.close().catch(() => {});
process.exit(0);
