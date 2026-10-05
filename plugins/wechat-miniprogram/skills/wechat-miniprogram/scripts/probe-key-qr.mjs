// 探明「重置代码上传密钥」弹窗里二维码的元素类型与原始分辨率
import { launchStealth } from "./stealth.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import jsQR from "jsqr";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] || here;
const ctx = await launchStealth(path.join(here, "profile"), { headless: false });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto("https://mp.weixin.qq.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(10000);
const token = (page.url().match(/token=(\d+)/) || [])[1];
await page.goto(`https://mp.weixin.qq.com/wxamp/devprofile/get_profile?token=${token}&lang=zh_CN`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(9000);

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
await page.mouse.click(btn.x, btn.y);
await page.waitForTimeout(4000);

const info = await page.evaluate(() => {
  const dlg = document.querySelector(".weui-desktop-dialog") || document.body;
  const out = { imgs: [], canvases: [], divs: [] };
  for (const img of dlg.querySelectorAll("img")) {
    const r = img.getBoundingClientRect();
    out.imgs.push({
      srcKind: (img.src || "").slice(0, 40),
      dataUrl: (img.src || "").startsWith("data:"),
      nat: `${img.naturalWidth}x${img.naturalHeight}`,
      rect: `${Math.round(r.width)}x${Math.round(r.height)}`,
      cls: (img.className || "").toString(),
    });
  }
  for (const cv of dlg.querySelectorAll("canvas")) {
    const r = cv.getBoundingClientRect();
    out.canvases.push({
      size: `${cv.width}x${cv.height}`,
      rect: `${Math.round(r.width)}x${Math.round(r.height)}`,
      cls: (cv.className || "").toString(),
    });
  }
  for (const d of dlg.querySelectorAll("div,span")) {
    const r = d.getBoundingClientRect();
    const bg = getComputedStyle(d).backgroundImage;
    if (bg && bg !== "none" && r.width > 80)
      out.divs.push({
        bg: bg.slice(0, 80),
        rect: `${Math.round(r.width)}x${Math.round(r.height)}`,
        cls: (d.className || "").toString().slice(0, 60),
      });
  }
  return out;
});
console.log(JSON.stringify(info, null, 2));

// 尝试从 img（data URL）或 canvas 取原始位图
const raw = await page.evaluate(() => {
  const dlg = document.querySelector(".weui-desktop-dialog") || document.body;
  const toPng = (src, w, h) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, w, h);
    g.drawImage(src, 0, 0, w, h);
    return c.toDataURL("image/png").split(",")[1];
  };
  for (const img of dlg.querySelectorAll("img"))
    if (img.naturalWidth >= 100)
      return {
        kind: "img",
        w: img.naturalWidth,
        h: img.naturalHeight,
        png: toPng(img, img.naturalWidth, img.naturalHeight),
      };
  for (const cv of dlg.querySelectorAll("canvas"))
    if (cv.width >= 100)
      return {
        kind: "canvas",
        w: cv.width,
        h: cv.height,
        png: cv.toDataURL("image/png").split(",")[1],
      };
  return null;
});
if (raw) {
  const buf = Buffer.from(raw.png, "base64");
  fs.writeFileSync(path.join(outDir, "probe-key-qr-native.png"), buf);
  const png = PNG.sync.read(buf);
  const dec = jsQR(new Uint8Array(png.data), png.width, png.height);
  console.log(
    "RAW kind",
    raw.kind,
    png.width + "x" + png.height,
    "jsQR:",
    dec ? dec.data.slice(0, 90) : "FAIL",
  );
  // 3 倍最近邻放大再试
  const s = 3;
  const big = new PNG({ width: png.width * s, height: png.height * s });
  for (let y = 0; y < big.height; y++)
    for (let x = 0; x < big.width; x++) {
      const si = (((y / s) | 0) * png.width + ((x / s) | 0)) << 2,
        di = (y * big.width + x) << 2;
      big.data[di] = png.data[si];
      big.data[di + 1] = png.data[si + 1];
      big.data[di + 2] = png.data[si + 2];
      big.data[di + 3] = 255;
    }
  const bigBuf = PNG.sync.write(big);
  fs.writeFileSync(path.join(outDir, "probe-key-qr-3x.png"), bigBuf);
  const dec2 = jsQR(new Uint8Array(big.data), big.width, big.height);
  console.log("3x", big.width + "x" + big.height, "jsQR:", dec2 ? dec2.data.slice(0, 90) : "FAIL");
}

// 元素截图对比
const el = page.locator(".weui-desktop-dialog canvas, .weui-desktop-dialog img").first();
if (await el.count().catch(() => 0)) {
  await el.screenshot({ path: path.join(outDir, "probe-key-qr-el.png") }).catch(() => {});
  console.log("element shot saved");
}
await page.screenshot({ path: path.join(outDir, "probe-key-qr-page.png") }).catch(() => {});
await ctx.close().catch(() => {});
process.exit(0);
