# 官网快照（penguin.ooo）

这个目录里是上游 **PenguinHarness 官网**的一份构建产物：首页（`/`）、下载页（`/download/`）、
博客（`/blog/`，33 篇）、文档站（`/docs/`，39 页）、组件画廊（`/gallery/`）。

**它不是本站的源码，也不是手写页面** —— 是一份外部站点的快照，放在这里只为了让这个仓库的
GitHub Pages 能把它挂出来（`https://lmliheng.github.io/Adelie/`）。

## 来源与如何重新生成

| | |
| --- | --- |
| 上游仓库 | <https://github.com/Prism-Shadow/penguin-harness>（Apache-2.0） |
| 上游提交 | `0eafa6dc`（2026-10-16），站点包版本 0.2.16 |
| 构建方式 | `git clone --depth 1 <上游>` → `pnpm install` → `BASE_PATH=/Adelie/ node scripts/build-site.mjs` |
| 基路径 | `/Adelie/`（`BASE_PATH` 与环境变量同名；必须是这个值，页面里的资源与路由都按它生成） |
| 产物位置 | 上游 `packages/landing/dist`（建站脚本把 docs 放在 `docs/`、画廊放在 `gallery/`） |
| 本目录大小 | 约 33 MB（画廊占 24 MB：mermaid / cytoscape / 代码高亮） |

刷新一份新快照：按上表重新构建，然后把 `packages/landing/dist/` 的内容**整个换掉**本目录，
并把 `sitemap.xml` 与 `robots.txt` 里的域名从 `https://penguin.ooo/Adelie/` 改成本站地址
（这两处是脚本按生产域名生成的，只有这两个文件需要改）。

**不要手改这个目录里的 HTML/JS/CSS。** 那些文件由上游的 Vite 构建生成，资源路径与路由都按
`BASE_PATH` 固化在产物里；手改会在下一次换快照时丢失，也容易改出只有某个路由才现形的坏链接。

## 版权

站点内容、商标与代码均属于其原作者（Prism Shadow / PenguinHarness），按 Apache-2.0 原样转载，
未作修改；这里只提供镜像托管。上游生产站点是 <https://penguin.ooo/>。
