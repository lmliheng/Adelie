/**
 * Rasterize the Adelie brand mark into the PNGs every target needs.
 *
 * Input : brand/adelie-icon.svg   (the master mark — treat as immutable)
 * Output: brand/icons/icon.png          1024 master (electron-builder turns it into .ico / .icns)
 *         brand/icons/<N>x<N>.png       512 / 256 / 128 freedesktop set
 *         brand/icons/icon-<N>.png      64 / 48 / 32 / 16 small-size sanity set
 *         brand/icons/adelie.ico        Windows icon, 16/32/48/64/128/256
 *         brand/preview.png             review sheet: the mark on white, grey and black
 *
 * Each size is rendered at its native resolution (never downscaled), with a transparent
 * background, so the SVG's own rounded-rect clip keeps the corners transparent.
 *
 * Regenerate: node brand/render-icons.mjs
 * Needs: playwright plus a chromium build. This machine already has playwright under
 * penguin-harness' landing package (PENGUIN_LANDING) and chromium in the ms-playwright
 * cache (CHROME_PATH, or auto-detected — the cached revision is newer than the one this
 * playwright release pins, so it is passed explicitly).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SVG_PATH = path.join(HERE, "adelie-icon.svg");
const OUT_DIR = path.join(HERE, "icons");

const landingPkg =
  process.env.PENGUIN_LANDING ?? "/root/penguin-harness/packages/landing/package.json";
const { chromium } = createRequire(landingPkg)("@playwright/test");

/** Newest cached chromium build, e.g. ~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome */
function findChromium() {
  if (process.env.CHROME_PATH !== undefined) return process.env.CHROME_PATH;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(os.homedir(), ".cache", "ms-playwright");
  const revisions = readdirSync(cache)
    .filter((name) => name.startsWith("chromium-"))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const revision of revisions) {
    const candidate = path.join(cache, revision, "chrome-linux64", "chrome");
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      /* not this one */
    }
  }
  return undefined; // let playwright use its own pinned build (after `playwright install`)
}
const executablePath = findChromium();

const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(
  readFileSync(SVG_PATH, "utf8"),
  "utf8",
).toString("base64")}`;

const pageFor = (size) =>
  `<style>html,body{margin:0;padding:0;background:transparent}` +
  `img{display:block;width:${size}px;height:${size}px}</style><img src="${svgDataUrl}">`;

mkdirSync(OUT_DIR, { recursive: true });

const SIZES = [
  { size: 1024, name: "icon.png" },
  { size: 512, name: "512x512.png" },
  { size: 256, name: "256x256.png" },
  { size: 128, name: "128x128.png" },
  { size: 64, name: "icon-64.png" },
  { size: 48, name: "icon-48.png" },
  { size: 32, name: "icon-32.png" },
  { size: 16, name: "icon-16.png" },
];

const browser = await chromium.launch({ executablePath });
try {
  const shoot = async (content, size) => {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(content);
    await page.evaluate(() => document.querySelector("img").decode());
    const png = await page.screenshot({
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    });
    await page.close();
    return png;
  };

  for (const { size, name } of SIZES) {
    const png = await shoot(pageFor(size), size);
    writeFileSync(path.join(OUT_DIR, name), png);
    console.log(`[render-icons] icons/${name} (${size}x${size}, ${png.length} bytes)`);
  }

  // Windows master: one .ico holding the 16…256 PNGs (the format allows PNG payloads directly,
  // so nothing is re-encoded and the corners stay transparent).
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const frames = [];
  for (const size of icoSizes) frames.push({ size, png: await shoot(pageFor(size), size) });
  const header = Buffer.alloc(6 + 16 * frames.length);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach(({ size, png }, index) => {
    const entry = 6 + 16 * index;
    header.writeUInt8(size === 256 ? 0 : size, entry); // 0 means 256
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2); // palette size
    header.writeUInt8(0, entry + 3); // reserved
    header.writeUInt16LE(1, entry + 4); // colour planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  const ico = Buffer.concat([header, ...frames.map((f) => f.png)]);
  writeFileSync(path.join(OUT_DIR, "adelie.ico"), ico);
  console.log(
    `[render-icons] icons/adelie.ico (${frames.length} frames ${icoSizes.join("/")}, ${ico.length} bytes)`,
  );

  const row = (bg, label, ink, sizes) =>
    `<section style="display:flex;align-items:flex-end;gap:44px;padding:30px 40px;background:${bg}">` +
    `<span style="font:11px ui-monospace,monospace;color:${ink};writing-mode:vertical-rl;margin-right:4px">${label}</span>` +
    sizes
      .map(
        (s) =>
          `<figure style="margin:0;display:flex;flex-direction:column;align-items:center;gap:10px">` +
          `<img src="${svgDataUrl}" width="${s}" height="${s}">` +
          `<figcaption style="font:11px ui-monospace,monospace;color:${ink}">${s}</figcaption></figure>`,
      )
      .join("") +
    `</section>`;
  const sheet =
    `<style>html,body{margin:0;background:#fff}</style>` +
    row("#ffffff", "light", "#9ca3af", [512, 256, 128, 64]) +
    row("#f3f4f6", "grey", "#9ca3af", [256, 128, 64, 32, 16]) +
    row("#0b0b0b", "dark", "#6b7280", [256, 128, 64, 32, 16]);
  const sheetPage = await browser.newPage({
    viewport: { width: 1200, height: 1200 },
    deviceScaleFactor: 1,
  });
  await sheetPage.setContent(sheet);
  const preview = await sheetPage.screenshot({ fullPage: true });
  await sheetPage.close();
  writeFileSync(path.join(HERE, "preview.png"), preview);
  console.log(`[render-icons] preview.png (${preview.length} bytes)`);
} finally {
  await browser.close();
}
