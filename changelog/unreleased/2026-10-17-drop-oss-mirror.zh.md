# 阿里云镜像下线：发布只剩一个地址，而且它一直是最新的

- **Date:** 2026-10-17
- **Type:** process
- **Scope:** `desktop`, `ci`, `docs`

[English](2026-10-17-drop-oss-mirror.md)

每次发布只挂在 `lmliheng/Adelie` 的 GitHub Releases 上，别处没有。桌面端直接去那里检查更新，
发布流水线里也不再有「把资产拷到阿里云 OSS」这一步。

## 为什么

那面镜像是这个仓库自己的桶，而它的账号在本仓库之外就被停用了（v0.3.5 起每个请求都返回
`UserDisable`）。挂一面谁都没法写的镜像比不挂更糟：发布链里因此多了一步只会失败的作业，桌面端
默认的更新源每次检查都先撞一次 403 才回退到 GitHub。用户 2026-10-17 决定不再使用它，代码跟上
这个决定。

## 改了什么

- `packages/desktop/src/update-support.ts`：`MIRROR_FEED_URL` 与 `fallsBackToGithub` 删除。检查
  从 GitHub Releases 开始，设了 `PENGUIN_UPDATE_FEED_URL` 就从那里开始 —— 自建镜像的部署仍然把
  它指向自己。对装了桌面端的用户，变化是**少了一次注定失败的往返**。
- `packages/desktop/src/updater.ts`：`handleCheckError` 里的回退随之删除，它依赖的 feed 类型也一
  并去掉；检查失败就在被问到的地方如实报出来。
- `.github/workflows/release.yml`：删掉 `mirror-oss` 作业，以及文件头里讲它的那几句。
- 一并删除：`.github/workflows/oss-staging.yml`、`scripts/publish-release-to-oss.sh`、
  `scripts/install-ossutil.sh`、`scripts/test-oss-staging.sh`。
- `README.md` / `README.zh.md` 不再承诺国内镜像。

两个安装脚本本来就只认 GitHub（`PENGUIN_DOWNLOAD_SOURCE=auto|github`，`oss` 会被明确拒绝），
所以下载与安装这条路没有任何变化。
