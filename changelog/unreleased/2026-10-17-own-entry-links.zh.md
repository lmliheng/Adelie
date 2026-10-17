# 指向项目自己的链接改到 Adelie，不再指向上游的站点

- **Date:** 2026-10-17
- **Type:** process
- **Scope:** `docs`, `tooling`, `cli`

[English](2026-10-17-own-entry-links.md)

凡是把读者送到 `penguin.ooo` 或上游仓库的地方，现在都送到 Adelie 自己的入口，因此从 README、
文档、安装脚本头部或 npm 包页面点出去，落到的是与实际安装的那个版本相符的页面。

## 细节

全仓库按这张对照表替换：

| 原来 | 现在 |
| --- | --- |
| `https://penguin.ooo/install.sh`、`install.ps1` | `https://github.com/lmliheng/Adelie/releases/latest/download/install.sh`、`install.ps1` |
| `https://penguin.ooo/download` | `https://github.com/lmliheng/Adelie/releases/latest` |
| `https://penguin.ooo/docs/…` | `https://lmliheng.github.io/Adelie/docs/…` |
| `https://github.com/Prism-Shadow/penguin-harness` | `https://github.com/lmliheng/Adelie` |

- 两个安装脚本的头部注释、`docker/compose.yaml`、`.github` 下的文件（CONTRIBUTING、SECURITY、
  issue 模板配置、bug 报告里的安全策略链接、Pull Request 模板里的变更记录链接），以及 `amsp`、
  `cli`、`core`、`docs`、`server`、`web` 六个包的 README，都换成了新目标。
- `quickstart-cli` 的源码安装改成 `git clone https://github.com/lmliheng/Adelie.git` 与
  `cd Adelie`；其中 THIRD-PARTY-NOTICES 的链接指向本仓库自己的文件。
- `packages/docs/src/lib/links.ts`（文档站的仓库、API、许可地址）与 `packages/ui-gallery` 的
  发布页链接指向本仓库，文档站的「编辑此页」和画廊的链接示例不再跳出去。
- `packages/{amsp,cli,core,hmr,server}/package.json` 的 `repository` 字段改指本仓库，也就是 npm
  包页面上显示的源码地址。
- `CODE_OF_CONDUCT.md` 里指向中文版的链接改回相对路径，两个版本在检出内部互相链接，不再跳上游。
- 挂在 `:3003` 的需求箱页面里，发布链路图上 npm registry 那个节点由退役的 `@lmliheng/penguin-*`
  改为 `@adelie/*`。
- `agent-development` 插件里那份 `penguin-sdk` 参考同样换了新地址，该插件的 `plugin.json` 升到
  `2026.10.17.2`，已安装的副本因此能看到这次更新。

## 有意保留指向上游的地方

- `token.penguin.ooo` 与 `go.penguin.ooo/modelscope`：ModelScope 桥接与平台登录跑在上游服务器上，
  地址与它们的 `penguin-harness` 客户端标识保持原样。
- 两个 README 里的归属与警示段落、`docs/FORK.md` 的「上游」一行：这些是特意写明上游的。
- Dockerfile 的 OCI source 标签：镜像发布在上游的 Docker Hub 命名空间下。
- 发布资产名（`penguin-linux-x64.tar.gz` 等）、`penguin` 命令与 `PENGUIN_*` 环境变量。
