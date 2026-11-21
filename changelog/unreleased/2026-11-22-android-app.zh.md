# 安卓 App 的源码进了仓库

- **Date:** 2026-11-22
- **Type:** process
- **Scope:** `android`, `docs`

[English](2026-11-22-android-app.md)

可以直接侧载的安卓 APK —— bionic 版 Node 24、Adelie 本体与自己的 Web 前端打在一个包里 —— 原先只
存在于打包那台机的临时工作区，现在源码收进了仓库的 `android/`。当前内测版是 1.0.1。

## 收进来的是什么

一颗完整的 Gradle 工程（AGP 8.7.3 + AndroidX + Material 3，`app/src/main/{java,res,AndroidManifest.xml}`，
外加 `app/src/test/` 里那份 Robolectric 截图用例），和四支把它编出来的脚本：`build-node-android.sh`
用 NDK 交叉编译 Node、`patch-zlib-cpufeatures.py` 修 arm64 上 zlib 找不到 `cpu-features.h`、
`gen-icons.py` 从官方图标生成五档 mipmap 与自适应前景、`build-apk.sh` 把编好的 node 与 Adelie 摆进
`jniLibs/` 与 `assets/` 再调 Gradle 出包。`publish-3003.sh` / `finish-v2.sh` 把打好的包发到静态站并
回读校验，`notify.py` 是长任务结束后的通知。`README.md` 记了构建命令、运行时目录结构与已知限制
（只出 arm64-v8a 与 x86_64、没有 `node-pty`、沙箱退化为直接执行等），`screenshots/` 与 `icons-src/`
是它的配图与图标源。

## 只收源码

`app/src/main/jniLibs/` 里的 `libnode.so` 与 `assets/payload.zip` 是 `build-apk.sh` 打包时现摆进去的，
`build/`、`.gradle/`、`local.properties` 与打好的 APK 同样不入库：新增的 `android/.gitignore` 把它们
挡在外面。整棵工程连生成物约 1.7 GB，进仓库的是 1 MB 出头的源码与脚本。

脚本与 README 里原先写死的那个内测分发地址换成了环境变量 `BASE_URL`（默认回环），与
`publish-3003.sh` 既有的 `SITE_ROOT` / `BASE_URL` 写法一致；文档里也因此不再出现那台机的地址。

## 测试

- 入仓的是源码，这次没有重新构建 APK。要复现，按 `android/README.md` 跑 `bash build-apk.sh arm64`；
  界面那条 Robolectric 用例要本机有 Android SDK 与 `/opt/gradle-8.9`。
- 核对过入仓文件里没有密钥、没有内测分发地址、没有生成物：`grep` 全树无命中，`git status` 里只有
  源码与脚本。
