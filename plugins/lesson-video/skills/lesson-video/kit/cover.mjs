#!/usr/bin/env node
/**
 * 把 covers/covers.json 渲染成抖音封面图：9:16（1080×1920，视频首图）与 3:4（1080×1440，主页封面）。
 *
 * 用法:
 *   PLAYWRIGHT_MODULE=<pw-core 路径> CHROME_PATH=<chrome.exe> \
 *   node lib/cover.mjs --data covers/covers.json --out covers/out [--sizes 1920,1440]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const pw = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const CHROME = process.env.CHROME_PATH || "";

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};

const dataFile = path.resolve(arg("--data", "covers/covers.json"));
const outDir = path.resolve(arg("--out", "covers/out"));
const sizes = arg("--sizes", "1920,1440")
  .split(",")
  .map((s) => parseInt(s, 10));
const W = 1080;

const covers = JSON.parse(fs.readFileSync(dataFile, "utf8"));
fs.mkdirSync(outDir, { recursive: true });

const browser = await pw.chromium.launch({
  executablePath: CHROME || undefined,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--force-color-profile=srgb",
  ],
});

for (const c of covers) {
  for (const H of sizes) {
    const size = H === 1920 ? "9x16" : `${W}x${H}`;
    const ctx = await browser.newContext({
      viewport: { width: W, height: H },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.addInitScript(`window.__COVER__ = ${JSON.stringify(c)};`);
    await page.goto(pathToFileURL(path.join(HERE, "cover.html")).href, { waitUntil: "load" });
    await page.evaluate((s) => window.__init(window.__COVER__, s), H === 1440 ? "3x4" : "9x16");
    await page.evaluate(() => document.fonts.ready);
    const file = path.join(outDir, `${c.id}-${size}.png`);
    await page.screenshot({ path: file });
    await ctx.close();
    console.log(`OK ${file}  ${W}x${H}`);
  }
}

await browser.close();
