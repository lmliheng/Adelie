# Adelie v0.8.3 —— 内置浏览器按对话分开：标签与 cookie 不再互相串

桌面应用里的**内置浏览器**这一版按**对话**分开了。它原来整个应用只有一份：一个标签池、一个全局的
「活动标签」指针、一个共享的 cookie 分区。两个对话同时用它就会互相抢 —— 面板在两边跳、甲正在填的
表单被乙的动作打断、危险操作甚至可能落到乙的页面上，而且 cookie 共用，甲在某个站点登录过，乙再去
就已经是登录态。现在每个对话有自己的标签集、自己的活动标签、自己的 cookie 与站点存储，命令行也多
了 `--session` 可以明确指出「这条命令属于哪个对话」。

## 安装

**已经装过的人**：桌面端在应用内更新（账号菜单的更新入口，或应用菜单里的「检查更新」）；命令行与
Web 用 `penguin update`，或重装 `npm install -g @adelie/cli` —— 两者都需要 Node >= 24。npm 上的包都
到了 0.8.3。Windows 安装包仍未签名，SmartScreen 会提示一次（「更多信息 → 仍要运行」）。

**全新的机器**，单行脚本：

```bash
curl -fsSL https://github.com/lmliheng/Adelie/releases/latest/download/install.sh | sh
```

```powershell
irm https://github.com/lmliheng/Adelie/releases/latest/download/install.ps1 | iex
```

## 亮点

**每个对话的内置浏览器各用各的。** 一个对话里打开、切换、关闭标签，不会再动到另一个对话的面板；
面板也只显示它自己那个对话的标签。每个对话的网页还各跑在自己的 Chromium 分区里，cookie 与站点存储
归它自己 —— 两个对话同时登录同一个站点，是两次独立的登录，互不可见。危险操作只会落到发起它的那个
对话的页面上。没有对话时（例如会话之外的命令行）是缺省作用域，沿用原来那个分区，所以这次改动之前
用过的浏览器会保留它的 cookie 与登录态。

**命令行可以指定命令属于哪个对话。** `penguin browser` 的每个子命令都多了 `--session <id>`，优先于
环境变量 `ADELIE_SESSION_ID`；两个都没写就是缺省作用域。会话里的 Agent 调用 `penguin browser` 时本来
就会带上自己的会话 id，所以它的动作只影响它自己的那个对话。

## 值得一提

- **桌面应用要跟着一起更新。** 内置浏览器连接协议升到了第 2 版：壳连上来先报自己的版本，服务端拒绝
  低于第 2 版的壳，所以**旧版桌面应用**在内置浏览器那一块会看到「当前桌面应用版本过旧，请更新后
  使用内置浏览器」的提示，更新应用后即正常。这一版的服务端与桌面应用是一起发的，正常升级路径不需要
  额外操作。
- 这一版**没有数据库迁移**，数据根、配置文件格式一个字节没动。
- `--tab` 的默认值仍是该对话自己的「活动标签」，只是这个「活动标签」现在跟着对话走。

## 兼容

- 内置浏览器：旧版桌面应用（协议第 1 版）与新版服务端不兼容，会被提示更新；更新到本版即恢复。
- 缺省作用域（`""`）继续使用原来的 `persist:penguin-browser` 分区，旧的 cookie 与登录态保留。
- 没有新增或删除页面、路由与环境变量；接口形状、数据根与配置文件格式没有变化。

## 要求

- Node.js >= 24（单行安装脚本自带运行时，npm 安装需要本机有）。
- Linux / macOS / Windows 的 x64 与 arm64；其他 POSIX 平台用 `--universal` 安装包。
- 桌面端：Linux 提供 AppImage 与 deb，Windows 提供 exe；macOS 未签名，这一版不随 Release 发布。

上一版（v0.8.2）给 Adelie 开了一扇对外的门（外部应用可以拿用户令牌问「这是谁」），并收干净了桌宠
面板裁切等几处小事；再上一版（v0.8.1）给两个模型分组换上了各自的标记。文档在
<https://lmliheng.github.io/Adelie/docs/>。本版全文见
[`docs/releases/RELEASE-v0.8.3.md`](https://github.com/lmliheng/Adelie/blob/main/docs/releases/RELEASE-v0.8.3.md)。
