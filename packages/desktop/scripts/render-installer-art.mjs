/**
 * Render the Windows installer's own artwork from the brand mark.
 *
 * NSIS's assisted installer draws two images, and without ours it draws neither of Adelie's:
 * `installerSidebar` falls back to `${NSISDIR}/Contrib/Graphics/Wizard/nsis3-metro.bmp` (NSIS's
 * own stock graphic) and `installerHeader` is not drawn at all, leaving the header bar blank.
 * That is the whole of what a person sees while installing Adelie on Windows, so both are
 * rendered here instead — from `packages/web/public/adelie-icon.svg`, the same immutable mark
 * `render-icon.mjs` uses, in the product's own typeface.
 *
 * Outputs (COMMITTED — regenerate only when the mark or the wordmark changes):
 * - build/nsis/installerSidebar.bmp     164×314. The welcome and finish pages' left column
 *                                       (MUI_WELCOMEFINISHPAGE_BITMAP; the uninstaller reuses
 *                                       it, electron-builder's own default). NSIS requires
 *                                       these exact pixels: any other size and the bitmap is
 *                                       ignored.
 * - build/nsis/installerHeader.bmp      150×57. The right-hand header image of every inner
 *                                       page (MUI_HEADERIMAGE_BITMAP; electron-builder also
 *                                       sets MUI_HEADERIMAGE_RIGHT, so it sits at the right
 *                                       edge and the page title stays on the left).
 *
 * Both are 24-bit BMPs: NSIS's MUI loads them through Windows and 32-bit ones are not accepted.
 *
 * Regenerate: node packages/desktop/scripts/render-installer-art.mjs
 * Rasterizes via the Playwright chromium the Web App's tests already install (no new dependency
 * for this package), draws at the exact target size — no downscaling, which is what "the
 * installer looks blurry" usually is — and encodes the BMP in this script (no image library).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_DIR = path.resolve(HERE, "..");
const REPO_ROOT = path.resolve(PKG_DIR, "..", "..");
const SVG_PATH = path.join(REPO_ROOT, "packages", "web", "public", "adelie-icon.svg");
const FONT_DIR = path.join(REPO_ROOT, "packages", "ui", "src", "fonts", "misans");
const OUT_DIR = path.join(PKG_DIR, "build", "nsis");

// Resolve @playwright/test from a package that already carries it (the Web App's own test
// dependency — it is not a dependency of this package, and must not become one).
const requireHost = createRequire(path.join(REPO_ROOT, "packages", "web", "package.json"));
const { chromium } = requireHost("@playwright/test");

/**
 * The two images, and how each is laid out. `draw` runs in the page against a canvas of exactly
 * `width`×`height`; everything is drawn at native resolution.
 */
const TARGETS = [
  {
    file: "installerSidebar.bmp",
    width: 164,
    height: 314,
    art: {
      background: ["#0b1220", "#1b2b4d"],
      markSize: 84,
      markY: 88,
      wordSize: 24,
      wordY: 226,
      tagline: "local-first agents",
      taglineY: 250,
      ruleY: 194,
    },
  },
  {
    file: "installerHeader.bmp",
    width: 150,
    height: 57,
    art: {
      background: ["#ffffff", "#eef3fc"],
      markSize: 30,
      markX: 12,
      markY: 13,
      wordSize: 16,
      wordX: 50,
      wordY: 29,
    },
  },
];

const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(readFileSync(SVG_PATH, "utf8"), "utf8").toString("base64")}`;
const fontDataUrl = (name) =>
  `data:font/woff2;base64,${readFileSync(path.join(FONT_DIR, name)).toString("base64")}`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(
    `<style>
       @font-face { font-family: "MiSans"; font-weight: 400; src: url("${fontDataUrl("misans-400-latin.woff2")}") format("woff2"); }
       @font-face { font-family: "MiSans"; font-weight: 500; src: url("${fontDataUrl("misans-500-latin.woff2")}") format("woff2"); }
     </style>`,
  );
  // Wait for both faces before drawing: a canvas renders whatever the font is at draw time.
  await page.evaluate(() => document.fonts.ready);

  mkdirSync(OUT_DIR, { recursive: true });
  for (const target of TARGETS) {
    const pixels = await page.evaluate(drawArt, { svg: svgDataUrl, target });
    const bmp = encodeBmp(Buffer.from(pixels, "base64"), target.width, target.height);
    const out = path.join(OUT_DIR, target.file);
    writeFileSync(out, bmp);
    console.log(`${target.file}  ${target.width}×${target.height}  ${bmp.length} bytes`);
  }
} finally {
  await browser.close();
}

/**
 * Draw one image and hand its RGBA pixels back as base64. Runs inside the page.
 */
function drawArt({ svg, target }) {
  const { width, height, art } = target;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, art.background[0]);
  gradient.addColorStop(1, art.background[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const light = art.background[0] === "#ffffff";
      const ink = light ? "#0e1c37" : "#ffffff";
      const muted = light ? "#5b6b86" : "#9fb3d4";

      if (art.markX === undefined) {
        ctx.drawImage(img, (width - art.markSize) / 2, art.markY, art.markSize, art.markSize);
      } else {
        ctx.drawImage(img, art.markX, art.markY, art.markSize, art.markSize);
      }

      ctx.fillStyle = ink;
      ctx.textBaseline = "alphabetic";
      if (art.wordX === undefined) {
        ctx.textAlign = "center";
        // The wordmark, in the product's own typeface, sized to sit comfortably in the column.
        ctx.font = `500 ${art.wordSize}px MiSans, "DejaVu Sans", sans-serif`;
        ctx.fillText("Adelie", width / 2, art.wordY);
        // A short rule in the brand blue, then the tagline under it.
        ctx.fillStyle = "#015dfc";
        ctx.fillRect(width / 2 - 18, art.ruleY, 36, 3);
        ctx.fillStyle = muted;
        ctx.font = `400 11px MiSans, "DejaVu Sans", sans-serif`;
        ctx.fillText(art.tagline, width / 2, art.taglineY);
      } else {
        ctx.textAlign = "left";
        ctx.font = `500 ${art.wordSize}px MiSans, "DejaVu Sans", sans-serif`;
        ctx.fillText("Adelie", art.wordX, art.wordY);
      }

      const rgba = ctx.getImageData(0, 0, width, height).data;
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < rgba.length; i += chunk) {
        binary += String.fromCharCode.apply(null, rgba.subarray(i, i + chunk));
      }
      resolve(btoa(binary));
    };
    img.src = svg;
  });
}

/**
 * Encode RGBA pixels as a 24-bit uncompressed BMP: BITMAPFILEHEADER + BITMAPINFOHEADER, rows
 * bottom-up, BGR triples, each row padded to a 4-byte boundary — what NSIS/MUI loads.
 */
function encodeBmp(rgba, width, height) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowSize * height;
  const header = Buffer.alloc(54);
  header.write("BM", 0, "ascii");
  header.writeUInt32LE(54 + pixelBytes, 2); // file size
  header.writeUInt32LE(54, 10); // pixel data offset
  header.writeUInt32LE(40, 14); // BITMAPINFOHEADER
  header.writeInt32LE(width, 18);
  header.writeInt32LE(height, 22); // positive: rows are bottom-up
  header.writeUInt16LE(1, 26); // colour planes
  header.writeUInt16LE(24, 28); // bits per pixel
  header.writeUInt32LE(0, 30); // BI_RGB, no compression
  header.writeUInt32LE(pixelBytes, 34);
  header.writeInt32LE(2835, 38); // 72 DPI, both axes
  header.writeInt32LE(2835, 42);

  const pixels = Buffer.alloc(pixelBytes);
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 4;
    const dst = y * rowSize;
    for (let x = 0; x < width; x++) {
      const s = src + x * 4;
      const d = dst + x * 3;
      pixels[d] = rgba[s + 2]; // B
      pixels[d + 1] = rgba[s + 1]; // G
      pixels[d + 2] = rgba[s]; // R
    }
  }
  return Buffer.concat([header, pixels]);
}
