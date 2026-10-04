import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// 只取 env，避免为了一个变量把 node 全局类型灌进前端的类型环境（tsconfig 里 types 是空的）。
import { env } from 'node:process'

// 开发时 /api 打到本机服务端；手机连局域网里的服务端调试时用 ADELIE_API_PROXY 覆盖。
// 读环境变量而不是写死端口，是为了让「服务端跑在别的机器/别的端口」这种常见情形不用改代码。
const proxyTarget = env.ADELIE_API_PROXY ?? 'http://127.0.0.1:7370'

export default defineConfig({
  plugins: [react()],
  // 相对 base：同一份构建产物要同时满足两种部署 ——
  //   1. 服务端托管在站点根 `/`（桌面壳与 CLI 的用法）
  //   2. GitHub Pages 的子路径 `https://lmliheng.github.io/Adelie/`
  // 绝对路径 `/assets/...` 在子路径下会 404，所以用 './'。
  // 代价：SW、manifest、图标、fetch 的相对路径全部要跟着相对化（见 public/sw.js 与 register-sw.ts）。
  base: './',
  server: {
    // 手机 PWA 要连开发机，所以 dev server 监听 0.0.0.0；反代/鉴权交给服务端自己。
    host: true,
    proxy: {
      '/api': { target: proxyTarget, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
})
