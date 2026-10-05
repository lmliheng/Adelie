// 填写隐私指引 → 预览 → 确定并提交协议；如需扫码则出码等待
import { launchStealth } from "./stealth.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import jsQR from "jsqr";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] || here;
const contact = process.argv[3] || "liheng221994@qq.com";
const log = (...a) => console.log(new Date().toISOString(), ...a);
const PURPOSES = [
  "用于账号注册、登录与身份校验",
  "用于保存你生成或导出的图片到相册",
  "用于按你所在位置提供本地化内容",
  "用于识别你复制的文本并快速创建内容",
];

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
  const file = path.join(outDir, `wechat-mp-priv-qr-${hash}.png`);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, PNG.sync.write(big));
    for (const f of fs.readdirSync(outDir))
      if (/^wechat-mp-priv-qr-[0-9a-f]{8}\.png$/.test(f) && path.join(outDir, f) !== file) {
        try {
          fs.unlinkSync(path.join(outDir, f));
        } catch {}
      }
  }
  return {
    file,
    hash,
    size: `${big.width}x${big.height}`,
    decoded: dec ? dec.data.slice(0, 90) : null,
  };
}

const ctx = await launchStealth(path.join(here, "profile"), { headless: false });
const page = ctx.pages()[0] || (await ctx.newPage());
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
  .goto(
    `https://mp.weixin.qq.com/wxamp/wadevelopcode/privacy?ver=1&id=0&wait=0&token=${token}&lang=zh_CN`,
    { waitUntil: "commit", timeout: 60000 },
  )
  .catch(() => {});
await page.waitForTimeout(22000);

const txt = () => page.evaluate(() => (document.body.innerText || "").replace(/\s+/g, " "));
const clickText = async (label, { last = true } = {}) => {
  const p = await page.evaluate(
    ({ label, last }) => {
      const els = Array.from(document.querySelectorAll("button,a,span,div,li")).filter(
        (e) => e.offsetWidth && e.children.length === 0 && (e.innerText || "").trim() === label,
      );
      if (!els.length) return null;
      const e = last ? els[els.length - 1] : els[0];
      e.scrollIntoView({ block: "center" });
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    },
    { label, last },
  );
  if (!p) {
    log("no elem", label);
    return false;
  }
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(3000);
  log("clicked", label);
  return true;
};

// 1) 用途
const boxes = page.locator('input[placeholder="请填写用途"]');
for (let i = 0; i < (await boxes.count()); i++)
  await boxes
    .nth(i)
    .fill(PURPOSES[i] || PURPOSES[0])
    .catch(() => {});

// 2) 联系方式：定位「请选择」所在行，选中类型后填同行输入框
const anchorY = await page.evaluate(() => {
  const e = Array.from(document.querySelectorAll("*")).find(
    (x) => x.offsetWidth && x.children.length === 0 && (x.innerText || "").trim() === "请选择",
  );
  if (!e) return null;
  e.scrollIntoView({ block: "center" });
  return e.getBoundingClientRect().y;
});
log("anchor y", anchorY);
await page.waitForTimeout(800);
if (anchorY !== null) {
  const p = await page.evaluate(() => {
    const e = Array.from(document.querySelectorAll("*")).find(
      (x) => x.offsetWidth && x.children.length === 0 && (x.innerText || "").trim() === "请选择",
    );
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (p) {
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(2000);
  }
  const opt = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('li,[role="option"],span,div')).filter(
      (x) => x.offsetWidth && x.children.length === 0 && (x.innerText || "").trim() === "邮箱",
    );
    if (!els.length) return null;
    const r = els[els.length - 1].getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (opt) {
    await page.mouse.click(opt.x, opt.y);
    await page.waitForTimeout(2500);
    log("picked 邮箱");
  }

  // 填到与「请选择」同一行的输入框
  // 用 placeholder=邮箱 精确定位联系方式输入框
  const byPh = page.locator('input[placeholder="邮箱"]');
  if (await byPh.count().catch(() => 0)) {
    await byPh
      .first()
      .fill(contact)
      .catch((e) => log("contact fill err", e.message.split("\n")[0]));
    log("contact filled via placeholder");
  }
  const res = await page.evaluate(
    ({ y, v }) => {
      const inputs = Array.from(
        document.querySelectorAll("input[type=text],input:not([type])"),
      ).filter((e) => e.offsetWidth && !/请填写用途/.test(e.placeholder || ""));
      const near = inputs.filter((i) => Math.abs(i.getBoundingClientRect().y - y) < 90);
      if (!near.length)
        return {
          ok: false,
          cands: inputs.map((i) => ({
            y: Math.round(i.getBoundingClientRect().y),
            ph: i.placeholder,
            val: i.value,
          })),
        };
      const t = near[0];
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      setter.call(t, v);
      t.dispatchEvent(new Event("input", { bubbles: true }));
      t.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, val: t.value, ph: t.placeholder };
    },
    { y: anchorY, v: contact },
  );
  log("contact fill", JSON.stringify(res));
}
// 2.5) 补 5.2「再次以 ___ 方式告知」那一栏（预览时会显示「待填写」）
const fifth = await page.evaluate(() => {
  const inputs = Array.from(document.querySelectorAll("input[type=text],input:not([type])")).filter(
    (e) =>
      e.offsetWidth &&
      !/请填写用途/.test(e.placeholder || "") &&
      !/邮箱|电话|微信号|qq/.test(e.placeholder || ""),
  );
  const t = inputs[inputs.length - 1];
  if (!t) return null;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(t, "弹窗提示");
  t.dispatchEvent(new Event("input", { bubbles: true }));
  t.dispatchEvent(new Event("change", { bubbles: true }));
  return { ph: t.placeholder || "", val: t.value, y: Math.round(t.getBoundingClientRect().y) };
});
log("5.2 填写", JSON.stringify(fifth));
await page.waitForTimeout(1200);
await page
  .screenshot({ path: path.join(outDir, "pf2-before-preview.png"), fullPage: true })
  .catch(() => {});

// 3) 预览 → 提交
await clickText("预览后提交协议");
await page.waitForTimeout(7000);
let t = await txt();
log("preview tail:", t.slice(-400));
const stillWarn = /联系方式待完善|部分进行完善/.test(t);
log("still warn", stillWarn);
await page
  .screenshot({ path: path.join(outDir, "pf2-preview.png"), fullPage: true })
  .catch(() => {});

if (!stillWarn) {
  // 勾选「本小程序已对用户的信息处理进行了逐一、如实的说明…」
  const cb = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("label,span,div,p"))
      .filter(
        (e) =>
          e.offsetWidth &&
          /本小程序已对用户的信息处理/.test(e.innerText || "") &&
          (e.innerText || "").length < 120,
      )
      .pop();
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.x + 10, y: r.y + r.height / 2 };
  });
  log("agree checkbox", JSON.stringify(cb));
  if (cb) {
    await page.mouse.click(cb.x, cb.y);
    await page.waitForTimeout(1500);
  }
  const st = await page.evaluate(() =>
    Array.from(document.querySelectorAll("input[type=checkbox]")).map((c) => ({
      checked: c.checked,
      vis: !!c.offsetParent,
    })),
  );
  log("checkbox state", JSON.stringify(st));
  await page
    .screenshot({ path: path.join(outDir, "pf2-agreed.png"), fullPage: true })
    .catch(() => {});
  await clickText("确定并提交协议");
  await page.waitForTimeout(8000);
  t = await txt();
  log("after submit url", page.url());
  log("after submit tail", t.slice(-400));
  await page
    .screenshot({ path: path.join(outDir, "pf2-submitted.png"), fullPage: true })
    .catch(() => {});

  // 可能弹扫码
  const el = await page.evaluateHandle(() => {
    const ds = Array.from(document.querySelectorAll('[class*="dialog"],[class*="modal"]')).filter(
      (e) => e.offsetWidth > 200 && e.offsetHeight > 120,
    );
    for (const d of ds)
      for (const img of d.querySelectorAll("img")) {
        if (img.getBoundingClientRect().width > 120) return img;
      }
    for (const d of ds)
      for (const cv of d.querySelectorAll("canvas")) {
        if (cv.getBoundingClientRect().width > 120) return cv;
      }
    return null;
  });
  const node = el.asElement();
  if (node) {
    const buf = await node.screenshot().catch(() => null);
    if (buf) {
      const info = deliverQr(buf);
      log(
        "QR_READY",
        path.basename(info.file),
        info.size,
        info.decoded ? "decoded-ok" : "UNREADABLE",
      );
    }
  }
  const dlg = await page.evaluate(() => {
    const ds = Array.from(document.querySelectorAll('[class*="dialog"],[class*="modal"]')).filter(
      (e) => e.offsetWidth > 200 && e.offsetHeight > 120,
    );
    return ds.map((d) => (d.innerText || "").replace(/\s+/g, " ").trim().slice(0, 200));
  });
  log("dialogs after submit", JSON.stringify(dlg));
}
await ctx.close().catch(() => {});
process.exit(0);
