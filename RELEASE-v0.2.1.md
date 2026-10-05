# Adelie v0.2.1 —— 更新链路回到 Adelie，工作区能建文件夹

接在 v0.2.0 之后的一个小版本：把最后几处还指着上游的更新来源改回 Adelie，补上工作区创建里
缺的「新建文件夹」，并修掉侧栏一处被截断的下拉文案。

## 这一版改了什么（相对 v0.2.0）

1. **更新链路全部指向 Adelie**（上一轮收尾）
   - 桌面端只有一条更新来源：删掉自建镜像那套（`update-source.ts`）与它的测试，`RELEASES_URL`、
     应用菜单里的仓库链接、GitHub feed 的 owner/repo 一律是 `lmliheng/Adelie`；要自建镜像只剩
     `PENGUIN_UPDATE_FEED_URL` 一个开关。
   - 根安装脚本 `install.sh` / `install.ps1`：仓库改成 Adelie，删掉上游 OSS 源与整套下载测速探测，
     `PENGUIN_DOWNLOAD_SOURCE` 收成 `auto | github`。
   - 插件库元数据：内置插件索引与 14 个 `plugins/*/package.json` 的 `repository.url` 指向 Adelie。
   - Web 端「检查更新」弹窗里的 Releases 链接也改到 Adelie（上游那条漏网的）。
2. **工作区创建里可以新建文件夹**（这一版的新功能）
   - 服务端新增 `POST /api/projects/:p/dirs { parent, name }`：只建一层、不递归，父目录写错就是 404；
     `name` 必须是单个名字（空、含 `/` `\`、`.`、`..`、NUL 一律 400），同名 409、父目录不存在 404、
     没有写权限 403。
   - 选择器里：工具栏多一个「新建文件夹」，列表首行是内联命名框 —— Enter 创建、Esc 只关输入框、
     失焦放弃；建成后重读该目录并选中新文件夹。同名等失败会给一条提示并保留你输入的名字。
   - 手机上工具栏放不下，这一项在**列表空白处的右键菜单**里（和「刷新」一样）。
   - 只对**本机服务器**提供：通过 ssh 浏览的机器只能列目录，那里不出现这一项。
3. **侧栏下拉不再截断文案**：WORKSPACES 那排的列表选项下拉原本是固定宽度，
   「Group by workspace」被截成「Group by work…」；现在按内容自适应宽度。

## 安装

**本版与 v0.2.0 一样，GitHub Release 不带附件**；安装包放在自建下载站：

<http://64.83.2.109:3003/downloads/v0.2.1/>（v0.2.0 与 v0.1.0 的包也还在）

| 产物 | 目标 | 说明 |
| --- | --- | --- |
| `adelie-linux-x64.tar.gz` | Linux x64 | 自带 Node 运行时；解压 → `./install.sh` |
| `adelie-win32-x64.zip` | Windows x64 | 自带 Node 与 MinGit；解压 → `install.cmd` |
| `adelie-universal.tar.gz` | 任意平台 | 不带运行时，目标机器要有 Node ≥ 24 |

装完的命令与数据根仍是上游拼写（`penguin`、`~/.penguin`）—— 改名归后续版本。

从源码运行、首次登录认领、在应用内配置模型，见 [README](README.md)。

## 质量门禁（本机跑过）

- 单元/集成测试：**8837 通过 / 14 跳过 / 0 失败**（docs 62 · core 1346 · ui 999 · server 2557 ·
  cli 505 · web 2887 · desktop 279 · ui-gallery 131 · 四个沙箱插件 71）
- `pnpm lint`（oxlint）0 警告；`pnpm format:check`（prettier）干净；`pnpm typecheck` 八包通过；
  `sh scripts/test-installer.sh` 通过
- 新建文件夹在浏览器里真跑过：建出目录后列表里选中新文件夹、同名给提示、Esc 只关输入框

## 行为说明（不是这一版改的，但值得知道）

- **插件由你自己掌控**：升级应用本体只换 `bin`/`lib`/`web`/`node`，不碰数据根；插件库随应用换新，
  但 Agent 上装的那份是副本，**不会自动跟着换** —— 插件页会标出哪些 Agent「落后于库」，由你点
  一键（或批量）重装，代价是覆盖该 Agent 上的本地改动。Agent 内核的 `system_config.yaml` 也从
  不自动升级，需要在 Agent 设置的「内核」一节手动推进。
- 本机的 3004（`adelie-app.service`）已关掉开机自启（`systemctl disable`），不会再自己起来。

## 已知待办

自有化（数据根、端口、命令名）、接回旧 Adelie 的能力（用量与成本页、模型目录、审批口径、用户与
角色）、npm scope 改名与发布流水线重写，以及把安装包资产按上游形状发进 GitHub Release —— 清单在
[`FORK-PROGRESS.md`](FORK-PROGRESS.md)。
