// 编辑 IP 白名单：出管理员验证二维码 → 等扫码 → 在第二步填入 IP → 保存 → 复核
// 用法: node add-ip2.mjs <qrPrefix> <statusPath> <ip列表逗号分隔> [超时分钟]
import { launchStealth } from "./stealth.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import jsQR from "jsqr";

const here = path.dirname(fileURLToPath(import.meta.url));
const qrPrefix = process.argv[2];
const statusPath = process.argv[3];
const ips = (process.argv[4] || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const timeoutMin = Number(process.argv[5] || 20);
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
  .goto(`https://mp.weixin.qq.com/wxamp/devprofile/get_profile?token=${token}&lang=zh_CN`, {
    waitUntil: "commit",
    timeout: 60000,
  })
  .catch(() => {});
await page.waitForTimeout(12000);

const dlgText = () =>
  page.evaluate(() => {
    const ds = Array.from(document.querySelectorAll('[class*="dialog"],[class*="modal"]')).filter(
      (e) => e.offsetWidth > 200 && e.offsetHeight > 150,
    );
    return ds
      .map((e) => (e.innerText || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" || ")
      .slice(0, 500);
  });

const openDialog = async () => {
  const btn = await page.evaluate(() => {
    const label = Array.from(document.querySelectorAll("*")).find(
      (e) => e.children.length === 0 && (e.innerText || "").trim() === "IP白名单",
    );
    let n = label;
    for (let i = 0; i < 8 && n; i++) {
      n = n.parentElement;
      if (!n) break;
      const c = Array.from(n.querySelectorAll("a,button,span,div")).filter(
        (e) => e.children.length === 0 && (e.innerText || "").trim() === "编辑",
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

const grabQr = async () => {
  const el = await page.evaluateHandle(() => {
    const ds = Array.from(document.querySelectorAll('[class*="dialog"],[class*="modal"]')).filter(
      (e) => e.offsetWidth > 200 && e.offsetHeight > 150,
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

if (!(await openDialog())) {
  write({ state: "NO_EDIT_BTN" });
  log("no edit btn");
  await ctx.close().catch(() => {});
  process.exit(3);
}

let t = await dlgText();
log("dialog:", t);
let qrInfo = null,
  lastQrAt = 0;
const deadline = Date.now() + timeoutMin * 60 * 1000;
let scanned = false;

let tick = 0;
while (Date.now() < deadline && !scanned) {
  t = await dlgText();
  tick++;
  if (tick % 8 === 0) {
    log("tick dialog:", t.slice(0, 220));
    await page.screenshot({ path: path.join(outDir, `${base}-live.png`) }).catch(() => {});
  }
  // 注意：进到第二步后步骤条里仍然有「身份确认」字样，不能拿它判断；只看"请扫码/请在手机上确认"是否消失
  if (!/请使用管理员微信扫描|请在手机上进行确认/.test(t)) {
    scanned = true;
    log("STEP_READY:", t.slice(0, 160));
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

if (!scanned) {
  write({ state: "TIMEOUT" });
  log("TIMEOUT");
  await ctx.close().catch(() => {});
  process.exit(4);
}

await page.waitForTimeout(4000);
t = await dlgText();
log("step2 dialog:", t);
write({ state: "STEP2", dialog: t });
await page.screenshot({ path: path.join(outDir, `${base}-step2.png`) }).catch(() => {});

const step2 = await page.evaluate(() => {
  const ds = Array.from(document.querySelectorAll('[class*="dialog"],[class*="modal"]')).filter(
    (e) => e.offsetWidth > 200 && e.offsetHeight > 150,
  );
  const out = { inputs: [], btns: [] };
  for (const d of ds) {
    for (const i of d.querySelectorAll("input,textarea")) {
      const r = i.getBoundingClientRect();
      if (r.width)
        out.inputs.push({
          tag: i.tagName,
          ph: i.placeholder || "",
          val: i.value || "",
          rect: `${Math.round(r.x)},${Math.round(r.y)}`,
        });
    }
    for (const b of d.querySelectorAll("button,a,span,div")) {
      if (b.children.length === 0) {
        const tx = (b.innerText || "").trim();
        if (tx && tx.length <= 10) {
          const r = b.getBoundingClientRect();
          if (r.width) out.btns.push({ t: tx, rect: `${Math.round(r.x)},${Math.round(r.y)}` });
        }
      }
    }
  }
  return out;
});
log("step2 struct", JSON.stringify(step2));

// 若没有输入框，先点「添加」
if (step2.inputs.length === 0) {
  const add = await page.evaluate(() => {
    const ds = Array.from(document.querySelectorAll('[class*="dialog"],[class*="modal"]')).filter(
      (e) => e.offsetWidth > 200,
    );
    for (const d of ds)
      for (const e of d.querySelectorAll("a,button,span,div")) {
        if (
          e.children.length === 0 &&
          /^(添加|新增|添加IP|新建)$/.test((e.innerText || "").trim())
        ) {
          const r = e.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
    return null;
  });
  if (add) {
    await page.mouse.click(add.x, add.y);
    await page.waitForTimeout(2500);
    log("clicked 添加");
  }
}

// 填入 IP（多行/多框都支持）
const setVals = await page.evaluate((list) => {
  const ds = Array.from(document.querySelectorAll('[class*="dialog"],[class*="modal"]')).filter(
    (e) => e.offsetWidth > 200,
  );
  const boxes = [];
  for (const d of ds)
    for (const i of d.querySelectorAll("input,textarea"))
      if (i.getBoundingClientRect().width) boxes.push(i);
  if (!boxes.length) return 0;
  if (boxes.length === 1) {
    const i = boxes[0];
    i.focus();
    i.value = list.join("\n");
    i.dispatchEvent(new Event("input", { bubbles: true }));
    i.dispatchEvent(new Event("change", { bubbles: true }));
    return 1;
  }
  list.forEach((v, k) => {
    const i = boxes[k];
    if (!i) return;
    i.focus();
    i.value = v;
    i.dispatchEvent(new Event("input", { bubbles: true }));
    i.dispatchEvent(new Event("change", { bubbles: true }));
  });
  return boxes.length;
}, ips);
log("setVals boxes", setVals, JSON.stringify(ips));
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(outDir, `${base}-filled.png`) }).catch(() => {});

const save = await page.evaluate(() => {
  const ds = Array.from(document.querySelectorAll('[class*="dialog"],[class*="modal"]')).filter(
    (e) => e.offsetWidth > 200,
  );
  for (const d of ds)
    for (const e of d.querySelectorAll("button,a,span,div")) {
      if (
        e.children.length === 0 &&
        /^(保存|确定|确认|提交|完成)$/.test((e.innerText || "").trim())
      ) {
        const r = e.getBoundingClientRect();
        if (r.width)
          return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: (e.innerText || "").trim() };
      }
    }
  return null;
});
log("save btn", JSON.stringify(save));
if (save) {
  await page.mouse.click(save.x, save.y);
  await page.waitForTimeout(5000);
}
await page.screenshot({ path: path.join(outDir, `${base}-saved.png`) }).catch(() => {});
log("after save dialog:", await dlgText());

// 复核：重新打开开发设置页
await page
  .goto(`https://mp.weixin.qq.com/wxamp/devprofile/get_profile?token=${token}&lang=zh_CN`, {
    waitUntil: "commit",
    timeout: 60000,
  })
  .catch(() => {});
await page.waitForTimeout(12000);
const verify = await page.evaluate(() => {
  const t = (document.body.innerText || "").replace(/\s+/g, " ");
  const i = t.indexOf("IP白名单");
  return t.slice(i, i + 120);
});
log("VERIFY:", verify);
write({ state: "DONE", saved: !!save, ips, verify });
await ctx.close().catch(() => {});
process.exit(0);
