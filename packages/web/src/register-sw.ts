// src/register-sw.ts
//
// 注册 Service Worker。
//
// **路径必须是相对的**：构建 base 是 './'，同一份 dist 既可能挂在站点根 `/`，
// 也可能挂在 GitHub Pages 的 `/Adelie/` 下。写死 '/sw.js' 在子路径部署时会去站点根找
// （404 或注册到别人的 scope），所以用 `new URL('sw.js', document.baseURI)` ——
// 它解析出的是「当前页面所在部署根」下的 sw.js，scope 由浏览器按脚本路径推导，
// 正好是那个部署根。
//
// **只在生产构建里注册**：dev server 走 Vite 的模块图（/src/*.ts 实时编译、HMR），
// 而 SW 对同源静态资源是 cache-first —— 两者一叠加就会出现「改了代码页面不变」
// 这类最难查的问题。构建产物里资源名带 hash、内容不变，cache-first 才是正确的。
//
// 注册失败（不支持、http 非安全上下文、被策略拦）一律只警告：外壳功能不该因此失效。

export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    const url = new URL('sw.js', document.baseURI)
    void navigator.serviceWorker.register(url.href).catch((error: unknown) => {
      console.warn('[adelie] Service Worker 注册失败，离线外壳不可用（不影响在线使用）', error)
    })
  })
}
