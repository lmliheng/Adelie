// 微信公众号扫码登录 v2：直接抓取二维码原图（而非元素截图），放大并校验可解码性
import { launchStealth } from "./stealth.mjs";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import jsQR from "jsqr";

const here = path.dirname(fileURLToPath(import.meta.url));
const qrOut = process.argv[2] || path.join(here, "qr.png");
const statusPath = process.argv[3] || path.join(here, "login-status.json");
const timeoutMin = Number(process.argv[4] || 12);
const write = (o) =>
  fs.writeFileSync(statusPath, JSON.stringify({ at: new Date().toISOString(), ...o }, null, 2));

// 二维码原图是 jpg（472x472），页面里被缩到 122x122 显示；这里取原图并在浏览器里放大成 PNG
function savePng(pngBuf, out) {
  fs.writeFileSync(out, pngBuf);
  const png = PNG.sync.read(pngBuf);
  const dec = jsQR(new Uint8Array(png.data), png.width, png.height);
  return { size: `${png.width}x${png.height}`, decoded: dec ? dec.data : null };
}

const ctx = await launchStealth(path.join(here, "profile"), { headless: false });
const page = ctx.pages()[0] || (await ctx.newPage());
write({ state: "STARTING" });

const cookiesHave = async () => {
  const cs = await ctx.cookies("https://mp.weixin.qq.com").catch(() => []);
  return cs.map((c) => c.name).filter((n) => ["slave_sid", "slave_user", "bizuin"].includes(n));
};

async function grabQr() {
  const res = await page
    .evaluate(async (scale) => {
      const img = document.querySelector('img[class*="qrcode"], img[src*="scanloginqrcode"]');
      if (!img) return null;
      const src = img.src;
      if (!img.complete || !img.naturalWidth) return { src, png: null, natural: null };
      const c = document.createElement("canvas");
      c.width = img.naturalWidth * scale;
      c.height = img.naturalHeight * scale;
      const g = c.getContext("2d");
      g.imageSmoothingEnabled = false;
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      return {
        src,
        png: c.toDataURL("image/png").split(",")[1],
        natural: `${img.naturalWidth}x${img.naturalHeight}`,
      };
    }, 2)
    .catch(() => null);
  return res;
}

let lastSrc = "";
let dumped = false;
const deadline = Date.now() + timeoutMin * 60 * 1000;
let state = "WAITING_SCAN";

try {
  await page.goto("https://mp.weixin.qq.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
} catch (e) {
  write({ state: "GOTO_ERROR", error: e.message });
}

while (Date.now() < deadline) {
  const url = page.url();
  if (url.includes("/cgi-bin/home") || url.includes("token=")) {
    await page.waitForTimeout(2500);
    const home = qrOut.replace(/\.png$/, "") + "-home.png";
    await page.screenshot({ path: home }).catch(() => {});
    try {
      await ctx.storageState({ path: path.join(here, "session.json") });
    } catch {}
    write({
      state: "LOGGED_IN",
      url,
      title: await page.title().catch(() => ""),
      homeShot: home,
      cookies: await cookiesHave(),
    });
    console.log("LOGGED_IN", url);
    await ctx.close();
    process.exit(0);
  }

  if (!dumped) {
    dumped = true;
    const html = await page
      .evaluate(() => {
        const box =
          document.querySelector(".login__type__container__scan") ||
          document.querySelector('[class*="login__type__container"]');
        return box ? box.outerHTML.slice(0, 4000) : "(no login container)";
      })
      .catch(() => "");
    const refreshish = await page
      .evaluate(() =>
        Array.from(document.querySelectorAll(".login__type__container__scan *"))
          .filter((e) => /失效|刷新|重新获取/.test(e.innerText || ""))
          .map(
            (e) =>
              (e.className || "").toString() + " :: " + (e.innerText || "").trim().slice(0, 30),
          )
          .slice(0, 10),
      )
      .catch(() => []);
    console.log(
      "--- login container html ---\n" +
        html +
        "\n--- refresh candidates ---\n" +
        JSON.stringify(refreshish),
    );
  }

  const qr = await grabQr();
  if (qr && qr.src !== lastSrc && qr.png) {
    // 按内容 hash 命名，避免同样的文件名被看图工具缓存成旧图
    const buf = Buffer.from(qr.png, "base64");
    const hash = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 8);
    const file = qrOut.replace(/\.png$/, `-${hash}.png`);
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, buf);
      for (const f of fs.readdirSync(path.dirname(file))) {
        if (
          /^wechat-mp-login-qr-[0-9a-f]{8}\.png$/.test(f) &&
          path.join(path.dirname(file), f) !== file
        ) {
          try {
            fs.unlinkSync(path.join(path.dirname(file), f));
          } catch {}
        }
      }
    }
    const info = savePng(buf, file);
    lastSrc = qr.src;
    state = "WAITING_SCAN";
    write({ state, url, qrSrc: qr.src, qrFile: file, native: qr.natural, ...info });
    console.log(
      "QR_READY",
      new Date().toISOString(),
      path.basename(file),
      JSON.stringify({ native: qr.natural, ...info }),
    );
  }

  // 轮询扫码状态
  const ask = await page
    .evaluate(async () => {
      const img = document.querySelector('img[class*="qrcode"], img[src*="scanloginqrcode"]');
      const m = img && (img.getAttribute("src") || "").match(/random=(\d+)/);
      if (!m) return null;
      try {
        const r = await fetch(
          `/cgi-bin/scanloginqrcode?action=ask&random=${m[1]}&lang=zh_CN&token=`,
          { credentials: "include" },
        );
        return { text: (await r.text()).slice(0, 300) };
      } catch (e) {
        return { error: e.message };
      }
    })
    .catch(() => null);
  if (ask) {
    let st = null;
    try {
      st = JSON.parse(ask.text);
    } catch {}
    write({ state, url, qrFile: qrOut, ask: ask.text });
    if (st && st.status !== undefined && st.status !== 0)
      console.log("ASK status=" + st.status, ask.text.slice(0, 200));
    if (st && ["1", "2", "4", "5"].includes(String(st.status)))
      state = "SCANNED(status=" + st.status + ")";
    if (st && ["3", "6", "7", "8"].includes(String(st.status))) {
      state = "QR_EXPIRED(status=" + st.status + ")";
      const clicked = await page
        .evaluate(() => {
          const cand = Array.from(
            document.querySelectorAll(".login__type__container__scan *"),
          ).filter((e) => /失效|刷新|重新获取/.test(e.innerText || ""));
          if (cand[0]) {
            cand[0].click();
            return (cand[0].innerText || "").trim().slice(0, 30);
          }
          return null;
        })
        .catch(() => null);
      console.log("EXPIRED -> refresh click:", clicked);
      lastSrc = "";
      if (!clicked) {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
        console.log("EXPIRED -> reloaded page for a fresh QR");
      }
      await page.waitForTimeout(2500);
    }
  }

  const bodyText = await page
    .evaluate(() => (document.body.innerText || "").slice(0, 800))
    .catch(() => "");
  if (/选择(公众平台)?账号|选择公众号/.test(bodyText) && !/微信扫一扫/.test(bodyText)) {
    const shotPath = qrOut.replace(/\.png$/, "") + "-chooser.png";
    await page.screenshot({ path: shotPath }).catch(() => {});
    write({ state: "ACCOUNT_CHOOSER", url, shot: shotPath, text: bodyText.slice(0, 400) });
    console.log("CHOOSER:", bodyText.slice(0, 300).replace(/\n+/g, " | "));
    const first = page
      .locator('a[class*="account"], li[class*="account"], [class*="account__item"]')
      .first();
    if ((await first.count().catch(() => 0)) > 0) {
      await first.click({ timeout: 5000 }).catch((e) => console.log("click failed", e.message));
      await page.waitForTimeout(4000);
      continue;
    }
  }

  await page.waitForTimeout(2000);
}

write({ state: "TIMEOUT", url: page.url() });
console.log("TIMEOUT");
await ctx.close();
process.exit(1);
