# Adelie v0.5.6 —— 公司页的确认框被拒时把原因留在框里，画图技能能从插件库装上

这一版自 v0.5.5 起在 `main` 上落了 **21 笔提交，其中 10 个用户看得见的改动**（其余是每轮的记账）。
数据根、配置格式、包名与既有 HTTP 接口都没有变化，装好的机器升级后不用改任何配置。

## 这一版改了什么

1. **「原因随框留着」这条线在公司页铺完了。** 一个操作先问一句「确定吗」，问完之后框在请求
   返回的那一刻就关，不管写没写成功 —— 被拒的时候页面一点没变，原因却只落进一条六秒后自己消失、
   还浮在别处的通知里。这一版把公司页剩下的九处一并改掉：**只有写成功才关框**，被拒就把服务端
   那句话画在句子下面、重试按钮正上方；重新打开不带着上一次的旧原因，写入在途时连点也只认一次。
   九处是：智能体 API 页的三张框（关闭 API 访问、允许无密钥访问、删除密钥），设置 › 服务器 ›
   Agent API 的关闭框，组织日历的保存与删除，频道的离开与归档，组织图里的招募与单字段编辑，
   删除组织，组织手册里删除文档，组织图里那行「离任」，以及两个入口共用的「加入频道」——
   频道页提示里那个「加入」和侧栏「其他频道」悬停露出的「加入」。与前面几版加起来，「被拒的原因
   留在框里」现在覆盖了插件、模型库、定时任务、评估中心、记忆、文件面板、凭据表、组织与频道
   整条线。

2. **插件库多了画图的技能，装上就能用。** 内置插件 `use-lieflat-charts` 把上游那套模板驱动的
   图表 skill 带了进来：六十几套图型（编辑型、基础型、快读型、地图、交互大图），另有演示与整页
   报告两种模式 —— 给一组数据，它能直接产出可交互的 HTML 图表，而不是只给一堆代码。技能正文与
   模板保持上游原文，约 2.5 MB，所以**不预装**：从插件库装到要画图的 Agent 上即可。上游许可是
   PolyForm 非商业 1.0.0，包里带着许可原文与出处说明，商业用途需要原作者授权。

## 升级

**桌面端**在应用内更新：账号菜单的更新入口，或应用菜单里的「检查更新」。Windows 安装包仍未签名，
SmartScreen 会提示一次（「更多信息 → 仍要运行」）。

**命令行与 Web**：`penguin update`（或重装 `npm install -g @adelie/cli`）。npm 上 24 个包都到了 0.5.6。

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

上一版（v0.5.5）把「写入被拒绝的原因」铺到插件、智能体与项目设置的八处，给数据根加了能自己导入的
主题，模型库收进 Abliteration 分组，会话里超过四张图时只带最新的四张。文档在
<https://lmliheng.github.io/Adelie/docs/>。变更明细见仓库里的
[`CHANGELOG.zh.md`](https://github.com/lmliheng/Adelie/blob/main/CHANGELOG.zh.md)。
