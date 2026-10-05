// 反检测上下文：无头 Chromium 最常见的暴露点是 UA 里的 HeadlessChrome 与若干 navigator 特征
import { chromium } from "playwright";
import path from "node:path";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export async function launchStealth(profileDir, { headless = true } = {}) {
  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless,
    userAgent: UA,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    args: ["--disable-blink-features=AutomationControlled", "--lang=zh-CN"],
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "languages", { get: () => ["zh-CN", "zh", "en"] });
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3].map((i) => ({ name: `Plugin ${i}` })),
    });
    window.chrome = window.chrome || { runtime: {} };
    const patch = (proto) => {
      if (!proto) return;
      const orig = proto.getParameter;
      proto.getParameter = function (p) {
        if (p === 37445) return "Google Inc. (Intel)";
        if (p === 37446)
          return "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)";
        return orig.call(this, p);
      };
    };
    try {
      patch(window.WebGLRenderingContext && window.WebGLRenderingContext.prototype);
    } catch {}
    try {
      patch(window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype);
    } catch {}
  });
  return ctx;
}

// 人类化拖动：加速—匀速—减速，带纵向抖动，末端微调后停顿再松手
export async function dragSlider(
  page,
  {
    handleSel = ".aliyunCaptcha-sliding-slider",
    trackSel = ".aliyunCaptcha-sliding-text-box",
  } = {},
) {
  const handle = page.locator(handleSel).first();
  const track = page.locator(trackSel).first();
  const hb = await handle.boundingBox();
  const tb = await track.boundingBox();
  if (!hb || !tb) return false;
  const y = hb.y + hb.height / 2;
  const sx = hb.x + hb.width / 2;
  const ex = tb.x + tb.width - hb.width / 2;

  await page.mouse.move(sx - 25 + Math.random() * 20, y + (Math.random() - 0.5) * 12);
  await page.waitForTimeout(120 + Math.random() * 180);
  await page.mouse.move(sx, y, { steps: 3 });
  await page.waitForTimeout(90 + Math.random() * 120);
  await page.mouse.down();
  await page.waitForTimeout(150 + Math.random() * 200);

  const dist = ex - sx;
  const steps = 30 + Math.floor(Math.random() * 12);
  let done = 0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // 慢起—快中—慢收
    const eased =
      t < 0.2 ? (t / 0.2) ** 2 * 0.06 + t * 0.14 : t > 0.85 ? 1 - ((1 - t) / 0.15) * 0.05 : t;
    const target = Math.min(1, eased) * dist;
    const jitter = (Math.random() - 0.5) * 1.4;
    done = target;
    await page.mouse.move(sx + target, y + jitter);
    await page.waitForTimeout(9 + Math.random() * 17);
    if (Math.random() < 0.12) await page.waitForTimeout(40 + Math.random() * 90);
  }
  // 末端微调
  await page.mouse.move(sx + dist + 3, y, { steps: 2 });
  await page.waitForTimeout(90);
  await page.mouse.move(sx + dist, y);
  await page.waitForTimeout(180 + Math.random() * 150);
  await page.mouse.up();
  void done;
  return true;
}
