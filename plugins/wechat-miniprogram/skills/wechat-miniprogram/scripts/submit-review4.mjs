// 提交审核：须知 → 下一步 → 安全测试提醒「继续提交」→ dump 审核信息表单/结果
import { launchStealth } from "./stealth.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] || here;
const label = process.argv[3] || "submit4";
const keyword = process.argv[4] || "待办清单";
const stopAfter = process.argv[5] || ""; // 例如 'continue' 表示到「继续提交」为止不点
const log = (...a) => console.log(new Date().toISOString(), ...a);

const ctx = await launchStealth(path.join(here, "profile"), { headless: false });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto("https://mp.weixin.qq.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(10000);
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
await page.waitForTimeout(12000);

const bodyText = () => page.evaluate(() => (document.body.innerText || "").replace(/\s+/g, " "));

// 打开须知
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
if (!opened) {
  log("FAILED TO OPEN");
  await ctx.close().catch(() => {});
  process.exit(4);
}
log("notice opened");

// 勾选两个确认项
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
log(
  "checked",
  JSON.stringify(
    await page.evaluate(() =>
      Array.from(document.querySelectorAll("input[type=checkbox]"))
        .filter((c) => c.offsetParent)
        .map((c) => c.checked),
    ),
  ),
);

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
  log("clicked", txt);
  return true;
};

await clickText("下一步");
log("after 下一步:", (await bodyText()).slice(-260));
await page.screenshot({ path: path.join(outDir, `miniapp-${label}-safety.png`) }).catch(() => {});

if (stopAfter !== "continue") {
  await clickText("继续提交");
  // 抓一下提交后的即时提示（toast 很快就消失）
  for (let i = 0; i < 16; i++) {
    const tip = await page
      .evaluate(() => {
        const out = [];
        for (const e of document.querySelectorAll(
          '[class*="toast"],[class*="tip"],[class*="message"],[class*="dialog"],[class*="warn"],[class*="error"]',
        )) {
          if (!e.offsetWidth) continue;
          const t = (e.innerText || "").replace(/\s+/g, " ").trim();
          if (t) out.push(t.slice(0, 200));
        }
        return [...new Set(out)];
      })
      .catch(() => []);
    if (tip.length) log("tip@" + i, JSON.stringify(tip));
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(4000);
  log("after 继续提交 url:", page.url());
  log("after 继续提交 text:", (await bodyText()).slice(0, 1800));
  await page
    .screenshot({ path: path.join(outDir, `miniapp-${label}-after.png`), fullPage: true })
    .catch(() => {});
}

const info = await page.evaluate(() => {
  const vis = (e) => !!(e.offsetWidth || e.offsetHeight);
  const btns = [
    ...new Set(
      Array.from(document.querySelectorAll('button,a,[role="button"],label'))
        .filter(vis)
        .map((e) => (e.innerText || "").replace(/\s+/g, " ").trim().slice(0, 30))
        .filter((t) => t && t.length <= 30),
    ),
  ];
  const inputs = Array.from(document.querySelectorAll("input,textarea"))
    .filter(vis)
    .map((e) => ({
      tag: e.tagName,
      type: e.type || "",
      ph: e.placeholder || "",
      val: (e.value || "").slice(0, 30),
    }));
  return {
    url: location.href,
    text: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 3000),
    btns,
    inputs,
  };
});
fs.writeFileSync(path.join(outDir, `miniapp-${label}-state.json`), JSON.stringify(info, null, 2));
log("STATE URL", info.url);
log("STATE TEXT:", info.text.slice(0, 1500));
log("STATE BTNS:", JSON.stringify(info.btns.slice(0, 50)));
log("STATE INPUTS:", JSON.stringify(info.inputs.slice(0, 25)));
await ctx.close().catch(() => {});
process.exit(0);
