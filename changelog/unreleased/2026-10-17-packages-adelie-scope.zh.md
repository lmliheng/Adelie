# 仓库自己发布的包全部迁到 `@adelie` 作用域

- **Date:** 2026-10-17
- **Type:** refactor
- **Scope:** `core`, `server`, `cli`, `plugins`, `tooling`
- **Breaking:** yes — 每个对外包的名字都变了（见「兼容」）

[English](2026-10-17-packages-adelie-scope.md)

仓库自己的包现在都带 `@adelie/` 前缀。三个宿主包是 `@adelie/core`、`@adelie/server`、
`@adelie/cli`；`packages/` 下的包去掉 `penguin-` 前缀，成为 `@adelie/ui`、`@adelie/web`、
`@adelie/ui-gallery`、`@adelie/hmr`、`@adelie/desktop`、`@adelie/docs`；二十个插件保留原名换作用域
（`@adelie/agent-company`、`@adelie/goal`、`@adelie/use-wps-office` 等），四个沙盒适配器成为
`@adelie/sandbox-bwrap`、`@adelie/sandbox-dsh`、`@adelie/sandbox-seatbelt`、`@adelie/sandbox-wsl`。
`@adelie/amsp` 保持它已有的名字。

作用域不只在清单里，也编进了代码：core 的 `PLUGIN_PKG_PREFIX`、服务端的 `PLUGIN_SCOPE`、
桌面打包器收集插件包用的过滤条件，以及 `penguin update` 里识别 pnpm 全局安装的那处判断，
现在都读 `@adelie/`，各自那条把它钉住的测试也一并改了。服务端与四个沙盒适配器的 `ifaces.json`
（生成文件）、安装脚本、Dockerfile 与文档里的包名同样跟着改。

## 兼容

依赖仓库自己发布的包的地方要一起改：`@lmliheng/penguin-core` 变 `@adelie/core`，
`@lmliheng/penguin-server` 变 `@adelie/server`，`@lmliheng/penguin-cli` 变 `@adelie/cli`。
命令行改用 `npm install -g @adelie/cli` 安装，它放进 `PATH` 的命令仍是 `penguin`。
Project 的 `[plugins]` 表里写的插件名也要换成新的（如 `@adelie/requirements-box`）。

旧版本用过的名字在注册表上原样保留，已经钉住它们的安装继续能解析；发布这版名字的那次发版
会把它们标记为失效，指向新名字。

其余都没改：`penguin` 与 `penguin-hmr` 两个命令、`PENGUIN_*` 环境变量、以及
`github.com/lmliheng/Adelie` 这个仓库，都保持原样。
