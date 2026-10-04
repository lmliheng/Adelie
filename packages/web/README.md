# adelie-web

Adelie 的 Web 应用与可安装 PWA：会话列表 + 流式对话 + 工具时间线 + 审批 + 设置。
接口只按 [`docs/api.md`](../../docs/api.md) 调，服务端由 `packages/server` 提供。

- 视觉语言：Penguin 的 web-design 规范（GitHub 式简洁、1px 发丝边框、系统字体、
  单一蓝色强调、深色纯黑 `#000`、圆角 6/12px、动效 120–280ms、`prefers-reduced-motion`）。
  样式是手写 CSS + CSS 变量，在 [`src/styles/global.css`](src/styles/global.css)；没有引入
  Tailwind（同目录已装，但手写 CSS 更好控制 token 与发丝边框）。
- 移动优先：基础样式就是手机单列，`min-width` 查询才加列；输入框用 `dvh` + 安全区；
  点击目标 ≥ 40px。
- 中文界面（`<html lang="zh-CN">`），代码标识符英文。

## 开发

```bash
# 仓库根目录
pnpm install

# 起后端（另一个包，默认 127.0.0.1:7370）
pnpm --filter adelie-server dev

# 起前端（vite dev，/api 代理到 7370）
pnpm --filter adelie-web dev
#   http://localhost:5173

# 后端在别处（别的机器 / 别的端口）时用环境变量覆盖代理目标
ADELIE_API_PROXY=http://192.168.1.5:7370 pnpm --filter adelie-web dev
```

dev server 监听 `0.0.0.0`，所以手机连同一局域网就能直接打开开发机上的页面。

```bash
pnpm --filter adelie-web typecheck   # tsc --noEmit
pnpm --filter adelie-web test        # vitest（纯逻辑单测：SSE 分帧 / 凭据 / 事件→时间线）
pnpm --filter adelie-web build       # 产物在 packages/web/dist
pnpm --filter adelie-web preview     # 本地预览构建产物（PWA 只在生产构建里注册）
```

## 构建与部署

`vite.config.ts` 里 **`base: './'`（相对路径）**，同一份 `dist` 要同时满足两种部署：

| 部署 | 地址 | 说明 |
| --- | --- | --- |
| 服务端托管 | `http://127.0.0.1:7370/` | 服务端托管 `packages/web/dist`，非 `/api/*` 路径回落到 `index.html` |
| GitHub Pages | `https://lmliheng.github.io/Adelie/` | 静态外壳，没有后端：打开后显示「未连接到 Adelie 服务端」，在设置里填服务端地址即可用 |

绝对路径（`/assets/...`、`/sw.js`、`/icons/...`）在子路径部署下会 404，所以：

- `index.html` 里的 manifest / 图标 / 脚本引用都是相对的；
- 应用内拼图标路径用 `import.meta.env.BASE_URL`（见 `EmptyState.tsx`）；
- Service Worker 用 `new URL('sw.js', document.baseURI)` 注册（见 `src/register-sw.ts`），
  scope 由浏览器按脚本目录推导，正好是部署根；
- `public/sw.js` 内部所有路径都以 `self.location` 为基准解析，预缓存清单也按外壳 HTML 的
  地址解析（见 `sw.js` 顶部注释）。

**PWA 与服务端地址**：站点是静态的，服务端地址不是 —— 同源访问（服务端就在本机）时留空即可；
从手机访问时到「设置 → 服务端连接」填局域网地址（`http://192.168.1.5:7370`）与 token，
存在 localStorage 里，下次打开还在。

## 把 PWA 装到手机

1. 在要当服务端的机器上跑 `pnpm serve`（或 `pnpm --filter adelie-server dev`）；
   首次绑定非回环地址时服务端会打印一个带 token 的地址，例如
   `http://192.168.1.5:7370/?token=abc123`。
2. 手机与这台机器在同一个 Wi-Fi 下，用手机浏览器打开服务端打印的地址
   （或者开发时打开 `http://<开发机IP>:5173`）。
3. 在应用里「设置 → 服务端连接」粘贴那个带 token 的地址：粘贴时会自动把 token 拆出来，
   点「测试连接」确认，再「保存」。
4. 装到桌面：iOS Safari「分享 → 添加到主屏幕」；Android Chrome「⋮ → 添加到主屏幕 / 安装应用」。
   `manifest.webmanifest` 里 `display: standalone`，装完就是全屏、无地址栏。
5. token 不是必须的：只有服务端绑定了非回环地址或设置了 `ADELIE_TOKEN` 时才需要。

离线行为：Service Worker 预缓存应用外壳，`/api/*` 一律 network-only。断网打开不会白屏 ——
有外壳就用外壳（应用自己显示「未连接到 Adelie 服务端」），连外壳都没有时 SW 返回一张内联的
离线说明页。

Service Worker **只在生产构建里注册**（`import.meta.env.PROD`）：dev server 走 Vite 的模块图，
和 SW 的 cache-first 叠在一起会出现「改了代码页面不变」这类最难查的问题。

## 目录

```
index.html                  入口（lang=zh-CN / manifest / theme-color / 图标）
vite.config.ts              react 插件、base './'、/api 代理、build.outDir=dist
vitest.config.ts            单测配置（environment: node）
public/manifest.webmanifest PWA 清单（start_url/scope/icons 全相对）
public/sw.js                手写 Service Worker（外壳预缓存 / api 不缓存 / 离线回落）
public/icons/               PWA 图标（由 scripts/render-pwa-icons.mjs 从 brand/ 生成，别手改）
scripts/render-pwa-icons.mjs 复制 brand/icons/ 的原图 + 按 SVG 渲染缺的尺寸（开发期脚本）
src/main.tsx                挂载 + 注册 SW
src/App.tsx                 组装：顶栏 / 侧栏（含左栏导航） / 页面 / 输入框 / 命令面板 / 设置 / Toast
                           （唯一一份命令表与唯一的键位分发器也在这里）
src/api/client.ts           fetch 封装、ApiError、POST 的 SSE 流式读取（唯一出口）
src/api/sse.ts              SSE 分帧解析（纯函数，单测覆盖）
src/api/types.ts            docs/api.md 的 wire 类型
src/hooks/useAdelie.ts      状态机：连接 / 会话 / 流 / 审批 / 配置
src/hooks/useRoute.ts       路由的浏览器那一半（pushState + popstate）
src/hooks/useTheme.ts       深浅色（跟随系统 + 手动持久化）
src/hooks/useToast.ts       轻提示
src/lib/timeline.ts         事件 → 时间线条目（纯函数，单测覆盖）
src/lib/history.ts          事件 → 轮次（回放用）
src/lib/credentials.ts      凭据读写 + 地址归一化（纯函数，单测覆盖）
src/lib/format.ts           时间 / token / 时长文案
src/lib/theme.ts            主题应用与 theme-color 同步
src/lib/shortcuts.ts        键位规格解析 / 事件归一 / 命令过滤（纯函数，单测覆盖）
src/lib/sections.ts         设置分节与可见性谓词（纯函数，单测覆盖）
src/lib/router.ts           路径归一 / 部署根 / 路径 → 页面（纯函数，单测覆盖）
src/lib/composer-options.ts 输入区两个下拉的候选与三档审批口径（纯函数，单测覆盖）
src/components/*            顶栏、侧栏、导航 rail、占位页、时间线卡片、审批卡、输入区控件带、
                            设置、命令面板、用户面板、空态…
```

**路由**是自写的 60 行（`lib/router.ts` + `hooks/useRoute.ts`），没有引 react-router：
`base: './'` 下 `basename` 有歧义（`'./'` 不是合法 basename），而部署根已经在
`register-sw.ts` 里解过一次（`new URL('.', document.baseURI)`），沿用同一招更省事。
五个导航页现在是占位（`components/PlaceholderPage.tsx`），推进顺序见
[`docs/web-progress.md`](../../docs/web-progress.md)。

## 重新生成 PWA 图标

```bash
node packages/web/scripts/render-pwa-icons.mjs
```

只做复制与栅格化，不改色不改形：`brand/adelie-icon.svg` 是唯一事实源。
依赖 playwright + 本机 chromium 缓存（与 `brand/render-icons.mjs` 取法一致），
构建与运行都不需要它。

## 本地没有后端时怎么验界面

`docs/api.md` 就是契约，照着写一个只回契约事件的假 SSE 服务端即可（`packages/web` 之外，
不要提交进仓库）。要点：

- `GET /api/health` / `/api/config` / `/api/tools` / `/api/sessions`（含一条历史会话）先回上；
- `POST /api/sessions/:id/messages` 按 `event: delta\ndata: {...}\n\n` 分帧，依次发
  `run_started` → `delta(reasoning)` → `event(decision/observation)` →
  `approval_request`（等到 `POST /api/sessions/:id/approvals` 再往下走）→ `delta(content)` →
  `event(stopped)` → `run_finished` → `done`；
- `GET /api/sessions/:id` 回同一批事件（`{v,seq,ts,type,payload}`），这样刷新页面能验证历史回放。

把 `ADELIE_API_PROXY` 指到它，就能把流式解析、时间线、审批、断流提示全部走一遍。
`data-testid`（`approval` / `send` / `messages` / `tool-card` / `tool-body` / `open-settings` /
`open-palette` / `open-users` / `sidebar-toggle` / `nav-<页面id>`）就是给这类端到端脚本用的钩子。

## 已知边界

- **思考过程只在实时那一轮可见**：`reasoning` 走 `delta` 增量，契约里它不进事件流
  （`docs/api.md` 第 4 节 + core 的 `onStreamDelta` 注释），所以刷新后无法重放。
  历史里的「想法」来自决策自带的 `thought`，挂在对应工具卡里。
- **断流后不能重新挂上同一轮**：契约没有「订阅进行中的 run」的接口，所以中断后给的是
  「重新发送这条任务」与「从服务端重新同步」两个动作；若服务端仍在跑，重发会得到 409 `busy`
  并把原因显示出来。
- **GitHub Pages 上 `/api` 不可用**（静态托管），此时按离线态处理，要用得在设置里填服务端绝对地址。
- Service Worker 的缓存名带版本（`adelie-shell-v1` / `adelie-assets-v1`），改外壳逻辑时要一起升版本。
