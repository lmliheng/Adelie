// 重置「小程序代码上传密钥」：出管理员验证二维码 → 等用户扫码 → 等密钥下载落盘
// 用法: node reset-key2.mjs <qrOutPrefix> <statusPath> <keyOutPath> [超时分钟]
import { launchStealth } from "./stealth.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import jsQR from "jsqr";

const here = path.dirname(fileURLToPath(import.meta.url));
const qrPrefix = process.argv[2] || path.join(here, "key-qr.png");
const statusPath = process.argv[3] || path.join(here, "reset-key-status.json");
const keyOut = process.argv[4] || path.join(here, "mp-upload-key.key");
const timeoutMin = Number(process.argv[5] || 12);
const outDir = path.dirname(qrPrefix);
const base = path.basename(qrPrefix).replace(/\.png$/, "");
const write = (o) =>
  fs.writeFileSync(statusPath, JSON.stringify({ at: new Date().toISOString(), ...o }, null, 2));
const log = (...a) => console.log(new Date().toISOString(), ...a);

function upscale3x(png) {
  const s = 3;
  const b = new PNG({ width: png.width * s, height: png.height * s });
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
  const buf = PNG.sync.write(big);
  const dec = jsQR(new Uint8Array(big.data), big.width, big.height);
  // 用「解码内容」做 hash：同一张码反复截图得到同一个文件名，不会把用户手上的文件删掉
  const hash = crypto
    .createHash("sha1")
    .update(dec ? dec.data : buf)
    .digest("hex")
    .slice(0, 8);
  const file = path.join(outDir, `${base}-${hash}.png`);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, buf);
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
let downloaded = null;
page.on("download", async (d) => {
  try {
    await d.saveAs(keyOut);
    downloaded = keyOut;
    log("DOWNLOAD saved", keyOut, fs.statSync(keyOut).size);
    write({ state: "KEY_DOWNLOADED", keyOut });
  } catch (e) {
    log("download err", e.message);
  }
});

await page.goto("https://mp.weixin.qq.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(10000);
const token = (page.url().match(/token=(\d+)/) || [])[1];
if (!token) {
  write({ state: "NOT_LOGGED_IN" });
  log("NOT LOGGED IN");
  await ctx.close().catch(() => {});
  process.exit(2);
}
await page.goto(`https://mp.weixin.qq.com/wxamp/devprofile/get_profile?token=${token}&lang=zh_CN`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(9000);

const clickReset = async () => {
  const btn = await page.evaluate(() => {
    const label = Array.from(document.querySelectorAll("*")).find(
      (e) => e.children.length === 0 && (e.innerText || "").trim() === "小程序代码上传密钥",
    );
    let n = label;
    for (let i = 0; i < 8 && n; i++) {
      n = n.parentElement;
      if (!n) break;
      const c = Array.from(n.querySelectorAll("a,button,span,div")).filter(
        (e) => e.children.length === 0 && (e.innerText || "").trim() === "重置",
      );
      if (c[0]) {
        const r = c[0].getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
    return null;
  });
  if (!btn) return false;
  await page.mouse.click(btn.x, btn.y);
  await page.waitForTimeout(4000);
  return true;
};

const dlgText = () =>
  page.evaluate(() => {
    const ds = Array.from(document.querySelectorAll('[class*="dialog"],[class*="modal"]')).filter(
      (e) => e.offsetWidth > 200 && e.offsetHeight > 150,
    );
    return ds
      .map((e) => (e.innerText || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" || ")
      .slice(0, 400);
  });

if (!(await clickReset())) {
  write({ state: "NO_RESET_BTN" });
  log("no reset btn");
  await ctx.close().catch(() => {});
  process.exit(3);
}

const grabQr = async () => {
  // 1) 可见 dialog 内的 img
  const el = await page.evaluateHandle(() => {
    const ds = Array.from(document.querySelectorAll('[class*="dialog"],[class*="modal"]')).filter(
      (e) => e.offsetWidth > 200 && e.offsetHeight > 150,
    );
    for (const d of ds)
      for (const img of d.querySelectorAll("img")) {
        const r = img.getBoundingClientRect();
        if (r.width > 120 && r.height > 120) return img;
      }
    for (const d of ds)
      for (const cv of d.querySelectorAll("canvas")) {
        const r = cv.getBoundingClientRect();
        if (r.width > 120 && r.height > 120) return cv;
      }
    return null;
  });
  const node = el.asElement();
  if (!node) return null;
  const buf = await node.screenshot().catch(() => null);
  if (!buf) return null;
  return deliverQr(buf);
};

let lastText = "";
let qrInfo = null;
const deadline = Date.now() + timeoutMin * 60 * 1000;
let lastQrAt = 0;

while (Date.now() < deadline) {
  if (downloaded) break;
  const t = await dlgText();

  if (t !== lastText) {
    lastText = t;
    log("dialog:", t);
    if (/失效|过期|刷新|重新获取/.test(t)) {
      log("QR expired -> refresh");
      const r = await page
        .evaluate(() => {
          const ds = Array.from(
            document.querySelectorAll('[class*="dialog"],[class*="modal"]'),
          ).filter((e) => e.offsetWidth > 200);
          for (const d of ds)
            for (const e of d.querySelectorAll("a,button,span,div")) {
              const tx = (e.innerText || "").trim();
              if (e.children.length === 0 && /刷新|重新获取|点击刷新/.test(tx)) {
                const r = e.getBoundingClientRect();
                window.__qrRefresh = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
                return window.__qrRefresh;
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
  }

  if (!qrInfo || Date.now() - lastQrAt > 15000) {
    const info = await grabQr();
    if (info) {
      const changed = !qrInfo || info.decoded !== qrInfo.decoded;
      qrInfo = info;
      lastQrAt = Date.now();
      // 只有码真的换了才落盘并打印
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

  // 扫码后：找下载按钮
  const dl = await page
    .evaluate(() => {
      const ds = Array.from(document.querySelectorAll('[class*="dialog"],[class*="modal"]')).filter(
        (e) => e.offsetWidth > 200 && e.offsetHeight > 150,
      );
      for (const d of ds)
        for (const e of d.querySelectorAll("a,button,span,div")) {
          const tx = (e.innerText || "").trim();
          if (e.children.length === 0 && /^(下载|下载密钥|重新下载)$/.test(tx)) {
            const r = e.getBoundingClientRect();
            if (r.width > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: tx };
          }
        }
      return null;
    })
    .catch(() => null);
  if (dl) {
    log("click 下载", dl.t);
    await page.mouse.click(dl.x, dl.y);
    await page.waitForTimeout(5000);
  }

  await page.waitForTimeout(2500);
}

await page.screenshot({ path: path.join(outDir, `${base}-final.png`) }).catch(() => {});
if (downloaded) {
  log("DONE", keyOut);
  write({ state: "DONE", keyOut });
} else {
  log("TIMEOUT");
  write({ state: "TIMEOUT", url: page.url() });
}
await ctx.close().catch(() => {});
process.exit(0);
