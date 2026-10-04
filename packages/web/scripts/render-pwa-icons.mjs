/**
 * 生成 packages/web/public/icons/ 里的 PWA 图标。
 *
 * 为什么不直接引用 brand/icons/：Web 构建产物必须自包含（服务端只托管 dist），
 * 而品牌目录不在 dist 里。所以这里**只做复制与栅格化**，绝不改色、不改形、不改留白
 * —— brand/adelie-icon.svg 是唯一事实源。
 *
 * brand/icons/ 已有的尺寸直接复制；缺的（192 与 iOS 用的 180）按同一支 SVG
 * 在原生分辨率下渲染，避免把小图放大。
 *
 * 用法：node packages/web/scripts/render-pwa-icons.mjs
 * 依赖：playwright（借用 penguin-harness 的 landing 包）+ 本机 chromium 缓存，取法与
 *      brand/render-icons.mjs 一致。这是开发期脚本，构建与运行时都不需要它。
 */
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WEB = path.resolve(HERE, '..')
const REPO = path.resolve(WEB, '..', '..')
const BRAND_ICONS = path.join(REPO, 'brand', 'icons')
const SVG = path.join(REPO, 'brand', 'adelie-icon.svg')
const OUT = path.join(WEB, 'public', 'icons')
/** [尺寸, 输出文件名]：前两个用品牌目录里的原图复制，其余现场栅格化 */
const RENDER = [
  [512, 'icon-512.png'],
  [256, 'icon-256.png'],
  [192, 'icon-192.png'],
  [180, 'apple-touch-icon.png'],
  [32, 'icon-32.png'],
  [16, 'icon-16.png'],
]

mkdirSync(OUT, { recursive: true })
copyFileSync(path.join(BRAND_ICONS, '512x512.png'), path.join(OUT, 'icon-512.png'))
copyFileSync(path.join(BRAND_ICONS, '256x256.png'), path.join(OUT, 'icon-256.png'))

const landingPkg = process.env.PENGUIN_LANDING ?? '/root/penguin-harness/packages/landing/package.json'
const { chromium } = createRequire(landingPkg)('@playwright/test')

function findChromium() {
  if (process.env.CHROME_PATH !== undefined) return process.env.CHROME_PATH
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(os.homedir(), '.cache', 'ms-playwright')
  const newest = readdirSync(cache)
    .filter((name) => name.startsWith('chromium-'))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))[0]
  return path.join(cache, newest, 'chrome-linux64', 'chrome')
}

const svgUrl = pathToFileURL(SVG).href
const browser = await chromium.launch({ executablePath: findChromium() })
try {
  for (const [size, name] of RENDER) {
    if (name === 'icon-512.png' || name === 'icon-256.png') continue // 已复制品牌原图
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    // 直接打开 SVG（file:// 才能被浏览器解码），再把根元素的宽高写成目标尺寸：
    // viewBox 是 1024×1024，所以这是等比缩放而不是裁切，也不会有 img 跨源被拦的问题。
    await page.goto(svgUrl)
    await page.evaluate((px) => {
      const root = document.documentElement
      root.setAttribute('width', String(px))
      root.setAttribute('height', String(px))
      // SVG 文档没有 <body>，边距要写在根元素上
      root.style.margin = '0'
    }, size)
    await page.screenshot({ path: path.join(OUT, name), omitBackground: true })
    await page.close()
    console.log(`${name} ${size}x${size}`)
  }
} finally {
  await browser.close()
}
