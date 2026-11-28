# Adelie v0.8.8 —— 手机能当设备接进来，网络面板的模型行显示服务商的真实地址

手机插在电脑上，Adelie 以前只是个黑盒：它不知道这台手机在哪、电量多少、能不能截图。这一版把手机
作为「设备」接进实例：USB 插上就能看到，Android 11 起扫一次二维码就能无线接；设备页能看概况、电源、
屏幕与网络，能截图、能跑命令，读信息默认开着、每一个写操作都要当场确认并记进审计。另一头，网络面
板里「模型」那一行的地址不再写 Adelie 自己的接口，而是这家服务商这次真正被调用的端点。

## 安装

**已经装过的人**：桌面端在应用内更新（账号菜单的更新入口，或应用菜单里的「检查更新」）；命令行与
Web 用 `penguin update`，或重装 `npm install -g @adelie/cli` —— 两者都需要 Node >= 24。

**全新的机器**，单行脚本：

```bash
curl -fsSL https://github.com/lmliheng/Adelie/releases/latest/download/install.sh | sh
```

```powershell
irm https://github.com/lmliheng/Adelie/releases/latest/download/install.ps1 | iex
```

> 说明：这一版先为**本机现网与测试**构建（Linux x64 载荷与安装脚本），npm 包、GitHub Release 与桌面
> 安装包都没有发；对外分发的 0.8.8 要补时再按发布链补上。

## 亮点

**手机作为设备接入。** 侧栏多了「设备」：USB 插上、手机上点「允许」，几秒内就会出现一张卡片，写着
型号、系统、连接方式、电量与最后在线时间；点开是概况、电源、存储与内存、屏幕、网络五组读数（只画
采到的，没采到的不画）。按钮里有截图、立即采样、通知、权限和移除设备。管理员能给某台手机逐项授权，
也能把手机授权给某个 Project；普通成员只看得到授权给他的那些。

**不用插线也能接。** Android 11 起支持无线调试：管理员点「添加设备」，页面给出一个一次性二维码和
配对码，手机「开发者选项 → 无线调试 → 使用二维码配对设备」扫一下即可，配对成功后手机会自己出现在
列表里。

**命令行也能用。** 服务端不在本机时，在有手机的那台机器上跑 `penguin device`：`list`、`info`、
`screenshot -o`、`files ls/pull/push`、`apps list/install/uninstall`、`shell`、`input`、`notify list`、
`events`，都能 `--json`。桌面端会自己把桥拉起来，不用另开进程。

**权限是两道锁。** 读信息与看应用默认开，其余默认关；写操作（安装、输入、shell、文件写入）除了要
授权，每一条命令还要带一次明确确认，服务端和桥各查一遍，每一次动作都记进审计。

**网络面板的模型行显示真实地址。** 以前那一行写的是 `/api/sessions/<id>/model` —— Adelie 自己的接
口，看不出这次请求发给了哪家服务商的哪个端点。现在按配置的地址和协议推出真实端点：OpenAI 兼容是
`/chat/completions`，Anthropic 是 `/v1/messages`，Gemini 是 `streamGenerateContent`，Responses 系
列是 `/responses`；列表显示主机加路径，详情是完整 URL，另加「模型」「协议」两栏。没配地址就留空，
不去猜。

## 值得一提

- 设备属于整个实例，不属于某个 Project：登记、权限、审计都在服务端，换一个 Project 看同一台手机
  看到的是同一份授权。
- 大文件上传仍沿用 v0.8.7 的分片并行（4MB 一片、四路）：这一版没有改它，测试照旧。
- 设备桥是独立进程：它崩了按 1/2/5/10/30 秒退避重起，只写日志，不打断主窗口；没有 adb 的机器上
  设备页会直接说「没找到 adb」，而不是给一个空列表。

## 兼容

- **新增数据库迁移 18**：六张表（设备、会话、事件、桥、授权、适配器安装记录）。只加表，不改旧表，
  数据根里已有的数据不受影响。
- 服务端新增设备 API（列表/详情/事件/命令/权限/授权/移除）与无线配对路由，另新增本机设备桥的
  socket 通道；旧的接口一个没动。
- 内置浏览器协议与上一版相同。

## 要求

- Node.js >= 24（单行安装脚本自带运行时，npm 安装需要本机有）。
- Linux / macOS / Windows 的 x64 与 arm64；其他 POSIX 平台用 `--universal` 安装包。
- 手机端要开着「开发者选项」里的 USB 调试；无线配对要 Android 11 及以上。

上一版（v0.8.7）把大文件改成几路一起传、让网络面板能看模型请求和响应；再上一版（v0.8.6）让大附件
改走独立直传、对话页多了「网络」面板。文档在 <https://lmliheng.github.io/Adelie/docs/>。本版全文见
[`docs/releases/RELEASE-v0.8.8.md`](https://github.com/lmliheng/Adelie/blob/main/docs/releases/RELEASE-v0.8.8.md)。
