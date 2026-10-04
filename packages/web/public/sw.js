/**
 * Adelie 的 Service Worker（手写，没有构建步骤）。
 *
 * **一切路径都以 sw.js 自己所在的目录为基准**（`BASE`），不写死 `/`。
 * 原因：构建产物的 base 是 './'，同一份 dist 会同时挂在站点根 `/`（服务端托管）
 * 和 GitHub Pages 的子路径 `/Adelie/` 下。写死 `/index.html` 的预缓存清单在子路径
 * 下会指到站点根，装上去就是个坏的离线外壳。
 *
 * 三条规则，对应三种请求：
 *   1. 路径里含 `/api/` —— 一律 network-only，**绝不缓存**。会话历史与配置带鉴权、
 *      且随时在变；缓存一份过期 JSON 会让「刚说的话不见了」这种最难查的问题出现。
 *   2. 导航请求 —— network-first，成功就顺手把这份 HTML 存下来，失败回落到缓存的
 *      外壳。这样离线打开不会白屏。
 *   3. 其它同源 GET（构建出来的 hash 资源、图标）—— cache-first + 后台更新。
 *      hash 资源内容永不改变，缓存命中即正确。
 *
 * 外壳预缓存：构建产物的文件名带 hash，无法在 SW 里写死，所以安装时先取外壳 HTML，
 * 从里面解析出 script/link 的 URL 再逐个缓存 —— 比写死清单更耐构建变化。
 */

const VERSION = 'v1'
const SHELL_CACHE = `adelie-shell-${VERSION}`
const ASSET_CACHE = `adelie-assets-${VERSION}`

/** sw.js 所在目录：站点根下的 / 或 Pages 下的 /Adelie/ */
const BASE = new URL('./', self.location.href)
const SHELL_HTML = new URL('index.html', BASE)
/** 外壳至少要有这些（相对 BASE 解析），缺一个就等于离线必然白屏 */
const CORE_SHELL = ['', 'index.html', 'manifest.webmanifest', 'adelie-glyph.svg'].map(
  (path) => new URL(path, BASE).href,
)

/** 离线且外壳也没缓存时给出的兜底页面：给一句人话，而不是浏览器的白屏 */
const OFFLINE_HTML = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>未连接到 Adelie 服务端</title>
<style>
  html,body{margin:0;height:100%}
  body{display:flex;align-items:center;justify-content:center;background:#fff;color:#111827;
       font-family:ui-sans-serif,system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
  @media (prefers-color-scheme: dark){body{background:#000;color:#f3f4f6}}
  main{max-width:22rem;padding:24px;border:1px solid currentColor;border-radius:12px;text-align:center}
  h1{font-size:16px;font-weight:600;margin:0 0 8px}
  p{font-size:13px;line-height:1.6;opacity:.7;margin:0}
</style></head>
<body><main><h1>未连接到 Adelie 服务端</h1>
<p>这台设备现在离线。请连上服务端所在的网络后重新打开 Adelie。</p></main></body></html>`

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      // 逐个 add 而不是 addAll：一个 URL 拿不到不该让整次安装失败。
      await Promise.all(
        CORE_SHELL.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: 'reload' }))
          } catch {
            /* 缺就缺，后面导航回落会兜底 */
          }
        }),
      )
      // 从外壳 HTML 里挖出带 hash 的构建资源（相对路径也要能解析）
      try {
        const response = await fetch(SHELL_HTML.href, { cache: 'reload' })
        const html = await response.text()
        const urls = extractAssetUrls(html)
        await Promise.all(
          urls.map(async (url) => {
            try {
              await cache.add(new Request(url, { cache: 'reload' }))
            } catch {
              /* 单个资源失败不阻断安装 */
            }
          }),
        )
      } catch {
        /* 外壳不完整也能装，下一次导航会补齐 */
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => name.startsWith('adelie-') && name !== SHELL_CACHE && name !== ASSET_CACHE)
          .map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // 外域请求（比如手机连的局域网服务端）一律不碰

  // 1. API：network-only。连不上时回一个 503 JSON，让前端走它自己的错误态，
  //    而不是收到一个「不像 JSON 的」缓存响应。
  //    用 includes 而不是前缀匹配：服务端挂在站点根（/api/...），但 Pages 部署时
  //    这个 SW 的 scope 是 /Adelie/，硬编码 '/' 前缀会让规则永远匹配不到。
  if (url.pathname === '/api' || url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(JSON.stringify({ error: 'offline', message: '未连接到 Adelie 服务端' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )
    return
  }

  // 2. 导航：network-first + 离线回落
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request)
          const cache = await caches.open(SHELL_CACHE)
          cache.put(SHELL_HTML.href, response.clone())
          return response
        } catch {
          const cached =
            (await caches.match(request, { ignoreVary: true })) ??
            (await caches.match(SHELL_HTML.href, { ignoreVary: true }))
          return (
            cached ??
            new Response(OFFLINE_HTML, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
          )
        }
      })(),
    )
    return
  }

  // 3. 其它同源静态资源：cache-first + 后台更新
  event.respondWith(
    (async () => {
      // ignoreVary 是必须的，不是优化：静态服务器常带 `Vary: Origin`，
      // 而安装期由 SW 自己发起的预缓存请求不带 Origin、页面发起的模块/样式请求带 ——
      // 不忽略 Vary 就会「明明缓存里有，离线时还是 ERR_FAILED」，表现是白屏。
      const cached = await caches.match(request, { ignoreVary: true })
      const network = fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(ASSET_CACHE)
            cache.put(request, response.clone())
          }
          return response
        })
        .catch(() => undefined)
      if (cached !== undefined) {
        event.waitUntil(network)
        return cached
      }
      const response = await network
      return response ?? Response.error()
    })(),
  )
})

/**
 * 从 HTML 里抠出脚本 / 样式 / 图标地址。
 *
 * 构建产物里的引用是**相对**的（base 是 './'），所以这里必须按外壳 HTML 的地址解析，
 * 而不是只认以 '/' 开头的。外域、api、manifest 都不要（manifest 已经单独缓存）。
 */
function extractAssetUrls(html) {
  const urls = new Set()
  const attr = /(?:src|href)\s*=\s*"([^"]+)"/g
  let match
  while ((match = attr.exec(html)) !== null) {
    const value = match[1]
    if (value === undefined || value === '') continue
    if (value.startsWith('data:') || value.startsWith('//')) continue
    let resolved
    try {
      resolved = new URL(value, SHELL_HTML)
    } catch {
      continue
    }
    if (resolved.origin !== self.location.origin) continue
    if (resolved.pathname.includes('/api/')) continue
    if (resolved.pathname.endsWith('.webmanifest')) continue
    urls.add(resolved.href)
  }
  return [...urls]
}
