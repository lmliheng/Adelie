# Adelie v0.5.8 —— 下载不通 GitHub 时可以让 Adelie 接手，插件更新不再被占用卡死

这一版自 v0.5.7 起在 `main` 上落了 **7 笔提交，其中 3 个用户看得见的改动**（其余是每轮的记账）。
数据根、配置格式、包名与既有的请求接口都没有变化，装好的机器升级后不用改任何配置。

## 这一版改了什么

1. **更新拉不到 GitHub 时，可以让 Adelie 自己排查并下载。** 有些主机就是连不上 GitHub——网络被挡、
   代理不对、DNS 被换成了门户页——这种时候「重试」按多少次都是一个结果，用户只看到一个「更新失败」
   和一段自己看不懂的 curl 报错。下载失败的弹窗现在多一个按钮：点开会新建一个对话，里面已经写好排查
   步骤——先查 DNS / 代理 / TLS 断在哪一步，再换一条能走通的通路把安装包与 `install.sh` 取回来、核对
   校验和、装到现有安装目录，并写明数据目录不要动；发不发由你按。按钮旁写明这一步需要先在「模型」页
   配好模型，并会按用量产生调用开销。命令行那条路（`penguin update` 在连不上 GitHub 时给出的报文）
   这一版没有动。

2. **插件更新不再被「目录正被占用」拖死。** Windows 上杀毒软件、编辑器，或者从技能目录里启动的进程
   （WPS 那个面板桥就是），会让这个目录删不掉，系统给的是 `EBUSY`。以前这一下就让「更新插件」整个
   失败，错误中心还把它记成「未预期」——看着像我们的 bug，其实是机器上有个句柄没放开。现在删不动会
   先重试五轮（30/70/150/300/600 毫秒，合起来约 1.1 秒），还不行才回 409，并说清是哪个目录被占着、
   该怎么办，错误中心按「可预期」记；网页上的提示也换成了能照做的中文。顺带把 WPS 插件的桥与开机
   自启改成不再继承当前目录，从源头减少它自己占住技能目录的机会。

3. **「被拒的原因留在框里」铺到智能体设置的另外两处。** 还原配置与更新内核被服务端拒绝时，那句话
   画在句子下面、重试按钮旁边，不再只弹一个「操作失败」。

## 兼容

- 只多了一个错误码与状态：`skill_dir_busy`（HTTP 409）。既有的请求、响应与磁盘格式都没变。
- 新装的机器与升级的机器都不需要改配置；数据根一个字节没动。

## 升级

**桌面端**在应用内更新：账号菜单的更新入口，或者应用菜单里的「检查更新」。Windows 安装包仍未签名，
SmartScreen 会提示一次（「更多信息 → 仍要运行」）。

**命令行与 Web**：`penguin update`（或重装 `npm install -g @adelie/cli`）。npm 上 26 个包都到了 0.5.8。

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

上一版（v0.5.7）给模型库加了火山方舟分组，让对话能发视频、模型能看视频，并收进出片技能
`use-seedance`。文档在 <https://lmliheng.github.io/Adelie/docs/>。变更明细见仓库里的
[`CHANGELOG.zh.md`](https://github.com/lmliheng/Adelie/blob/main/CHANGELOG.zh.md)。
