# Adelie 仓库文档

Adelie 这个 fork 自己的说明文档都放在这个目录里，仓库根只留约定俗成的那几份
（`README.md` / `README.zh.md`、`CHANGELOG.md` / `CHANGELOG.zh.md`、`THIRD-PARTY-NOTICES.md`、`LICENSE`）。

| 文件                                       | 讲什么                                                            |
| ------------------------------------------ | ----------------------------------------------------------------- |
| [`FORK.md`](FORK.md)                       | 为什么有这份 fork、上游是谁、许可证义务、改名与复刻做到哪一步     |
| [`FORK-PROGRESS.md`](FORK-PROGRESS.md)     | 逐轮的进度台账：每轮改了什么、验过什么、还欠什么                  |
| [`releases/`](releases/)                   | 各版本的发布正文 `RELEASE-v<版本>.md`（GitHub Release 的正文取它） |

仓库里别处的文档：

- `README.md` / `README.zh.md`（仓库根）——项目门面：卖点、安装、系统需求。
- [`../packages/docs/`](../packages/docs/)——面向用户的文档站（`pnpm dev:docs`），内容是
  `packages/docs/content/<slug>.<zh|en>.md`，导航由 `src/lib/nav.ts` 定义。
- [`../CHANGELOG.md`](../CHANGELOG.md)——每个版本一行，链到对应的 `changelog/<版本>/`。
- [`../changelog/`](../changelog/)——上游的逐条变更记录（`<版本>/YYYY-MM-DD-<slug>.md`），
  历史原文，不动。
- [`../.github/CONTRIBUTING.zh.md`](../.github/CONTRIBUTING.zh.md)——上游的工作区指南
  （开发命令、质量门禁、仓库结构、changelog 规则）；`CODE_OF_CONDUCT`、`SECURITY` 与 PR 模板
  同在 `.github/` 下。

> 加新文档时：fork 自己的说明放这个目录，逐条变更记进 `changelog/unreleased/`，面向用户的
> 文档页放 `packages/docs/content/`——仓库根不再新增 `.md`。
