# Adelie v0.3.6 —— 数据根有了分类账，也有了「人工审核后才动手」的清理

这一版把 issue #17 的清理设计走完了前两步：先**看得见**（分类账，只读），再**人工审核闭环**
（扫描出账单 → 人逐条勾选 → 批准后搬进回收站，可还原）。**默认依然是完整保留**：清理模式出厂关闭，
没有任何定时器、没有任何会自己动手的阈值，全流程里唯一的删除动作是回收站那句「彻底删除」，
而且必须先由人按下。

其余是几笔随上游来的改动：侧栏列表按最后活动分页、每条会话的来源恒定记录（侧栏多一个「后台」
折叠夹），以及一批界面修补。**没有破坏性改动**：数据根布局、配置格式、既有 HTTP 接口都没动。

## 这一版改了什么

1. **存储分类账：数据根里到底装了什么。** 新增 `penguin storage`（以及设置页「存储」页），
   逐类报出数据根（`ADELIE_HOME`，默认 `~/.adelie/data`）的占用——用户资产、临时工作区、
   会话草稿、轨迹、工具环境、回收站、数据库、其他——再列出**可供人清理的条目**，每条写明命中的
   规则（空目录 / 无引用 / 会话已删除 / 静默超期 / 超出预算）与最后改动时间，最后是「看起来同一套
   工具链装了多份」的环境。**这一半只读**：没有定时器，也没有任何接口能删除。
2. **人工审核的清理：扫描 → 账单 → 勾选 → 搬移。** 打开**清理模式**后，`penguin storage scan`
   写出一份**账单**（`<root>/storage/plans/<planId>.json`，24 小时有效），列出自上次以来可清理的
   条目并给每条标上「可搬」或「仅报告」；设置页「存储」页把同一份账单画出来，可以逐条勾选（**默认
   一条都不勾**）、按类全选、把某条**pin** 住让它从此不进账单。批准时对这批条目算一个指纹，
   执行时逐条复核（大小与修改时间漂移、路径消失、被会话重新用上都算变卦）——**不一致就整批拒绝**，
   而不是清一半。
3. **执行永远是「搬进回收站」，不是删除。** 被批准的条目被重命名进 `<root>/.trash/<时间戳>/`，
   旁边留一份 `manifest.json`，并且每条在搬动**之前**先写进 `<root>/logs/storage-gc.jsonl`。
   `penguin storage trash` 列出各批次，`trash restore <id>` 原地放回（原路径已被占用就跳过并说明），
   `trash purge [<id>]` 是整个设计里唯一的删除——带 id 删那一批，不带 id 只删超过保留期（默认 14 天）
   的批次，而且只能触及 `.trash` 内部。**这一版可清理的类别只有临时工作区**（`tmp-*`），其余类别
   仍在账单上但只报告，点名它们会被明确拒绝。
4. **侧栏列表按最后活动分页**（上游 `#960` 移植）。「加载更多会话」不再把行从「更早」搬进
   「过去一天」：每个列表都按**显示顺序**分页，由多条流合并来的列表只显示它们都已到达的行。
5. **每条会话的来源恒定记录，侧栏多一个「后台」折叠夹**（上游 `#999` 移植）。`source` 记下这条会话
   是人开的还是程序开的（定时任务 / 子智能体 / `penguin run` / 公司模式…），侧栏把原来的
   子智能体、定时、评估三个折叠夹合成一个**后台**，每行标明来源。
6. **一批界面修补**（上游 `#1007` 移植）：权限菜单每一行前面带上该档的盾牌图标，会话的思考等级
   菜单去掉脚注，轨迹页签不再把右侧内容截断，文件的编辑框不再重排文本。

## 升级

桌面端（Windows / Linux 的 AppImage）在应用内更新：账号菜单的更新入口，或应用菜单里的「检查更新」。
默认的镜像源当前不可用，客户端会自动回退到 GitHub Releases；Windows 安装包仍未签名，
SmartScreen 会提示一次（「更多信息 → 仍要运行」）。

服务器 / CLI 装的（tar 包或 npm 全局）用同一条链路，数据根（`~/.adelie/data`）不动：

```bash
penguin update --check     # 看有没有新版
penguin update --yes       # 原地替换 bin/lib/web/node
```

| 产物 | 目标 |
| --- | --- |
| `adelie-desktop-win32-x64.exe` | Windows x64 桌面端（未签名，NSIS 安装器） |
| `adelie-desktop-linux-x86_64.AppImage` / `adelie-desktop-linux-amd64.deb` | Linux x64 桌面端 |
| `penguin-linux-x64.tar.gz` | Linux x64 命令行版（自带 Node 24.18.0） |
| `penguin-win32-x64.zip` | Windows x64 命令行版（自带 Node 与 MinGit） |
| `penguin-universal.tar.gz` | 任意平台（不带运行时，需要 Node ≥ 24） |
| `install.sh` / `install.ps1` | 在线安装脚本（`penguin update` 取的就是它） |
| `latest.yml` / `latest-linux.yml` | 桌面端自动更新读的元数据 |

安装包都在 GitHub Release 上：<https://github.com/lmliheng/Adelie/releases/tag/v0.3.6>，
下载页同样直指这里。npm 上整条链同样是 **0.3.6**：`npm install -g @lmliheng/penguin-cli`。

**清理是这一版新增的能力，出厂是关着的。** 想用就在设置页「存储」页打开开关，或
`penguin storage mode on`；不想用就什么都不用做，行为与上一版一致（只有只读的分类账多出来）。

## 质量门禁（本机跑过）

- `pnpm typecheck`（8 个工作区包）、`pnpm lint`（oxlint，0 警告 0 错误）、`pnpm format:check`
  （prettier）全过。
- 测试全绿：**9409 通过 / 18 跳过 / 0 失败**（docs 62 · ui 1009 ·
  core 1395(+6 跳过) · server 2810(+4 跳过) · cli 530 · web 3092(+2 跳过) · desktop 286 ·
  ui-gallery 133 · 四个 sandbox 插件 92(+6 跳过)）。
- 端到端（临时数据根 + 真服务端 + 真 CLI）：模式关闭时扫描与还原都被 `409 storage_mode_off` 拒绝；
  扫描只写出账单、不动任何文件；批准一条后源目录消失、回收站里内容 **sha256 一致**；同一份账单
  第二次执行被 `plan_used` 拒绝；还原后内容逐字节一致且回收站条目消失；审计日志里
  `mode_on` / `scan` / `move` / `apply` / `restore` 齐全。

## 已知待办

- **没有代码签名**：Windows 的 Authenticode 与 macOS 的 Developer ID 都没有；macOS 的 dmg 会被
  Gatekeeper 拦，所以仍不发 macOS。
- **OSS 镜像当前不可用**：镜像账号被停用，直链与读写都返回 `403 UserDisable`；因此下载页与
  Release 资产都只指向 GitHub，桌面端更新自动回退到 GitHub。等镜像恢复后一行换回即可。
- **第 3、4 步未做**：删会话时把它留下的临时工作区一并移入回收站（止漏）、以及重复工具环境的
  合并迁移（人工点一次）。数据库维护（`VACUUM`）也推迟——`web.db` 不是占用大头。
- 命令名仍是 `penguin`、数据根 `~/.adelie`；安装脚本与打包脚本里的产物名仍是 `penguin-*`。
- `.github/workflows/release.yml` 仍是上游那条（只能手动 dispatch，且会推上游的 Docker 镜像），
  Adelie 自己的发布流水线还没写；这一版的安装包是「本机脚本 + `desktop-build.yml` 手工 dispatch」打的。
