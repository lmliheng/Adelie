# Adelie v0.2.0 —— 基于 PenguinHarness 的新基座（源码版）

**这一版是 Adelie 换基座后的第一个版本：整棵代码树 fork 自
[PenguinHarness](https://github.com/Prism-Shadow/penguin-harness)。** Adelie 自己的引擎从这一版
起不再使用；引擎、Web 前端、协议都来自上游，Adelie 长在它上面做产品化。

## 基于哪个版本

| | |
| --- | --- |
| 上游 | [Prism-Shadow/penguin-harness](https://github.com/Prism-Shadow/penguin-harness)（Apache-2.0） |
| 基座提交 | `18d7c137a1f1`（上游 `develop`，2026-10-04 取） |
| 本版分支 | `fork/penguin-base` |
| 上游与许可证义务的说明 | [`FORK.md`](../FORK.md) |
| 改到哪一步了 | [`FORK-PROGRESS.md`](../FORK-PROGRESS.md) |

## 这一版改了什么（相对基座）

1. **品牌自有化**：界面与全仓文案里的产品名统一成 Adelie（140 个文件；`LICENSE`、
   `THIRD-PARTY-NOTICES.md`、`changelog/` 等法律与历史原文不动）；界面图标换成 Adelie 自己的
   标志（`packages/{web,docs,ui-gallery}/public/adelie-icon.svg`）。默认 system prompt 里含产品名，
   因此内核版本一并推进到 `2026-10-05`，旧 prompt 哈希进了 `KERNEL_SUPERSEDED_TAB_HASHES`。
2. **删掉上游官网**：`packages/landing`（官网 + 博客 + 下载页，163 个文件）与只为它存在的
   `scripts/build-site.mjs`、`.github/workflows/pages.yml` 一并删除，各处引用清理干净。
   上游文档站（`packages/docs`）留作内部参考。
3. **README 重写**：两份 README（中/英）现在都写明「Adelie 是 PenguinHarness 的 fork」、
   上游渠道与商标归属，并把安装一节改成**本仓库已验证的从源码运行方式**。
4. **上游发布流水线停用**：`.github/workflows/release.yml` 原本由 `v*` tag 触发，会构建并发布
   上游的 npm 包（`@penguinharness/*`、`@prismshadow/penguin-*`）与安装包 —— 对本仓库是错的，
   已改成只能手动触发（`workflow_dispatch`），Adelie 自己的发布流水线待重写。

## 能不能直接装？—— 这一版只能从源码跑

**本版不含任何二进制产物。** 没有 Adelie 的 npm 包、安装包、Docker 镜像或下载页：那是发布链路的
最后一步（`FORK-PROGRESS.md` §4）。`@prismshadow/penguin-*` 那些包名、`~/.penguin/data` 数据根、
`penguin` 命令名仍是上游拼写，改名与自己的产物一起做。

从源码运行（本机实测过的命令）：

```bash
pnpm install --frozen-lockfile \
  --filter @prismshadow/penguin-core --filter @prismshadow/penguin-ui \
  --filter @prismshadow/penguin-server --filter @prismshadow/penguin-web \
  --filter @prismshadow/penguin-cli --filter @prismshadow/penguin-hmr

pnpm -r --filter @prismshadow/penguin-core --filter @prismshadow/penguin-server \
        --filter @prismshadow/penguin-web run build

cd packages/server
PENGUIN_HOME=<数据根> HOST=0.0.0.0 PORT=<端口> node dist/index.js
```

首次启动会打印一条「首次登录链接」，打开它认领内置 `admin` 账号并设置密码；模型在应用内的
**模型库**页配置（需要至少一个 API key）。细节见 [README](../../README.md)。

仓库内各 `package.json` 的版本号仍是上游的编号（`0.2.13`），**这是有意的**：Adelie 的版本号
（本版 `v0.2.0`，接在旧 Adelie 的 `v0.1.0` 之后）与包版本一起改，属发布链路里 npm scope 改名那一步
（`FORK-PROGRESS.md` §4.1）。

> [!WARNING]
> 上游那些安装方式（`curl https://penguin.ooo/install.sh | sh`、
> `npm install -g @prismshadow/penguin-cli`、`docker run hiyouga/penguinharness`、
> penguin.ooo 上的桌面安装包）装出来的是 **PenguinHarness**，不是 Adelie。

## 质量门禁（本机跑过）

- 单元/集成测试：**8485 通过 / 7 跳过 / 0 失败**（docs 62 · core 1346 · ui 999 · server 2552 ·
  cli 509 · web 2886 · ui-gallery 131）
- `pnpm lint`（oxlint）0 警告；`pnpm format:check`（prettier）干净；各包 `typecheck` 通过；
  `sh scripts/test-installer.sh` 通过
- 本机部署在 3004 端口真机跑通（登录、界面、图标）

## 许可证与义务

Adelie 是 PenguinHarness 的 fork，以同一协议 **Apache-2.0** 发布：`LICENSE`、
`THIRD-PARTY-NOTICES.md` 与源码里的版权头一律保留；本仓库做过的改动都在提交历史与
[`FORK-PROGRESS.md`](../FORK-PROGRESS.md) 里写明。PenguinHarness / PrismShadow 的名字与商标属于上游，
Adelie 不拿它们当自己的名号、图标或域名；上游的官网、文档、博客、Discord、X、微信、Product Hunt
等渠道是上游的，不是 Adelie 的。

## 已知待办

自有化（数据根、端口、命令名）、接回旧 Adelie 的能力（用量与成本页、模型目录、审批口径、
用户与角色）、用真模型端到端跑一条消息、npm scope 改名与发布流水线重写、旧四件产物按新基座
更新重发 —— 清单在 [`FORK-PROGRESS.md`](../FORK-PROGRESS.md)。
