// 提交审核流程中抓 CheckPrivacyApiAuth 的响应体，确认卡点
import { launchStealth } from "./stealth.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] || here;
const keyword = process.argv[3] || "待办清单";
const log = (...a) => console.log(new Date().toISOString(), ...a);

const ctx = await launchStealth(path.join(here, "profile"), { headless: false });
const page = ctx.pages()[0] || (await ctx.newPage());
const bodies = [];
page.on("response", async (r) => {
  const u = r.url();
  if (/privacy|Privacy|submit|audit/i.test(u) && !/aegis|res\.wx\.qq\.com/.test(u)) {
    let body = "";
    try {
      body = (await r.text()).slice(0, 600);
    } catch {}
    bodies.push(`[${r.status()}] ${u.slice(0, 140)}\n  ${body}`);
  }
});
page.on("pageerror", (e) => bodies.push("PAGEERR " + String(e.message).slice(0, 200)));

await page
  .goto("https://mp.weixin.qq.com/", { waitUntil: "commit", timeout: 60000 })
  .catch(() => {});
await page.waitForTimeout(15000);
const token = (page.url().match(/token=(\d+)/) || [])[1];
if (!token) {
  log("NOT LOGGED IN");
  await ctx.close().catch(() => {});
  process.exit(2);
}
await page
  .goto(`https://mp.weixin.qq.com/wxamp/wacodepage/getcodepage?token=${token}&lang=zh_CN`, {
    waitUntil: "commit",
    timeout: 60000,
  })
  .catch(() => {});
await page.waitForTimeout(15000);

const bodyText = () => page.evaluate(() => (document.body.innerText || "").replace(/\s+/g, " "));
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
    if (/确认提交审核/.test(await bodyText())) {
      opened = true;
      break;
    }
  }
}
log("notice opened", opened);
if (!opened) {
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
const clickText = async (txt) => {
  const p = await page.evaluate((txt) => {
    const e = Array.from(document.querySelectorAll("button,a,span,div,label"))
      .filter((x) => x.offsetWidth && x.children.length === 0 && (x.innerText || "").trim() === txt)
      .pop();
    if (!e) return null;
    e.scrollIntoView({ block: "center" });
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, txt);
  if (!p) {
    log("no btn", txt);
    return false;
  }
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(4000);
  return true;
};
await clickText("下一步");
await clickText("继续提交");
await page.waitForTimeout(12000);

log("final url", page.url());
log("--- privacy/submit responses ---");
for (const b of bodies.slice(-20)) log(b);
fs.writeFileSync(path.join(outDir, "privcheck.log"), bodies.join("\n\n"));
await page.screenshot({ path: path.join(outDir, "privcheck.png"), fullPage: true }).catch(() => {});
await ctx.close().catch(() => {});
process.exit(0);
