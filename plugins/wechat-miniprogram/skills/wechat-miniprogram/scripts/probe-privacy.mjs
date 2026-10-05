// 探查隐私保护指引页：iframe / 网络失败原因
import { launchStealth } from "./stealth.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] || here;
const log = (...a) => console.log(new Date().toISOString(), ...a);

const ctx = await launchStealth(path.join(here, "profile"), { headless: false });
const page = ctx.pages()[0] || (await ctx.newPage());
const errs = [];
page.on("requestfailed", (r) =>
  errs.push(`FAIL ${r.failure()?.errorText || ""} ${r.url().slice(0, 160)}`),
);
page.on("response", (r) => {
  const u = r.url();
  if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${u.slice(0, 160)}`);
});
page.on("pageerror", (e) => errs.push(`PAGEERR ${String(e.message).slice(0, 200)}`));
page.on("framenavigated", (f) => log("frame nav", f.url().slice(0, 160)));

await page
  .goto("https://mp.weixin.qq.com/", { waitUntil: "commit", timeout: 60000 })
  .catch(() => {});
await page.waitForTimeout(15000);
const token = (page.url().match(/token=(\d+)/) || [])[1];
await page
  .goto(`https://mp.weixin.qq.com/wxamp/wadevelopcode/privacy?token=${token}&lang=zh_CN`, {
    waitUntil: "commit",
    timeout: 60000,
  })
  .catch(() => {});
await page.waitForTimeout(25000);

const info = await page.evaluate(() => {
  const vis = (e) => !!(e.offsetWidth || e.offsetHeight);
  const frames = Array.from(document.querySelectorAll("iframe")).map((f) => ({
    src: (f.src || "").slice(0, 160),
    w: f.offsetWidth,
    h: f.offsetHeight,
  }));
  const btns = [
    ...new Set(
      Array.from(document.querySelectorAll('button,a,[role="button"],div,span'))
        .filter((e) => vis(e) && e.children.length === 0)
        .map((e) => (e.innerText || "").replace(/\s+/g, " ").trim())
        .filter((t) => t && t.length <= 12),
    ),
  ];
  const inputs = Array.from(document.querySelectorAll("input,textarea,select"))
    .filter(vis)
    .map((e) => ({ tag: e.tagName, ph: e.placeholder || "", val: (e.value || "").slice(0, 30) }));
  return {
    url: location.href,
    frames,
    btns,
    inputs,
    text: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 1500),
  };
});
log("frames", JSON.stringify(info.frames));
log("btns", JSON.stringify(info.btns));
log("inputs", JSON.stringify(info.inputs));
log("text", info.text.slice(0, 900));
log("--- errors ---");
for (const e of [...new Set(errs)].slice(0, 40)) log(e);
await page
  .screenshot({ path: path.join(outDir, "probe-privacy.png"), fullPage: true })
  .catch(() => {});
await ctx.close().catch(() => {});
process.exit(0);
