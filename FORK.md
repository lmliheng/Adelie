# Adelie 是 PenguinHarness 的一个 fork

这个仓库（`lmliheng/Adelie`）的 `fork/penguin-base` 分支，**整棵代码树来自 PenguinHarness**，
不是我们自己写的。这份文件说明来源、许可证义务、以及 Adelie 打算在这个基座上改什么 ——
Apache-2.0 第 4 条要求把改动说清楚，所以它不是可选的。

## 来源

| | |
| --- | --- |
| 上游 | <https://github.com/Prism-Shadow/penguin-harness> |
| 本机克隆 | `/root/penguin-harness`（`develop` 分支） |
| 基座提交 | `18d7c137a1f1`（2026-10-04 取） |
| 许可证 | Apache-2.0（见 `LICENSE`；第三方声明见 `THIRD-PARTY-NOTICES.md`） |
| 我们的 fork | <https://github.com/lmliheng/penguin-harness>（同一上游的 clone） |

`git remote -v` 里的 `upstream` 指向上游，用来继续跟进：

```bash
git fetch upstream
git merge upstream/develop        # 在 fork/penguin-base 上
```

## 许可证义务（照做，别省）

- **保留 `LICENSE` 与 `THIRD-PARTY-NOTICES.md`**，以及源码里各处的版权头。删掉它们就等于
  把这份 fork 变成侵权产物。
- **不能用 PenguinHarness / PrismShadow 的名字与商标**做我们产品的名号、图标或域名。
  上游的名字出现在「来源说明」里是正当的（指明出处），出现在 Adelie 的界面上不是。
  `packages/ui` 里那套界面文案、字体（MiSans 有单独的授权，见 NOTICE）改名时一并处理。
- 改过的文件要能看出改过（本文件 + 每个提交的说明就是这条的落实方式）。

## Adelie 在这个基座上要改什么

按顺序，每条都要求「本机能跑起来 + 有可复现的命令与输出」：

1. **跑起来**：本机安装、构建、测试、起服务、真浏览器看一眼。先证明基座在这台机器上是活的。
2. **自有化**：包名 `@prismshadow/*` → Adelie 自己的 scope；数据根 `~/.penguin` → `~/.adelie`；
   端口、图标、文案、README；上游的 `landing` / `docs` / `ui-gallery` / `hmr` 四个包逐个人拍板去留。
3. **接回 Adelie 已经做过的东西**，或判定上游已经覆盖、直接删：审批口径三档、模型目录
   （deepseek / kimi / qwen）、用量与成本页、用户与两档角色、会话归属、桌面壳。
4. **发布链路**：npm scope、GitHub Pages（PWA）、设计站、Windows 安装包。

## 旧的 Adelie 在哪

`main` 分支上是**旧的 Adelie**（自己写的引擎 + 外壳：`adelie-core/providers/tools/runtime`、
`@lmliheng/adelie` CLI、Electron 桌面壳、Web/PWA、六个 npm 包、设计站与发布流水线）。
它没有被删：`main` 就是它的落点，四件已发布的产物也都还在线上。要不要下架或重发，等新基座
能跑起来之后由人拍板。

> 工作方式：动这份基座用 `git worktree`（`/root/adelie-fork`），**不要**在 `/root/Adelie`
> 的工作区里切分支 —— `adelie-web.service` 直接读 `/root/Adelie/packages/{server/dist,web/dist}`，
> 切过去会把线上那个 Adelie Web 换成另一个服务端。
