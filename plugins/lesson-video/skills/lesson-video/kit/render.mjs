#!/usr/bin/env node
/**
 * 逐帧渲染课件：把 deck.html 按 lesson.json 的时间轴定格成 30fps 的图片序列。
 * 每一帧都由 seek(t) 从时间 t 纯函数地算出来，所以画面与配音、字幕严格对齐。
 *
 * 用法:
 *   PLAYWRIGHT_MODULE=<pw-core 路径> CHROME_PATH=<chrome.exe> \
 *   node lib/render.mjs --dir lessons/ep00-pilot [--fps 30] [--scale 0.5]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PW = process.env.PLAYWRIGHT_MODULE || "playwright-core";
const CHROME = process.env.CHROME_PATH || "";
const pw = require(PW);
const { chromium } = pw;

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};

const dir = path.resolve(arg("--dir", "lessons/ep00-pilot"));
// CSS 布局固定按 1080x1920 设计；--scale 只缩放光栅，用来快速预览
const dsf = parseFloat(arg("--scale", "1")) || 1;
const W = 1080,
  H = 1920;

const lesson = JSON.parse(fs.readFileSync(path.join(dir, "lesson.json"), "utf8"));
const fps = parseInt(arg("--fps", String(lesson.fps || 30)), 10);
const framesDir = path.join(dir, "frames");
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });

const total = Math.round(lesson.duration * fps);
console.log(
  `渲染 ${lesson.meta.series} · ${lesson.meta.episode}: ${lesson.duration}s × ${fps}fps = ${total} 帧 @ ${W * dsf}x${H * dsf}`,
);

const browser = await chromium.launch({
  executablePath: CHROME || undefined,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--force-color-profile=srgb",
  ],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dsf });
const page = await ctx.newPage();
await page.addInitScript(`window.__LESSON__ = ${JSON.stringify(lesson)};`);
// 每集可以自带 deck.html 覆盖版式；没有就用 lib/deck.html 这份共用的
const localDeck = path.join(dir, "deck.html");
const deck = fs.existsSync(localDeck) ? localDeck : path.join(HERE, "deck.html");
await page.goto(pathToFileURL(deck).href, { waitUntil: "load" });
await page.evaluate(() => window.__init(window.__LESSON__));
await page.evaluate(() => document.fonts.ready);

// 安全区自检：字幕带从 y=1470 开始，任何一幕的内容越线都会盖住字幕。
// 逐幕快进到结束前，量一遍可见元素的底边。
const SAFE_BOTTOM = 1470;
const over = await page.evaluate((safe) => {
  const bad = [];
  const nodes = document.querySelectorAll(".scene");
  window.__LESSON__.scenes.forEach((s, i) => {
    window.seek(s.start + s.dur - 0.35);
    let worst = 0,
      who = "";
    nodes[i].querySelectorAll("*").forEach((n) => {
      const r = n.getBoundingClientRect();
      if (r.height > 0 && r.bottom > worst) {
        worst = r.bottom;
        who = (n.className || n.tagName).toString();
      }
    });
    if (worst > safe) bad.push({ scene: s.id, bottom: Math.round(worst), el: who.slice(0, 40) });
  });
  return bad;
}, SAFE_BOTTOM);
if (over.length) {
  console.log("⚠ 越出字幕安全线：");
  over.forEach((o) => console.log(`   ${o.scene}  底边 ${o.bottom}  (${o.el})`));
} else {
  console.log(`安全区自检通过（所有内容底边 < ${SAFE_BOTTOM}）`);
}

// 代码行比卡片宽就会被悄悄裁掉（.card-bd 是 overflow:hidden），这里逐幕量一遍
const clipped = await page.evaluate(() => {
  const bad = [];
  document.querySelectorAll(".scene").forEach((sc, i) => {
    const bd = sc.querySelector(".card-bd");
    if (bd && bd.scrollWidth > bd.clientWidth + 1) {
      bad.push({
        scene: sc.classList.contains("on") ? i : i,
        w: bd.scrollWidth,
        box: bd.clientWidth,
      });
    }
  });
  return bad;
});
if (clipped.length) {
  console.log("⚠ 代码行被裁：");
  clipped.forEach((o) => console.log(`   第 ${o.scene + 1} 幕  内容 ${o.w}px > 卡片 ${o.box}px`));
} else {
  console.log("代码宽度自检通过（没有行被裁）");
}

// 标题折行后末行只剩一两个字（孤字）会被安全区挤出来，这里量一遍每个标题的行宽
const orphans = await page.evaluate(() => {
  const bad = [];
  const nodes = document.querySelectorAll(".scene");
  nodes.forEach((sc, i) => {
    // 先切到这一幕：.scene 默认 display:none，隐藏元素的 Range 量不到行框
    const s = window.__LESSON__.scenes[i];
    window.seek(s.start + s.dur * 0.5);
    const h = sc.querySelector(".hero, .stitle, .outro");
    if (!h) return;
    const range = document.createRange();
    range.selectNodeContents(h);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0);
    if (rects.length < 2) return;
    const widths = rects.map((r) => r.width);
    const last = widths[widths.length - 1],
      max = Math.max(...widths);
    if (last < max * 0.45)
      bad.push({ scene: i + 1, text: h.textContent, last: Math.round(last), max: Math.round(max) });
  });
  return bad;
});
if (orphans.length) {
  console.log("⚠ 标题末行过短（孤字）：");
  orphans.forEach((o) =>
    console.log(`   第 ${o.scene} 幕  「${o.text}」 末行 ${o.last}px / 最长行 ${o.max}px`),
  );
} else {
  console.log("标题折行自检通过（没有孤字行）");
}

const t0 = Date.now();
if (argv.includes("--check")) {
  // 只做自检，不出帧
  await browser.close();
  process.exit(over.length || clipped.length || orphans.length ? 1 : 0);
}
for (let i = 0; i < total; i++) {
  const t = i / fps;
  await page.evaluate((tt) => window.seek(tt), t);
  await page.screenshot({
    path: path.join(framesDir, `f_${String(i).padStart(5, "0")}.jpg`),
    type: "jpeg",
    quality: 95,
  });
  if (i % 30 === 0 || i === total - 1) {
    const done = i + 1,
      el = (Date.now() - t0) / 1000;
    process.stdout.write(
      `\r  ${done}/${total}  ${((el / done) * 1000).toFixed(0)}ms/帧  eta ${(((el / done) * (total - done)) / 60).toFixed(1)} min   `,
    );
  }
}
process.stdout.write("\n");
await browser.close();
console.log(`OK ${total} 帧 -> ${framesDir}`);
