// 删除（撤回）审核版本：出管理员验证二维码 → 等扫码 → 完成删除 → 复核
// 用法: node withdraw2.mjs <qrPrefix> <statusPath> [超时分钟]
import { launchStealth } from "./stealth.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import jsQR from "jsqr";

const here = path.dirname(fileURLToPath(import.meta.url));
const qrPrefix = process.argv[2] || path.join(here, "del-qr.png");
const statusPath = process.argv[3] || path.join(here, "withdraw-status.json");
const timeoutMin = Number(process.argv[4] || 20);
const outDir = path.dirname(qrPrefix);
const base = path.basename(qrPrefix).replace(/\.png$/, "");
const write = (o) =>
  fs.writeFileSync(statusPath, JSON.stringify({ at: new Date().toISOString(), ...o }, null, 2));
const log = (...a) => console.log(new Date().toISOString(), ...a);

function upscale3x(png) {
  const s = 3,
    b = new PNG({ width: png.width * s, height: png.height * s });
  for (let y = 0; y < b.height; y++)
    for (let x = 0; x < b.width; x++) {
      const si = (((y / s) | 0) * png.width + ((x / s) | 0)) << 2,
        di = (y * b.width + x) << 2;
      b.data[di] = png.data[si];
      b.data[di + 1] = png.data[si + 1];
      b.data[di + 2] = png.data[si + 2];
      b.data[di + 3] = 255;
    }
  return b;
}
function deliverQr(pngBuf) {
  const png = PNG.sync.read(pngBuf);
  const big = upscale3x(png);
  const dec = jsQR(new Uint8Array(big.data), big.width, big.height);
  const hash = crypto
    .createHash("sha1")
    .update(dec ? dec.data : PNG.sync.write(big))
    .digest("hex")
    .slice(0, 8);
  const file = path.join(outDir, `${base}-${hash}.png`);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, PNG.sync.write(big));
    const re = new RegExp(`^${base}-[0-9a-f]{8}\\.png$`);
    for (const f of fs.readdirSync(outDir))
      if (re.test(f) && path.join(outDir, f) !== file) {
        try {
          fs.unlinkSync(path.join(outDir, f));
        } catch {}
      }
  }
  return {
    file,
    hash,
    size: `${big.width}x${big.height}`,
    decoded: dec ? dec.data.slice(0, 100) : null,
  };
}

const ctx = await launchStealth(path.join(here, "profile"), { headless: false });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto("https://mp.weixin.qq.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(10000);
const token = (page.url().match(/token=(\d+)/) || [])[1];
if (!token) {
  write({ state: "NOT_LOGGED_IN" });
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

const dlgText = () =>
  page.evaluate(() => {
    const ds = Array.from(document.querySelectorAll('[class*="dialog"],[class*="modal"]')).filter(
      (e) => e.offsetWidth > 200 && e.offsetHeight > 120,
    );
    return ds
      .map((e) => (e.innerText || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" || ")
      .slice(0, 400);
  });
const pageText = () => page.evaluate(() => (document.body.innerText || "").replace(/\s+/g, " "));

const p = await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button,a")).filter(
    (e) => e.offsetWidth && (e.innerText || "").trim() === "删除",
  )[0];
  if (!btn) return null;
  btn.scrollIntoView({ block: "center" });
  const r = btn.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (!p) {
  write({ state: "NO_DELETE_BTN" });
  log("NO_DELETE_BTN");
  await ctx.close().catch(() => {});
  process.exit(3);
}
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(4000);

const grabQr = async () => {
  const el = await page.evaluateHandle(() => {
    const ds = Array.from(document.querySelectorAll('[class*="dialog"],[class*="modal"]')).filter(
      (e) => e.offsetWidth > 200 && e.offsetHeight > 120,
    );
    for (const d of ds)
      for (const img of d.querySelectorAll("img")) {
        const r = img.getBoundingClientRect();
        if (r.width > 120) return img;
      }
    for (const d of ds)
      for (const cv of d.querySelectorAll("canvas")) {
        const r = cv.getBoundingClientRect();
        if (r.width > 120) return cv;
      }
    return null;
  });
  const node = el.asElement();
  if (!node) return null;
  const buf = await node.screenshot().catch(() => null);
  return buf ? deliverQr(buf) : null;
};

let t = await dlgText();
log("dialog:", t);
write({ state: "DIALOG", dialog: t });
let qrInfo = null,
  lastQrAt = 0,
  done = false;
const deadline = Date.now() + timeoutMin * 60 * 1000;

while (Date.now() < deadline) {
  t = await dlgText();
  if (!/请使用微信扫描二维码进行验证|请在手机上进行确认/.test(t)) {
    done = true;
    break;
  }
  if (/失效|过期|刷新|重新获取/.test(t)) {
    const r = await page
      .evaluate(() => {
        const ds = Array.from(
          document.querySelectorAll('[class*="dialog"],[class*="modal"]'),
        ).filter((e) => e.offsetWidth > 200);
        for (const d of ds)
          for (const e of d.querySelectorAll("a,button,span,div")) {
            if (e.children.length === 0 && /刷新|重新获取/.test((e.innerText || "").trim())) {
              const r = e.getBoundingClientRect();
              return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
            }
          }
        return null;
      })
      .catch(() => null);
    if (r) {
      await page.mouse.click(r.x, r.y);
      await page.waitForTimeout(3000);
    }
    qrInfo = null;
    lastQrAt = 0;
  }
  if (!qrInfo || Date.now() - lastQrAt > 15000) {
    const info = await grabQr();
    if (info) {
      const changed = !qrInfo || info.decoded !== qrInfo.decoded;
      qrInfo = info;
      lastQrAt = Date.now();
      if (changed) {
        log(
          "QR_READY",
          path.basename(info.file),
          info.size,
          info.decoded ? "decoded-ok" : "UNREADABLE",
        );
        write({ state: "WAIT_SCAN", ...info, dialog: t });
      }
    }
  }
  await page.waitForTimeout(2000);
}

if (!done) {
  write({ state: "TIMEOUT" });
  log("TIMEOUT");
  await ctx.close().catch(() => {});
  process.exit(4);
}
log("verified, dialog now:", t);
await page.waitForTimeout(4000);

const c = await page.evaluate(() => {
  const e = Array.from(document.querySelectorAll("button,a,span,div"))
    .filter(
      (x) =>
        x.offsetWidth &&
        x.children.length === 0 &&
        /^(确定|确认|删除)$/.test((x.innerText || "").trim()),
    )
    .pop();
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: (e.innerText || "").trim() };
});
log("confirm:", JSON.stringify(c));
if (c) {
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(7000);
}
await page.screenshot({ path: path.join(outDir, `${base}-done.png`) }).catch(() => {});
const after = await pageText();
log("after:", after.slice(0, 700));
write({
  state: "DONE",
  hasReviewVersion: /审核版本\s*版本号/.test(after),
  after: after.slice(0, 600),
});
await ctx.close().catch(() => {});
process.exit(0);
