# Adelie v0.5.1 —— 发布只剩 GitHub 一个地址

这一版很小，只有一件事：**把阿里云那面镜像彻底停掉**。数据根、配置格式、HTTP 接口与命令名都没有
变化，装好的机器升级后不用改任何配置。

## 这一版改了什么

1. **桌面端检查更新少一次注定失败的往返。** 以前它默认先去阿里云 OSS 那面镜像取 `latest.yml`，
   探不通才回退到 GitHub Releases。那面镜像是这个项目自己的桶，账号早已被停用，所以每次检查都会先
   撞一次 403。现在它直接读 GitHub Releases —— 唯一的发布地址，也是始终最新的那个。自建镜像的
   部署不受影响：`PENGUIN_UPDATE_FEED_URL` 仍然能把检查指向自己的源。
2. **发布流水线里不再有镜像作业。** `release.yml` 的 `mirror-oss` 作业、`oss-staging` 工作流，以及
   `scripts/` 下三个跟 ossutil 打交道的脚本一并删除。每次发布就是把 14 件资产传到 GitHub Release，
   没有第二步。README 里那句「同一份资产也镜像到阿里云 OSS」相应去掉。

两个安装脚本此前就只认 GitHub（`PENGUIN_DOWNLOAD_SOURCE=auto|github`，写 `oss` 会被明确拒绝），
所以**下载与安装这条路没有任何变化**。

## 升级

**桌面端**在应用内更新：账号菜单的更新入口，或应用菜单里的「检查更新」。

**命令行与 Web**：`penguin update`（或重装 `npm install -g @adelie/cli`）。npm 上 24 个包都到了
0.5.1。

**注意**：如果你此前给 Adelie 配过自建下载源（`PENGUIN_DOWNLOAD_BASE_URL`）或自建更新源
（`PENGUIN_UPDATE_FEED_URL`），那些设置仍然有效，这一版没有动它们。

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

上一版（v0.5.0）的大改动在 [RELEASE-v0.5.0.md](RELEASE-v0.5.0.md)：包名改挂 `@adelie/*`、
官网页面只留文档站。文档在 <https://lmliheng.github.io/Adelie/docs/>。
