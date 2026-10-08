# Adelie v0.3.4 —— 记账时就定价的用量成本、用户管理两列、长会话与 Trace 不再卡，外加反馈入口与模型库更新

用户 2026-10-08 点单发这一版（需求箱 req-23「该更新 0.3.4 版本了」）。按巡台口径，普通需求要攒到
10 个功能性提交才发版，这一版是 **9 个**（自 v0.3.3 起）—— 用户当场要，且下面这些改动都是**用户可见**、
一直躺在本地的，发出去正合 `REQUIREMENTS.md` §1.4 那条「攒着不发等于没做」。**没有破坏性改动**：
数据根、配置格式、HTTP 接口都没动，已装好的机器不需要改任何配置。

## 这一版改了什么

1. **用户管理表多了「最近登录时间」与「累计开销」两列**。管理员列表直接看到每个人最后一次进来的
   时刻与到目前为止花掉的钱（服务端按用量行汇总），不用再逐个点进去。
2. **用量成本在写入用量行时就定格**。过去成本是读取时按当时的价目表算的，模型调价或补录价格会让
   历史账目跟着变；现在每条用量行落库时就把价格和金额记下来，账目是当时那一刻的事实（服务端一半，
   见 `changelog/unreleased/2026-10-08-usage-cost-at-record-time.md`）。
3. **长会话与长 Trace 文件打开不再卡**（上游 `b8862716` 移植）。对话按更少的 Task 打开、历史页按
   字节设上限、图片改为链接，Trace 面板一次读一轮而不是整个文件。
4. **插件市场把未安装的插件从「已安装」里分出去**。列表不再把「本机有、但没装进这个项目」的条目
   混在已安装分区里。
5. **官方模型的接入地址与三档价格在配置对话框里只读**。已经固定的官方模型（baseURL、缓存命中/
   未命中、输入输出价）不再允许用户改坏。
6. **左下角账户菜单加了「用户反馈」入口**。提交的反馈直接落进本机的需求箱（3003），不用另外写邮件。
7. **模型库加入智谱官方的免费档 GLM-4.7 Flash**。
8. **两处沙箱修复**：建沙箱前先把 Session 的 scratchpad 建出来（上游 `cba091e3` 移植）；
   `sandbox-dsh` 在 Windows 上拒绝 bash，并点名它要哪个 shell（否则报错只说「失败」）。

## 升级

桌面端（Windows / Linux 的 AppImage）在应用内更新：账号菜单的更新入口或应用菜单里的「检查更新」
会读到这一版，默认走 OSS 镜像，镜像不通自动回退 GitHub Releases。Windows 安装包仍未签名，
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

安装包都在 GitHub Release 上：<https://github.com/lmliheng/Adelie/releases/tag/v0.3.4>；
同一份资产也在 OSS 镜像上（`.../releases/v0.3.4/` 与版本无关的 `.../latest/`）。
npm 上整条链同样是 **0.3.4**：`npm install -g @lmliheng/penguin-cli`。

## 质量门禁（本机跑过）

- `pnpm typecheck`（8 个工作区包）、`pnpm lint`（oxlint，0 警告 0 错误）、`pnpm format:check`
  （prettier）全过。
- 测试全绿：**9053 通过 / 17 跳过 / 0 失败**（docs 62 · ui 1003 · core 1359(+5 跳过) ·
  server 2682(+4 跳过) · cli 506 · web 2942(+2 跳过) · desktop 286 · ui-gallery 131 ·
  四个 sandbox 插件 82）。

## 已知待办

- **没有代码签名**：Windows 的 Authenticode 与 macOS 的 Developer ID 都没有；macOS 的 dmg 会被
  Gatekeeper 拦，所以仍不发 macOS。
- 命令名仍是 `penguin`、数据根 `~/.adelie`；安装脚本与打包脚本里的产物名仍是 `penguin-*`。
- `.github/workflows/release.yml` 仍是上游那条（只能手动 dispatch），Adelie 自己的发布流水线还没写；
  这一版的安装包是「本机脚本 + `desktop-build.yml` 手工 dispatch」打的。
