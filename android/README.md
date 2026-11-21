# 安卓上的 Adelie（原生 APK，无 Termux / 无 proot）

这个目录把 Adelie 做成一个可以直接侧载的 APK：Node 运行时、Adelie 本体（`lib/` + `web/`）
和前端全部在包内，装完打开就在手机上起一个只监听回环地址的服务，界面是 Adelie 自己的 Web 前端。

```
android/
  build-node-android.sh      用 NDK 交叉编译 Node（x86_64 给模拟器，arm64 给真机）
  patch-zlib-cpufeatures.py  arm64 构建时 zlib 找不到 cpu-features.h 的修复
  gen-icons.py               从官方 adelie-icon.svg 生成启动图标（含自适应前景）
  build-apk.sh               把编好的 node + Adelie 打进 APK
  publish-3003.sh            把 APK 发布到静态站的 /downloads/android/ 并更新清单
  finish-v2.sh               一条命令：校验 → 打包 → 发布 → 公网下载校验
  notify.py                  长任务结束后的通知（飞书 webhook 优先，否则 CSU 邮箱）
  settings.gradle            Gradle 工程（AGP 8.7.3 + AndroidX + Material 3）
  build.gradle
  gradle.properties
  app/build.gradle           minSdk 24 / targetSdk 34 / versionCode 4
  app/src/main/java/         MainActivity（Material 3 外壳）、Core（解包与起 node）、BootService
  app/src/main/res/          layout / menu / 图标 / 主题
  app/src/test/java/         Robolectric 界面截图测试（没模拟器也能看界面）
  screenshots/               渲染出来的界面 PNG
```

## 为什么这么做

Termux 里的 `node` 用不了：它的 RUNPATH 与 19 处前缀都写死在
`/data/data/com.termux/files/usr`，换个包名就废。所以自己编一份 bionic 版 Node。

编好之后还有一关：Android 10（targetSdk 29）起，应用数据目录是 `noexec` 的，
从 `files/` 里 `chmod +x` 再 `exec` 会被 SELinux 拒绝。APK 的做法是把 node 以
`lib/<abi>/libnode.so` 的名字打进 native 库，安装时它被解到 `nativeLibraryDir`
（那份目录允许执行），运行时直接按那个路径启动。

## 已发布的测试包

第一版是 `--with-intl=none` 编的，真机上第一次跑就栽在 V8 没有 ICU：
`micromark-util-character` 的 `\p{P}`/`\p{S}`（Unicode 属性转义）解析不了 ——
`Invalid regular expression: … Invalid property name`。所以从 0.2.0 起改成
`--with-intl=small-icu`（英文 ICU 数据，`\p{…}` 与 `Intl` 都可用）。

当前最新的内测版是 1.0.1（换成 Gradle + AndroidX + Material 3 的界面）：

| | |
| --- | --- |
| 大小 | 100,899,943 字节（96.2 MiB） |
| sha256 | `6657e643755880a878125af6be683101b579ebeaeee5f4592ed18de25d7835ff` |
| 包名 / 版本 | `dev.adelie.app` / 1.0.1-beta（versionCode 4，debug 签名，可直接覆盖旧版） |
| ABI | arm64-v8a（64 位 ARM 真机），Android 7.0（API 24）及以上 |

inside：`libnode.so` 65.4 MB（strip 后，含 ICU 数据）+ `libc++_shared.so` 1.8 MB +
`assets/payload.zip` 71.1 MiB（20191 个文件，解包后 324 MB）+ 三个 dex（Material/AndroidX 约 10 MB）。

仓库里只放源码与脚本：`app/src/main/jniLibs/`（`libnode.so`）与 `assets/payload.zip` 是
`build-apk.sh` 打包时现摆进去的生成物，连同 `build/`、`.gradle/`、`local.properties` 与打好的
APK 都写在 `android/.gitignore` 里不入库（整棵工程连生成物约 1.7 GB，源码只有 1 MB 出头）。
要一份能装的包，照「构建」那节自己打；打好的包目前只在内测范围内分发，没上架任何商店。

## 界面（1.0.1 起：Material 3）

外壳是原生 Material 3 界面，内容仍是 Adelie 自己的 Web 前端。**没有顶栏** —— 页面上方
留给 Web 前端自己的头部，只有底部一条导航：

```
状态提示（只在服务没起来时出现，失败变红并给「重试」）
内容区（WebView / 原生设置页 / 深色日志浮层 / 2dp 加载进度条）
底部 navigation bar：对话 / 智能体 / 模型 / 设置（选中项用胶囊指示器 + 实心图标）
```

- **启动页**：透明企鹅图标 + 名字 + 版本，下方不确定进度条与实时阶段文字（解包进度、
  启动服务、服务已就绪）。整块内容做一次淡入上浮，就绪后整体 260ms 淡出；启动慢时点一下
  可以跳过。**不做 WebView 的透明度/位移动画** —— WebView 被合成进离屏图层后滚动会留残影，
  真机上看起来就是「字叠在一起」。
- **底部 tab** 对应前端的真实路由 `/chat`、`/agents`、`/models`；「设置」是原生页
  （工作区入口 + 开发者 + 关于）。网页自己跳转（点链接、深链）时 tab 跟着 URL 走；停在
  非 tab 的页面（例如机器管理）时底部不假装选中任何一项。
- **开发者模式**：`设置 → 开发者` 里一个开关（`SharedPreferences` 记住），打开后多出
  「运行日志 / 重新加载网页 / 复制运行日志」。日志是深色浮层，返回键先关它。
- **应用图标**：`gen-icons.py` 从 `/root/.adelie/web/adelie-icon.svg` 生成五档 mipmap
  （圆角 + 圆形）、API 26 自适应前景、启动页用的透明大图。
- 返回键：关日志 → 回「对话」→ WebView 后退 → 默认退出。

界面截图（Robolectric 在 JVM 上渲染的，不是真机）：`screenshots/01-splash.png`、
`02-shell-chat.png`、`03-settings.png`、`04-settings-developer.png`、`05-log-panel.png`。

## 构建

```bash
bash build-node-android.sh x86_64     # 模拟器验证用
bash build-node-android.sh arm64      # 真机产物
bash build-apk.sh x86_64              # 产物 build/adelie-android-x86_64.apk
bash build-apk.sh arm64               # 产物 build/adelie-android-arm64.apk
```

交叉编译踩过的三个坑（脚本里都修了）：

1. host 工具链必须显式给 —— 否则 host 的 V8 用 NDK clang 编，链接时炸；
2. `tools/v8_gypfiles/v8.gyp` 引用了 Node 24 里不存在的 `host_os` 变量；
3. V8 的 trap handler 在 Android 上要关掉（Termux 同样处理），否则
   `undefined reference to v8::internal::trap_handler::TryHandleSignal`；
   arm64 还多一个 zlib 的 `cpu-features.h`（见 `patch-zlib-cpufeatures.py`）。

## 运行时结构

```
files/adelie/
  lib/             Adelie 本体（含 node_modules）
  web/             前端构建产物
  bin/node         启动 libnode.so 的 sh 包装（PATH 上能被 `env node` 找到）
  data/            ADELIE_HOME：Agent、会话、SQLite 全在这里
  home/            HOME
  tmp/             TMPDIR（bionic 没有 /tmp）
```

启动流程：首启把 `assets/payload.zip` 解到 `files/adelie/`，然后

```
libnode.so lib/dist/penguin.js server --port 0 --host 127.0.0.1
```

从输出里认两样东西：`penguin-server started: http://localhost:<port>`（真实端口），
以及首登链接 `…/api/auth/claim?token=…`。后者是 Adelie 给「还没设过 admin 密码」的实例
准备的魔法链接，打开就下发 30 天的 `penguin_session` cookie —— 所以 WebView 直接加载它
就登进去了，手机上不需要输任何密码。

## 已知限制（这一版是测试包）

- 只出 arm64-v8a 与 x86_64 两个 ABI，没有 armeabi-v7a（32 位机器装不了）。
- 最低 Android 7.0（API 24）；`startForegroundService` 只在 26+ 存在，7.0/7.1 走
  `startService`，这条在代码里分了岔。
- APK 用 `~/.android/debug.keystore` 签名，侧载时会提示「未知来源」。
- Node 用 `--with-intl=small-icu` 编的：`Intl` 可用，但只有英文 ICU 数据；
  `toLocaleString('zh-CN')` 之类会退化成英文格式，日期与数字格式不影响聊天主流程。
- `node-pty` 没有安卓预编译产物，Web 终端标签用不了；`bwrap` 不存在，沙箱退化为直接执行。
- 手机上先有 git/bash 之类的工具才好用（Agent 的工具调用会用到），APK 不自带。
- 前台服务用 `dataSync` 类型；Android 14 起这类前台服务有每日时长上限。
- 应用内不做文件选择（WebView 没有接 `onShowFileChooser`），聊天里选图片/附件暂时不行。

## 工程与打包

标准 Gradle 工程（`app/src/main/{java,res,AndroidManifest.xml}`），`build-apk.sh` 只做两件事：
把 node 与 Adelie 本体摆进 `src/main/{jniLibs,assets}`，然后调 Gradle 出包。

```bash
bash build-apk.sh arm64     # → build/adelie-android-arm64.apk
```

- Gradle 8.9 在 `/opt/gradle-8.9`（`GRADLE_BIN` 可覆盖）；首次构建会从 Google Maven 拉
  AGP 8.7.3 与 AndroidX/Material，之后离线可编。
- `jniLibs { useLegacyPackaging = true }` 对应 `extractNativeLibs=true`：libnode.so 必须
  被解到 `nativeLibraryDir` 才能 exec。
- **打包前必须 `:app:clean`**：AGP 的增量打包会把上一版 74 MB 的 `payload.zip` 留在原位置，
  新的一份追加到文件尾，APK 里就多出上百 MB 死数据（曾出现 170 MB 的包）。
- 用的是 `~/.android/debug.keystore`，所以能直接覆盖安装旧版。

## 界面验证（没有模拟器也能看）

这台机器没有 `/dev/kvm`，x86_64 镜像只能软件模拟，AVD 一直 system_server 重启 —— 所以界面
用 Robolectric 在 JVM 上渲染成 PNG 来验收：

```bash
/opt/gradle-8.9/bin/gradle :app:testDebugUnitTest --tests dev.adelie.app.ShellScreenshotTest
# 图在 app/build/ui-shots/，同一份拷进了 screenshots/
```

测试会真的把 Activity 建起来、量好、画到 Bitmap 上：onCreate 里任何主题属性、布局 id、
Material 组件用错都会直接让测试失败。首次运行要从 Maven 下 `android-all-instrumented`
（~190 MB）；如果卡在 `SocketException`，把那个 jar 手动放进
`~/.m2/repository/org/robolectric/android-all-instrumented/<版本>/` 再跑。
