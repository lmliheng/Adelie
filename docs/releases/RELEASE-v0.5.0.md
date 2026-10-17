# Adelie v0.5.0 —— 包名改挂 `@adelie`，官网页面只留文档

这一版自 v0.4.1 起在 `main` 上落了 **30 笔提交，其中 10 个用户看得见的改动**（其余是每轮的记账、
CI 与发布准备）。**这一版有需要动手的改动**：npm 上所有包的名字从 `@lmliheng/penguin-*` 换成
`@adelie/*`，安装与升级命令跟着换，Project 配置里写的插件名也要换。数据根（`~/.adelie/data`）、
配置格式与既有 HTTP 接口都没动，已经装好的机器照旧运行。

主线是「这个项目不再借别人的名字出现」。包挂到自己的作用域，官网页面只留自己的文档站，README、
文档、安装脚本头部和 npm 包页面上的链接都指回这个仓库；顺带把自 0.4.1 起攒下的 Agent API 与几处
界面修补一并交到你手上。

## 这一版改了什么

1. **包名改挂 `@adelie`。** 仓库自己发布的 24 个包全部换了名字：三个宿主包是 `@adelie/core`、
   `@adelie/server`、`@adelie/cli`，协议包 `@adelie/amsp`，二十个插件去掉 `penguin-` 前缀换作用域
   （`@adelie/goal`、`@adelie/requirements-box` 等）。**命令行名字没变**，还是 `penguin` 与
   `penguin-hmr`；`PENGUIN_*` 环境变量也没有换名字的地方。旧名字在注册表上标记为失效并指向新名字，
   已经钉住旧名字的安装仍然能解析。
2. **官网页面只留文档。** <https://lmliheng.github.io/Adelie/docs/> 现在挂的是这个仓库自己的文档站
   （`packages/docs` 构建，站点根是一页跳转）。原先挂在那里的上游官网快照——首页、下载页、博客、
   画廊——已经删掉：它的下载页给的是上游自己的安装器，跟着装出来的是另一个产品，而不是这个仓库发的
   这个。想装 Adelie，用下面「安装」里的两条命令。
3. **链接都指回自己。** README、文档、`.github` 各模板、`docker/compose.yaml`、两个安装脚本的头部
   注释，以及每个包的 `package.json` 里那个「源码地址」，全部改成这个仓库与它的 Release 资产、
   文档站地址。有意保留指向上游的只剩三处：ModelScope 桥接与 Penguin Go 网关（跑在上游服务器上，
   值必须与代码发出去的一致）、README 里的上游归属说明、Dockerfile 的镜像来源标签。
4. **文档改称 Adelie，并且与代码对上。** 30 对中英文页面里的产品名、桌面端日志目录、数据根
   （`~/.adelie/data`）与安装目录都改了；页面里写的环境变量逐个对着代码的读点核过——该写
   `ADELIE_*` 的写成 `ADELIE_*`，属于安装器协议与上游网关的 `PENGUIN_*` 保持原样。顺手把下载来源
   那一段改对：Adelie 的安装器只认 `auto|github`，没有上游那套 OSS 测速镜像。
5. **Agent API：外部程序可以和某个 Agent 对话。** Agent 设置里多了一个 **API** 标签页，打开后你的
   脚本、你自己的小工具、另一台机器上的程序都能经 HTTP 与这个 Agent 对话，事件流用 AMSP 协议推
   （`POST /api/amsp/v1/...`），凭 `Agent ID` 与密钥接入，审批模式单独可设。运行使用 Project 的模型
   与凭据，记录方式与其他对话一致。
6. **几处界面修补。** 打开历史对话不再先等侧栏；被截断的文字悬停即可看到全文；列表行的操作始终
   可见，无论文字多长；极客主题的图表连线改为点间直线；账号菜单里「反馈社区」下面那行小字去掉；
   有一处悬停提示此前不显示，已恢复。

## 升级

**npm 全局安装换了名字**：`npm install -g @adelie/cli`（旧的 `@lmliheng/penguin-cli` 已标记失效，
从旧名字装过的机器重装一次即可，数据根不动）。装完放进 `PATH` 的命令仍是 `penguin`。

**Project 配置里的插件名要改**：`[plugins]` 表里写过的 `@lmliheng/penguin-*` 换成对应的
`@adelie/*`（如 `@adelie/requirements-box`、`@adelie/goal`）。插件不会被自动覆盖，需要的在插件
市场里各自更新。

**桌面端**在应用内更新：账号菜单的更新入口，或应用菜单里的「检查更新」。Windows 安装包仍未签名，
SmartScreen 会提示一次（「更多信息 → 仍要运行」）。

**命令行安装**（Linux / macOS / Windows）用同一份单行安装脚本，`--version v0.5.0` 可钉住这一版。

数据根、配置文件与既有接口都没动，所以已经装好的机器升级后不需要改任何配置。

## 安装

```bash
curl -fsSL https://github.com/lmliheng/Adelie/releases/latest/download/install.sh | sh
```

```powershell
irm https://github.com/lmliheng/Adelie/releases/latest/download/install.ps1 | iex
```

也可以只装 CLI：`npm install -g @adelie/cli`（需要 Node.js >= 24）。

## 要求

- Node.js >= 24（单行安装脚本自带运行时，npm 安装需要本机有）。
- Linux / macOS / Windows 的 x64 与 arm64；其他 POSIX 平台用 `--universal` 安装包。
- 桌面端：Linux 提供 AppImage 与 deb，Windows 提供 exe；macOS 未签名，这一版不随 Release 发布。

文档在 <https://lmliheng.github.io/Adelie/docs/>。变更明细见仓库里的
[`changelog/unreleased/`](https://github.com/lmliheng/Adelie/tree/main/changelog/unreleased) ——
这个仓库把每一版的条目留在那里，按日期与 slug 命名，中英各一份。
