# Adelie 是 PenguinHarness 的一个 fork

这个仓库（`lmliheng/Adelie`）的 `main` 分支，**整棵代码树来自 PenguinHarness**
（2026-10-05 之前这条线叫 `fork/penguin-base`，当天并入 `main` 并删掉旧名），
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
git merge upstream/develop        # 在 main 上
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
   端口、图标、文案、README；上游的 `landing`（已删）/ `docs`（留作内部参考）/ `ui-gallery`
   （留）/ `hmr`（`packages/server` 的依赖，必留）。
3. **接回 Adelie 已经做过的东西**，或判定上游已经覆盖、直接删：~~审批口径三档~~（2026-10-07 **判定
   上游已覆盖**，对照表与证据见 `FORK-PROGRESS.md` 的「第十二轮」）、~~模型目录
   （deepseek / kimi / qwen）与费率表~~（2026-10-07 **判定上游已覆盖**，见「第十四轮」）、~~用量与
   成本页~~（2026-10-07 **判定上游已覆盖**，见「第十五轮」；同一原则「只落 token、成本查询时现算」，
   界面上比旧的多出错误面板与四张图）、用户与两档角色、会话归属、桌面壳。
4. **发布链路**：npm scope、GitHub Pages（PWA）、设计站、Windows 安装包。

进度与每条待办记在 `FORK-PROGRESS.md`（本文件讲「为什么这样改」，它讲「改到哪了」）。

### 已经改掉的（Apache-2.0 §4 要求的改动声明，2026-10-05 起）

- **更新链路只连 Adelie 自己的 Releases**。`penguin update`、Web 的「有新版本」提示与它的发布页
  链接、桌面端的自动更新 feed、根目录两个安装脚本，以及插件库的来源元数据
  （`server/src/plugin/builtin-index.json` 与 `plugins/*/package.json`）都指向 `lmliheng/Adelie`。
  上游那套 Alibaba Cloud OSS 镜像**没有跟着搬过来**（镜像是项目自己的账号与账单），所以下载源
  只剩 GitHub，`PENGUIN_DOWNLOAD_SOURCE=oss`（CLI 与两个安装脚本）会被明确拒绝而不是默默回落到
  auto。桌面端的「速度探测 + 镜像 feed」子系统与安装脚本里的 `SPEED_PROBE_*` 整套也一并删掉了；
  自建镜像改用自己的 base URL / feed（`PENGUIN_DOWNLOAD_BASE_URL`、`PENGUIN_UPDATE_FEED_URL`）。
- **模型库里没有「官方推荐」了**。上游把 TokenDance 分组标为 `recommended` 并在模型库页面挂
  「官方推荐 / Recommended」标签；Adelie 删掉了这个标记（推荐哪家网关是上游的商业选择，不是我们
  的）。分组的默认顺序没有变。

## 旧的 Adelie 在哪

`legacy/main` 分支上是**旧的 Adelie**（自己写的引擎 + 外壳：`adelie-core/providers/tools/runtime`、
`@lmliheng/adelie` CLI、Electron 桌面壳、Web/PWA、六个 npm 包、设计站与发布流水线），工作区是
`/root/Adelie`。它没有被删，只是不再是主线：2026-10-05 把新基座并进 `main` 之前，先把旧 `main`
当时的尖端 `7fb74262` 存成 `legacy/main` —— 名字换了，历史一点没丢。用户 2026-10-05 定了三件事：
**落点仍是 `lmliheng/Adelie`**；
旧的四件产物**要按新基座更新**（重发新版，不是下架）；**默认分支是 `main`**
（2026-10-05 发布当天把新基座并进 `main`、切了默认分支，并删掉旧名 `fork/penguin-base`），
旧 `main` 留档不删（现名 `legacy/main`）。

> 工作方式：动这份基座用 `git worktree`（`/root/adelie-fork`），**不要**在 `/root/Adelie`
> 的工作区里切分支 —— `adelie-web.service` 直接读 `/root/Adelie/packages/{server/dist,web/dist}`，
> 切过去会把线上那个 Adelie Web 换成另一个服务端。
