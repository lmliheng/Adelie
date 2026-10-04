# Penguin 桌面端功能清单（只读研究）

> **研究日期：** 2026-10-04
> **依据版本：** `package.json` version `0.2.13`（`packages/desktop/package.json` 同为 `0.2.13`；
> electron `^43.2.0`、electron-builder `^26.16.1`、electron-updater `^6.8.9`）
> **读了什么：**
> - `packages/desktop/src/**.ts`（25 个源文件，全部读完）+ `packages/desktop/package.json`、`tsup.config.ts`、`electron-builder.yml`
> - `changelog/**` 中文件名含 `desktop` 的中文条目，以及 `changelog/**` 里提到桌面端的关键条目（更新弹窗、内置浏览器、macOS 文件夹授权、终端、系统代理、签名、在文件夹中显示、web dist 诊断、claim 链接失败）
> - `packages/web/src`：`lib/account-menu.ts`、`lib/desktop-renderer.ts`、`lib/desktop-update.ts`、`lib/update-flow.ts`、`state/use-tray-locale.ts`、`state/use-completion-notifications.ts`、`features/builtin-browser/*`、`features/settings/appearance-section.tsx`、`components/account/update-row.tsx`、`features/chat/workspace-finder.tsx`、`features/chat/workspace-finder-model.ts`、`features/chat/workspace-browser.tsx`、`components/layout/app-layout.tsx`、`components/layout/user-menu.tsx`、`features/admin/admin-users-page.tsx`、`features/models/key-auth-dialog.tsx`、`features/dock/dock-state.ts`
> - `packages/docs/content/quickstart-desktop.zh.md`、`README.zh.md` 桌面端章节
>
> 判据：**只有桌面端才会出现**的界面，靠代码里对桌面壳能力的依赖识别（`desktopMode` + `sessionVia==="desktop"`、
> `isElectronRenderer` user agent 里的 `Electron/`、`customElements.get("webview")`、`/api/desktop/*` 路由）。
> 普通 Web App 也有的功能（终端面板、聊天、Workspace、模型库本身）不列入。

## 1. 壳（Electron 进程）

| 功能 | 用户看到什么 / 能做什么 | 源码位置 | 依赖（原生模块 / 外部服务 / 平台） | 复杂度 |
| --- | --- | --- | --- | --- |
| 单实例 + 二次启动唤起 | 再点一次图标不会开出第二个应用，而是把已有窗口切到前台 | `main.ts:677`（`app.requestSingleInstanceLock`）、`main.ts:687`、`main.ts:359` `showMainWindow` | 无 | 低 |
| 主窗口形态 | 1280×860、`autoHideMenuBar`、`ready-to-show` 后才显示 | `main.ts:177-198` | 无 | 低 |
| 窗口安全基线 | 无 preload、无 Node、`contextIsolation`+`sandbox` 开；只有主窗口给 `webviewTag` | `main.ts:187-195` | 无 | 低 |
| 启动即登录（一次性令牌） | 打开就在应用里，没有登录页、不用抄初始密码 | `main.ts:613`、`util.ts:23` `desktopLoginUrl`；服务端 `/api/auth/claim?token=` | 内嵌 server | 中 |
| 附着到已有实例 | 数据根已被 `penguin web`/`penguin server`/旧版应用占用时，不再起第二个 server，改为挂上去 | `main.ts:654-670`、`@prismshadow/penguin-server/lock` 的 `liveServerLock` | 无 | 中 |
| 附着模式的自我登录 | 附着时用壳自己的权限在数据根里签发会话，写 cookie 让窗口登入 | `attach-session.ts:82` `planSignIn`、`main.ts:412` `signInFromDataRoot`、`main.ts:421` | 无 | 高 |
| 登录页兜底救援 | 会话过期 / claim 失败后落到登录页，壳自动重新登录而不是停在死页面 | `attach-session.ts:230` `createSignInGuard`、`main.ts:461` `onMainWindowNavigated` | 无 | 高 |
| 尊重「退出登录」 | 用户主动退出后不会被自动救援立刻顶回去 | `main.ts:443` `SIGN_OUT_REQUEST`（`*://*/api/auth/logout`）、`main.ts:452` `watchForSignOut` | 无 | 中 |
| 登录失败弹窗 | 读不了的数据根会弹窗给出数据根路径、占用端口/pid 与补救命令 | `attach-session.ts:146` `signInFailureDialog`、`main.ts:432` | 无 | 低 |
| 端口记忆 | 重启后界面偏好（主题、语言、面板布局）不丢 | `port-memory.ts:59` `choosePort`、`server-process.ts:597-599`（`preferred-port`） | 无 | 中 |
| 内嵌服务端 fork | 应用自带服务端，双击即可用，无需装 CLI | `server-process.ts:107` `startEmbeddedServer`（`utilityProcess.fork`） | 无 | 中 |
| 就绪探测 | 端口通告 + HTTP 探测后才开窗，避免白屏 | `server-process.ts:61` `waitForPortFile`、`:78` `waitForHttp` | 无 | 低 |
| 优雅退出 | 退出时先请服务端收尾，再兜底 kill | `server-process.ts:164` `stopEmbeddedServer`（`POST /api/desktop/shutdown`）、`main.ts:725` `before-quit` | 无 | 中 |
| 服务端崩溃自愈 | 后台任务不会因为一次崩溃就全停 | `main.ts:619` `handleServerExit`；退避 `util.ts:194` `restartDelayMs`，上限 `util.ts:191` `MAX_SERVER_RESTARTS=3` | 无 | 中 |
| 界面崩溃自愈 | 页面崩了自动重载，且不会陷入重载循环 | `main.ts:255` `reloadAfterRendererDeath`、`util.ts:206` `rendererReloadDelayMs`（0/1/2/4…≤30s）、`util.ts:199` `RENDERER_HEALTHY_MS` | 无 | 中 |
| 新窗口分类策略 | 只有预览、拆出终端会开本应用窗口；外站走系统浏览器；其余拒绝并记日志 | `util.ts:124` `classifyWindowOpen`、`util.ts:71` `PREVIEW_REDIRECT_PATH`、`util.ts:74` `TERMINAL_PATH`、`main.ts:276` `openWindowFor` | 无 | 高 |
| 子窗口加固 | 页面无法把壳给的窗口藏起来、挪到屏幕外 | `util.ts:157` `APP_WINDOW_OPTIONS`、`main.ts:321` `guardOpenedWindow`、`main.ts:323`（拒绝 `moveTo`/`resizeTo`） | 无 | 中 |
| 子窗口在登录页即关闭 | 拆出的终端窗口不会被困在用不了的登录表单后面 | `main.ts:333` `closeOnSignInPage` | 无 | 低 |
| 外链交给系统 | 点击 web / mailto 链接在默认浏览器打开；`file:` 与自定义协议一律拒绝 | `main.ts:224-229` `will-navigate`、`main.ts:349` `openInSystem`、`util.ts:81` `isExternalScheme` | 无（`shell.openExternal`） | 低 |
| 系统托盘图标 | 关窗后仍在托盘常驻，一点回来；图标按平台渲染（macOS 单色 Template） | `tray.ts:42` `installTray`、`app-icon.ts:38-52` `trayIconRelPath`/`resolveTrayIcon` | 平台托盘（Linux 需 AppIndicator）；图标资源 | 中 |
| 托盘菜单 | Open / New Session / Models / 关窗后继续运行（勾选）/ Quit | `tray-menu.ts:80` `trayMenuTemplate`、`tray.ts:103` `buildMenu` | 无 | 中 |
| 托盘平台差异 | Linux 把菜单挂在图标上；macOS/Windows 左键唤起窗口、右键弹菜单 | `tray.ts:117` `ATTACHES_MENU`、`tray.ts:127-136` | Linux 桌面环境 | 中 |
| 关闭到托盘 | 关窗默认只是隐藏，server 与后台任务继续跑 | `util.ts:251` `hidesOnClose`、`main.ts:202` `win.on("close")` | 无 | 低 |
| 托盘偏好持久化 | 两个开关（显示图标 / 关窗到托盘）与语言存在 `userData/tray.json` | `tray-prefs.ts:34` `TRAY_PREFS_FILE`、`tray-prefs.ts:97` `updateTrayPrefs`（写-改名） | 无 | 低 |
| 界面控制托盘（开关） | 设置 › 外观 的「托盘图标」开关即时生效，不用重启 | `main.ts:502` `setShowTrayIcon`、`tray-prefs.ts:118` `parseTrayCommand` | 无 | 中 |
| 托盘跟随界面语言 | 托盘菜单与窗口同语言，跨重启记住 | `main.ts:528` `setTrayLocale`、`tray-menu.ts:75` `resolveTrayLocale`、网页侧 `web/src/state/use-tray-locale.ts` | 无 | 中 |
| 应用菜单 | macOS 标准菜单 + File/Edit/View/Window/Help，外加「安装 penguin 命令」「检查更新」「Project on GitHub」 | `menu.ts:19` `installAppMenu` | 无 | 低 |
| 日志文件 | 崩溃/重启/卡死留下可发送的痕迹；5 MB 轮转、同步写、逐行时间戳 | `desktop-log.ts:46` `openLogFile`、`desktop-log.ts:126` `startDesktopLog`、`main.ts:681`（`logs/desktop.log`） | 无 | 中 |
| 进程死亡记录 | 渲染进程/子进程/无响应都记一条（类型、URL、原因、退出码） | `main.ts:691-712`、`util.ts:221` `rendererGoneLine`、`util.ts:227` `childGoneLine` | 无 | 低 |
| 登录 shell 环境导入 | Dock/桌面启动也能读到 `.zshrc` 里 export 的 API key 与真实 `PATH` | `login-shell-env.ts:217` `applyLoginShellEnv`、`:29` `SENTINEL`、`:54` `EXCLUDED_KEYS`、`main.ts:746` | 用户 shell（`$SHELL`/`/bin/zsh`/`/bin/bash`） | 中 |
| 系统代理注入 | 桌面端「跟随系统代理」真的读操作系统代理 | `os-proxy.ts:55` `osProxyEnv`（Electron `session.resolveProxy`）、`server-process.ts:135` | 平台代理设置 | 中 |
| 安装 `penguin` 命令（macOS） | 应用自带 CLI，不用装 Node，也不用 pip/npm | `cli-install.ts:84` `attemptDarwin`、`launcher.ts:62` `posixLauncherScript`、`launcher.ts:196` `adminSymlinkAppleScript` | macOS 提权（`osascript`） | 高 |
| 安装 `penguin` 命令（Windows） | 追加 `bin` 到用户 `Path`，幂等、只追加、免提权 | `cli-install.ts:126` `attemptWindows`、`launcher.ts:211` `mergeWindowsUserPath` | Windows（`reg.exe`） | 中 |
| 安装 `penguin` 命令（AppImage） | 写 `~/.local/bin/penguin` 包装脚本，把 AppImage 当 Node 跑 | `cli-install.ts:172` `attemptAppImage`、`launcher.ts:143` `appImageWrapperScript`、`launcher.ts:125` `appImageBootstrapJs` | Linux AppImage | 中 |
| CLI 安装的克制规则 | 绝不替换不是本应用写的 `penguin`；不从不稳定位置安装 | `cli-link.ts:63` `inspectSymlinkTarget`、`:88` `inspectWrapperTarget`、`:143` `isVolatileAppLocation`、`launcher.ts:45` `LAUNCHER_MARKER` | 无 | 高 |
| CLI 每次启动自修复 | 应用移动/更新后悬空的链接被重写；拒绝过提权就不再问 | `cli-install.ts:230` `ensureCliCommand`、`cli-link.ts:217` `readCliCommandState`（`cli-command.json`） | 无 | 中 |
| 把内置 CLI 交给 Agent | Agent 在会话里跑 `penguin` 用应用自带的这一份 | `launcher.ts:30` `embeddedCliEntry`、`server-process.ts:139`（`PENGUIN_CLI_ENTRY`） | 无 | 低 |
| 自动更新 | 侧边栏更新行 / 菜单「检查更新」驱动应用自我替换 | `updater.ts:297` `initUpdater`、`updater.ts:508` `checkForUpdatesManually`、`updater.ts:280` `quitAndInstall` | electron-updater + GitHub Releases（或 OSS 镜像） | 高 |
| 更新源测速与切换 | 国内网络自动改走 OSS 镜像，失败回退 GitHub | `update-source.ts:282` `selectAutoUpdateFeed`、`:225` `probeSource`、`:215` `selectMeasuredSource`、`updater.ts:101` `switchToFallbackFeed` | 阿里云 OSS + GitHub | 高 |
| 更新可用性判定 | dev 运行、deb 安装不冒充可自更新 | `update-support.ts:18` `updateSupport`、`updater.ts:284` `updatesAvailableInThisForm` | 无 | 低 |
| 更新状态快照 | 页面能显示「可更新 / 下载中 n% / 待重启」，并由 `seq` 判定一次手动检查何时结束 | `updater-status.ts:54` `nextUpdateStatus`、`:49` `initialUpdateStatus` | 无 | 中 |
| 更新签名校验 | macOS Developer ID + 公证、Windows Authenticode，更新也要过签名 | `electron-builder.yml:76-79`、`:107`、`:127-131` `publisherName` | 签名证书 + CI secrets | 高 |
| 更新调度 | 首查 20s 后，此后每 6 小时一次；自动检查安静、手动检查必有反馈 | `updater.ts:48-50`、`updater.ts:170` `scheduleChecks` | 无 | 低 |
| dev profile / `--dev` 第二实例 | 安装版也能再开一个隔离实例（独立数据、独立单实例锁、独立端口） | `app-identity.ts:54` `resolveProfile`、`:60` `appIdentity`、`:90` `desktopDataRoot`、`main.ts:120-127` | 无 | 中 |
| 数据根优先级 | `PENGUIN_HOME` > release 用 CLI 的根 > dev 用 `~/.penguin/dev-data` | `app-identity.ts:90-99`、`main.ts:644` | 无 | 低 |
| 窗口 / 托盘图标 | 各平台显示品牌图标而非 Electron 默认图 | `app-icon.ts:22` `windowIconPathFor`、`:38` `trayIconRelPath`；`scripts/render-icon.mjs`、`scripts/build-assets.mjs` | 图标资源（`build/icon*.png`、`build/tray/*`） | 低 |
| Web 资源注入与自检 | 打包版把前端钉到自带 `web-dist`，缺 `index.html` 时启动即报错 | `web-dist.ts:21` `webDistFor`、`:32` `webDistEntry`、`main.ts:582`；`electron-builder.yml:52-53` | 无 | 低 |
| macOS 文件夹授权（TCC） | Workspace 选到桌面/文稿/下载时，由应用自身去申请，放行后 Agent 也能读 | `folder-access.ts:104` `handleFolderAccessFrame`、`:70` `folderAccessReply`、`:61` `privacySettingsUrl`；`electron-builder.yml:85-90`（用途字符串） | macOS TCC | 高 |
| 内置浏览器承载（壳侧半） | 侧边栏浏览器面板的页面由壳托管，Agent 能驱动同一组标签页 | `builtin-browser.ts:116` `createBuiltinBrowserShell`、`:142` `browserSession`、`:329` `sendCdp`、`:401` `clearData`、`:369` `throttle`、`:189` `sendMetrics`、`:482` `openContextMenu` | Electron `<webview>` + CDP debugger | 高 |
| 内置浏览器规则（纯逻辑） | 分区、权限、UA、导航、favicon、右键菜单文案 | `builtin-browser-rules.ts:20` `BUILTIN_BROWSER_PARTITION`、`:59` `hardenGuestPreferences`、`:115` `plainChromeUserAgent`、`:170` `GRANTED_PERMISSIONS`、`:458` `guestContextMenu` | 无 | 中 |
| 打包（三平台） | dmg/zip、NSIS exe、AppImage/deb，产物名不带版本号 | `electron-builder.yml:70-160`、`packages/desktop/package.json` 的 `pack:*` | electron-builder、CI 3 OS 矩阵 | 高 |
| 打包决策：asar 关闭 | 壳要 fork server、Skill 从磁盘读 md、Agent 要真 shell | `electron-builder.yml:62`（`asar: false`）、`:10-13` | 无 | 低 |
| MinGit 随包（Windows） | Windows 上 Agent shell 行为与 npm 安装一致 | `electron-builder.yml:135-141`、`server-process.ts:55` `bundledShellEnv`、`:58`（`PENGUIN_BUNDLED_SHELL`） | Windows + 内置 MinGit 二进制 | 中 |
| 打包装配 | 壳 + server + CLI 各打成一个自包含 ESM 文件；只有 node-pty 与 `@penguinharness/*` 插件包落盘 | `tsup.config.ts:26-53`、`scripts/build-assets.mjs`、`scripts/esm-cjs-banner.mjs`（`require`/`__dirname` banner） | 无 | 中 |
| 冒烟钩子 | 无人值守跑一次应用并截图/退出，走正常优雅退出路径 | `main.ts:789` `armSmokeProbe`、`:787` `SMOKE_SETTLE_MS`（`PENGUIN_DESKTOP_SMOKE`、`PENGUIN_DESKTOP_SMOKE_SHOT`） | 无（无头需虚拟显示） | 低 |

## 2. 界面里桌面独有的部分

| 功能 | 用户看到什么 | 源码位置 | 触发条件（怎么才会出现） | 复杂度 |
| --- | --- | --- | --- | --- |
| 内置浏览器面板 | 与终端并列的侧栏面板：标签栏、后退/前进/刷新、地址栏（输入即开、非 URL 走 Bing 搜索）、标签页历史建议 | `web/src/features/builtin-browser/browser-panel.tsx:79`、`browser-tab-strip.tsx`、`browser-toolbar.tsx`、`address.ts` | 窗口能创建 `<webview>`（`customElements.get("webview")`，`webview-registry.ts:27`）；面板项只在桌面窗口列出（`dock-state.ts:44-56`） | 高 |
| 内置浏览器：导入系统浏览器登录态 | 工具栏菜单「从浏览器导入…」，选站点后带账号浏览 | `web/src/features/builtin-browser/import-dialog.tsx`、服务端 `/api/builtin-browser/import` | 同上；平台钥匙串 / DPAPI 可用 | 高 |
| 内置浏览器：清数据 / 主页 / 历史 | 「清除浏览数据…」「设置主页…」，历史存服务端 | `web/src/features/builtin-browser/clear-data-dialog.tsx`、`homepage-dialog.tsx`；壳侧 `builtin-browser.ts:401` | 同上 | 中 |
| 内置浏览器：负载警告与崩溃恢复 | 标签页太多/内存过高时工具栏琥珀图标；页面崩溃显示「此页面已崩溃 / 重新加载」 | `web/src/features/builtin-browser/load.ts`、`browser-panel.tsx:64-77`；壳侧 `builtin-browser.ts:189`、`:296` | 同上 | 中 |
| 对话链接的应用内菜单 | 网页链接右键 → 在内置浏览器中打开 / 在系统浏览器中打开 / 复制链接地址 | `web/src/features/chat/stream-selection-menu.tsx:123-198` | 桌面窗口（`isElectronRenderer` / `isDesktopShellWindow`） | 中 |
| 客户端更新行 + 更新弹窗 | 用户菜单里「检查更新 / 正在下载 n% / 重启以更新」，弹窗给出更新说明与确认 | `web/src/components/account/update-row.tsx:15`、`update-modal.tsx`、`lib/update-flow.ts:34` `updateModeFor`、`lib/desktop-update.ts:16` `offersClientUpdate` | `desktopMode && sessionVia === "desktop"`（`lib/account-menu.ts:30`） | 高 |
| 设置 › 外观：托盘图标开关 | 一个开关即时增删托盘图标，无需重启 | `web/src/features/settings/appearance-section.tsx:105-140`、`state/use-tray-locale.ts` | `isDesktopShellWindow` | 低 |
| 界面语言上报给壳 | 用户看不到控件，效果是托盘菜单跟界面语言一致 | `web/src/state/use-tray-locale.ts:32`（`api.setDesktopTray`） | 同上 | 低 |
| 没有「修改密码」/「登出入口」 | 账户菜单里看不到这两项——这个会话从没有过密码 | `web/src/lib/account-menu.ts:52` `offersChangePassword`、`components/layout/user-menu.tsx:139` | 同上（服务端同判据） | 低 |
| 没有用户管理 / Project 成员 | 桌面模式是单用户，相关菜单与页面不出现 | `web/src/features/admin/admin-users-page.tsx:43`、`components/layout/app-layout.tsx:355` | `desktopMode`（服务端 403 `desktop_single_user`） | 低 |
| 「在文件夹中显示」 | 文件预览标题行一枚按钮，在系统文件管理器里定位该文件 | `web/src/features/chat/workspace-browser.tsx:1625` `revealInFolder`、`:2398`；服务端 `POST /api/sessions/:id/files/reveal` | 仅桌面窗口会话（服务端 404/403 把关） | 中 |
| Workspace 选择器的「允许访问」 | macOS 被拒目录旁出现「允许访问」「打开系统设置」，放行后立即刷新 | `web/src/features/chat/workspace-finder.tsx:231-243`、`workspace-finder-model.ts:510` `deniedBox` | `isElectronRenderer` + macOS + 目录被 TCC 拒 | 高 |
| 拆出终端窗口 | 把终端标签从停靠面板拆成独立窗口，关掉后回到停靠面板 | 壳侧 `util.ts:74` `TERMINAL_PATH`、`util.ts:124` `classifyWindowOpen`、`main.ts:276` `openWindowFor`；网页侧 `web/src/features/dock/dock-terminal.ts:156` `detachTerminal`、`features/terminal/terminal-page.tsx`、`features/dock/dock-state.ts:667`（归还停靠面板） | 桌面窗口里点终端的「拆出」，`window.open("/terminal?id=…")` 被壳放行 | 中 |
| Workspace HTML 预览新窗口 | 「在新标签页打开」打开无 Node 的子窗口并跟进预览重定向 | `util.ts:70-104`（preview-redirect / `/preview/` 判定）、`main.ts:290`（预览窗口 webPreferences） | 桌面窗口内的预览入口 | 中 |
| 任务完成系统通知 | 窗口失焦时 Agent 跑完弹系统通知，点击聚焦并打开该会话 | `web/src/state/use-completion-notifications.ts:29` | `sessionVia === "desktop"` + 用户开启通知偏好（Windows toast 需 AUMID） | 中 |
| Penguin Go 授权在桌面直接打开 | 桌面窗口里点「授权」不再先开空白标签页（空白窗口一律被壳拒绝） | `web/src/features/models/key-auth-dialog.tsx:54-59`、`lib/desktop-renderer.ts:18` `isElectronRenderer` | user agent 含 `Electron/`（附着模式下也成立） | 低 |

## 3. 关键机制说明（最值得抄的 6 个）

### 3.1 壳与界面怎么通信：没有 preload，也没有渲染进程 IPC

窗口是**纯浏览器环境**（`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`，无 preload，
`main.ts:187-195`）。壳与「界面」之间只有两条路：

1. **壳 ↔ 内嵌 server**：`utilityProcess.fork` 的 `child.postMessage` / `child.on("message")`
   （`main.ts:548` `wireShellRelay`）。这条通道上的帧按 `type` 字段分发，全部是服务器 API 契约里的类型：
   - 壳 → server：`desktop-updater-status`（`updater-status.ts:99`）、`desktop-tray-status`（`tray-prefs.ts:106`）、
     `desktop-browser-reply`、`desktop-browser-event`、`desktop-folder-access-result`
   - server → 壳：`desktop-updater-command`（`updater-status.ts:104`，action `check`/`download`/`install`）、
     `desktop-tray-command`（`tray-prefs.ts:118`，patch `showTrayIcon`/`locale`）、`desktop-browser-command`
     （`builtin-browser-rules.ts:218`）、`desktop-folder-access`、`desktop-open-privacy-settings`
   - 分发顺序固定（`main.ts:550-563`）：browser → folder-access → updater → tray，任何一条 `return true` 即止。
2. **界面 ↔ server**：普通 HTTP/SSE，就是 Web App 原本那套。桌面独有的能力全是**服务器新增的 HTTP 路由**
   （`/api/desktop/update`、`/api/desktop/tray`、`/api/desktop/privacy-settings`、`/api/builtin-browser/*`、
   `/api/projects/:id/dirs/access`、`/api/sessions/:id/files/reveal`），不是渲染进程 IPC。壳把状态推给 server，
   server 存快照并让页面 `GET`；页面要动作就 `POST`，server 再通过端口把命令转给壳。

**为什么这么做**：壳是最不可更新的代码（只有重装安装包才能升级），所以能在 server 侧实现的产品行为一律不在壳里做
（`main.ts:4-10`、`packages/hmr/README.md`）。壳只保留「只有主进程能做」的四件事：CDP/cookie、
macOS TCC 读取、托盘窗格、应用菜单。相对的代价是路由必须自己判定「谁可以问」：`isDesktopShellWindow`
（`web/src/lib/account-menu.ts:30`）= `desktopMode && sessionVia === "desktop"`，服务端在每个路由上用同一对字段把关
（浏览器登录同一 server 的会话返回 403 `desktop_shell_only`）。

**环境变量清单**（fork 时注入，`server-process.ts:126-145`）：`PENGUIN_HOME`、`PENGUIN_PROFILE`、
`PENGUIN_WEB_DIST`、`PENGUIN_CLI_ENTRY`、`PENGUIN_DESKTOP_TOKEN`、`PENGUIN_PORT_FILE`、`HOST=127.0.0.1`、`PORT`；
Windows 上另有 `PENGUIN_BUNDLED_SHELL`。

### 3.2 登录态怎么从壳传给界面

三条路，按「这个 server 是不是壳自己起的」分：

- **自己起的 server**：壳生成 `randomBytes(32).toString("base64url")` 作为 `PENGUIN_DESKTOP_TOKEN`
  （`server-process.ts:123`），首屏直接加载 `http://localhost:<port>/api/auth/claim?token=…`
  （`util.ts:23` `desktopLoginUrl`），一次性的，兑换成会话 cookie。窗口本身不再有登录 UI。
- **附着到别人的 server**：一次性令牌只对壳自己 fork 的 server 有效，于是壳改用「对自己拥有的数据根签发会话」
  这条授权——和 `penguin auth token` 同一手段。`attach-session.ts:82` `planSignIn` 调 server 包的
  `mintApiToken(root, { ttlMs: ATTACH_SESSION_TTL_MS, via: "desktop" })`，把返回的 token 作为
  `penguin_session` cookie 写进 `session.defaultSession.cookies.set`（`main.ts:421`）。TTL 是 **30 天**
  （`attach-session.ts:43`），与普通浏览器登录一致——短于服务端续期窗口的会话会无论怎么用都按时过期。
  `via: "desktop"` 让服务端在 `GET /api/me` 回 `sessionVia: "desktop"`，前端据此决定哪些控件存在。
- **兜底救援**：会话过期或 claim 失败最终都会落到 `/login`。壳在两个导航事件上监听
  （`main.ts:235-238`），`createSignInGuard`（`attach-session.ts:230`）是一个三态状态机：一次停留只救一次、
  壳自己加载过去的 URL 不算「已登录证据」、**用户主动退出登录必须生效**——退出登录由
  `session.webRequest.onCompleted` 监听 `*://*/api/auth/logout` 识别（`main.ts:443-458`）。
  失败时弹 `signInFailureDialog`（数据根、占用端口/pid、`penguin server reset-admin-password`）。
- 子窗口落到登录页直接关闭（`main.ts:333`），让拆出的终端回到主窗口停靠面板。

### 3.3 上游怎么装 CLI

应用自带完整 CLI，靠**把 Electron 自己当 Node 跑**，不需要系统 Node：

- 打包时 `tsup` 把 `../cli/dist/penguin.js` 打成 `dist/penguin.js`，`scripts/build-assets.mjs`
  按平台生成 `<app>/bin/penguin`（`launcher.ts:62` `posixLauncherScript`）或 `bin\penguin.cmd`
  （`launcher.ts:103`），脚本里 `export ELECTRON_RUN_AS_NODE=1` 后 exec Electron 二进制 + CLI 入口。
- PATH 暴露按平台分三条（`cli-install.ts`）：macOS symlink `/usr/local/bin/penguin`（EACCES/EPERM 才走
  `osascript … with administrator privileges`，`launcher.ts:196` `adminSymlinkAppleScript`）、
  Windows 幂等追加 `HKCU\Environment` 的 `Path`（`launcher.ts:211` `mergeWindowsUserPath`）、
  AppImage 写 `~/.local/bin/penguin` 包装脚本。deb 由 postinst 建 `/usr/bin/penguin`。
- **两个「绝不」**：不替换不是本应用写的 `penguin`（靠 `LAUNCHER_MARKER` 与 `Bundled/Resources/app/bin/penguin`
  路径判定，`cli-link.ts:63/88`）；不从不稳定位置安装（dmg 挂载点、Gatekeeper translocation，
  `cli-link.ts:143`）。用户拒绝过管理员授权就记进 `cli-command.json` 并停手（`cli-install.ts:238`），
  菜单项是唯一重来入口。
- 每次启动都跑 `ensureCliCommand()`（`main.ts:777`），这既是安装也是**修复**——应用移动/更新后的悬空链接会被重写。
- 反向一步：壳把自己这份 CLI 入口以 `PENGUIN_CLI_ENTRY` 交给 server（`launcher.ts:30`），
  Agent 在会话里跑的 `penguin` 就是应用自带的这一份。

### 3.4 更新怎么做（谁签名、从哪拉）

- 用 `electron-updater`（`updater.ts:45` `autoUpdater`）。`autoDownload = false`、`autoInstallOnAppQuit = false`
  （`updater.ts:313-314`）：**检查只看**，下载与重启都是用户的显式动作。
- Feed 默认是 GitHub Releases（`GITHUB_FEED`，owner `Prism-Shadow`/repo `penguin-harness`），
  但启动时会做一次**双源测速**（`update-source.ts:282` `selectAutoUpdateFeed`）：先固定 tag，读该 tag 的
  `release-download-manifest.tsv`，验证小探针（字节数 + sha256），再比较大探针速度；GitHub ≥ 256 KiB/s 就用 GitHub，
  否则 OSS 快 1.5 倍以上才切到阿里云 OSS 镜像（`OSS_ORIGIN`，`update-source.ts:16`）。测试不确定就用 GitHub。
  下载失败还会切到备用 feed 重试一次（`updater.ts:101` `switchToFallbackFeed`）。
- **签名**：macOS 走 Developer ID + 公证（`electron-builder.yml:76-79`，`notarize: true`），Windows 走
  Authenticode（EVSign，`electron-builder.yml:107-131`）。`publisherName` 里同时列当前与上一张证书的完整 DN 与裸 CN
  ——electron-updater 用**已安装客户端**记录的名单校验下载到的包，所以这是给下一次证书轮换留的后路；
  删掉该字段等于跳过签名校验，绝不可行。
- 状态机与界面：`nextUpdateStatus`（`updater-status.ts:54`）把 electron-updater 事件折叠成快照，并带
  **三条抑制规则**（已下载 > 瞬时噪声；下载中不因并发检查丢上下文；已 offer 的版本不闪烁），
  快照带 `seq` 递增，供前端判定一次手动检查「已结束」。快照经端口推给 server 的 `GET /api/desktop/update`，
  页面 `POST /check|/download|/install` 反过来驱动壳；原生菜单路径与页面路径**共用一个状态**，只是前者用对话框、
  后者用弹窗（`updater.ts:202` `reportUpdaterError`）。
- 渠道节制：dev profile 一律 `unsupported: dev`；Linux 只有 AppImage 自更新（deb 归包管理器，
  `update-support.ts:18`）。

### 3.5 托盘怎么做（图标、菜单项、偏好存哪）

- **图标**：`scripts/render-icon.mjs` 从品牌 SVG 渲染入库到 `build/tray/`——Windows/Linux 32px 彩色（+64px
  `@2x`），macOS 16px 单色 `trayTemplate.png`（+32px `@2x`）。macOS 的模板图是蒙版：渲染脚本只取企鹅躯干路径的
  外层子路径（肚皮成为实心轮廓），两条断言守住「模板图无颜色」与「占比 ≥ 30%」。
  `scripts/build-assets.mjs` 把整套复制进 `dist/tray/`，壳按应用目录相对路径查找（`app-icon.ts:38`），
  源码运行与打包版读同一套布局。缺失图标只是没有托盘，不影响启动（`tray.ts:43`）。
- **菜单**：`tray-menu.ts:80` `trayMenuTemplate` 返回**纯数据**（Open `<app name>` / 分隔 / New Session / Models /
  分隔 / 「关闭窗口后继续在托盘中运行」勾选 / 分隔 / Quit），`tray.ts:103` 每次弹出时**重新构建**，
  所以勾选状态永远是当下的值。导航项就是普通 URL（`TRAY_NAV_PATHS`：`/chat/new`、`/models`），
  壳导航 = `win.loadURL`，因此窗口仍是纯浏览器、壳不需要任何进页面的通道。
  文案在 `tray-menu.ts:52` `TRAY_LABELS` 写了两份（壳不能 import `packages/web`），类型保证漏译是编译错误。
- **平台差异**：Linux 的 AppIndicator/StatusNotifierItem 不发 `click`/`right-click`，只能挂
  `setContextMenu`（`tray.ts:117` `ATTACHES_MENU`）；macOS/Windows 左键唤起窗口、右键弹菜单（macOS 的 Ctrl+click 也算右键）。
- **偏好**：`userData/tray.json`，两个布尔 + 一个语言（`tray-prefs.ts:34`）。读不出来即默认全开；
  写入是 write-then-rename（`:82`）且两个写入方（外观开关、菜单勾选）都走 read-modify-write（`:97`），不会互相覆盖。
- **关窗到托盘**必须三个条件同时成立（`util.ts:251` `hidesOnClose`：未在退出中、图标在、偏好开），
  因为「有 app 在跑、既没窗口也没托盘图标」是用户逃不出去的状态，必须永不产生。

### 3.6 内置终端用什么、原生模块怎么打包

- 终端本身在 **server 侧**（`/api/terminals`，pty 跑在守护进程里，WebSocket 数据面），壳不参与。
  相关桌面端工作在**打包**：node-pty 是唯一无法被 bundler 吸收的原生模块——server 通过
  `createRequire(import.meta.url)("node-pty")` 取用，node-pty 加载器再按**包相对路径**找
  `build/Release/pty.node` 或 `prebuilds/<platform>-<arch>/pty.node`（darwin 还要 exec `spawn-helper`）。
- 因此 `scripts/build-assets.mjs` 在 `dist/node_modules/node-pty` 放一份**真实的包目录**
  （`pty-payload.ts:98` `stageNodePty`）：只带 `package.json`、两份 LICENSE、`lib/`、`build/Release/`、
  `prebuilds/`，丢掉 `.map`/`.test.js`/`.pdb`/`.lib`。落盘 5.4 MB（原装含 44 MB Windows `.pdb`）。
- 一个必须的修复：node-pty 发布的 darwin `spawn-helper` 权限是 `0644`，会让 `posix_spawnp` 拒绝执行，
  必须在**打包前** chmod 755（`pty-payload.ts:89`）——签名后位于 `/Applications` 的 `.app` 运行期改不了。
- `hostBinding`（`pty-payload.ts:117`）检查落盘副本里有没有**宿主平台能加载**的 binding：node-pty 不发布 Linux
  prebuild，只看「有没有 pty.node」会漏掉 Linux 上 node-gyp 没跑的情况，因此构建期直接失败。
  `scripts/terminal-smoke.mjs` 在 Electron 自带 Node 下真跑一次解析。
- `electron-builder.yml` 的 `npmRebuild: false` / `nodeGypRebuild: false`（`:67-68`）也来自这一点：
  N-API，直接用发布的二进制。

## 4. 每个功能的「最小可移植版本」

**第 1 节（壳）**

- 单实例 + 二次启动唤起：`app.requestSingleInstanceLock()`，失败就 `app.quit()`，`second-instance` 里
  `win.show()+focus()`。零依赖。
- 主窗口形态：`new BrowserWindow({ width, height, show: false, autoHideMenuBar: true })` + `ready-to-show` 再 show。
- 窗口安全基线：`webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }`，不写 preload。
  要 `<webview>` 时只在主窗口开 `webviewTag`。
- 启动即登录：本地起一个 HTTP 服务，生成一次性 token，首屏 `loadURL("http://localhost:<port>/login?token=…")`，
  服务端校验后种 cookie。
- 附着到已有实例：写一个 `<dataRoot>/server.lock`（pid + port），启动时读它，pid 活着就直接用那个 origin。
- 附着模式自我登录：读数据根的本地库，写一行 session 记录，再用 `session.defaultSession.cookies.set` 种 cookie。
  最小版可以只种一个自签的 JSON token。
- 登录页兜底救援：监听 `did-navigate` / `did-navigate-in-page`，URL 落在登录路由就重签一次 cookie 并跳回首页；
  用一个布尔记住「这次停留已救过」避免循环。
- 尊重退出登录：`session.webRequest.onCompleted` 过滤 `*/logout`，命中就置一个「别再救」标志。
- 登录失败弹窗：`dialog.showMessageBox`，正文写清数据根与补救命令，只有一个按钮。
- 端口记忆：把上次真实端口写进 userData 下的小文件，下次先探测该端口是否空闲（`net.createServer().listen`
  看 `EADDRINUSE`），闲则复用之，否则 `PORT=0`。
- 内嵌服务端 fork：`utilityProcess.fork(entry)`（或 `child_process.fork`），随包一个自包含的 server 产物。
- 就绪探测：循环读端口通告文件 + `fetch(origin, { redirect: "manual" })` 直到成功或超时。
- 优雅退出：`before-quit` 里 `event.preventDefault()`，先 `POST /shutdown`（带 Bearer token），等 exit 或超时后
  `child.kill()`，最后 `app.quit()`。
- 服务端崩溃自愈：`child.on("exit")` 里 `setTimeout(restart, 1000*2**attempt)`，上限 3 次后弹错误框并退出。
- 界面崩溃自愈：`webContents.on("render-process-gone")` → `reload()`，连续失败时把等待指数加大；页面存活 60s 就清零计数。
- 新窗口分类策略：`setWindowOpenHandler` 里只 allow 自己认识的两三条路径（前缀匹配），`http(s)/mailto` 其余
  `shell.openExternal` 后 deny，剩下全 deny 并记日志。
- 子窗口加固：给 allow 的分支写 `overrideBrowserWindowOptions`，显式钉 `show: true, skipTaskbar: false,
  opacity: 1, transparent: false, focusable: true`；`did-create-window` 里 `center()` 并
  `event.preventDefault()` 掉 `content-bounds-updated`。
- 子窗口在登录页即关闭：子窗口的 `did-navigate` 命中登录路由就 `child.close()`。
- 外链交给系统：`will-navigate` 里非本 origin 一律 `preventDefault()` + `shell.openExternal`，
  且只放行 `http:`/`https:`/`mailto:`。
- 系统托盘图标：`new Tray(nativeImage.createFromPath(icon))`，macOS `setTemplateImage(true)`，
  路径不存在就跳过托盘（不要让它阻断启动）。
- 托盘菜单：`Menu.buildFromTemplate`，每次弹出前重建，使勾选状态是当下值。
- 托盘平台差异：`if (process.platform === "linux") tray.setContextMenu(menu)`；其余用
  `tray.on("click")` / `on("right-click")` 手动 `popUpContextMenu`。
- 关闭到托盘：`win.on("close")` 里当「未退出中 && 托盘存在 && 偏好开」时 `preventDefault()` + `hide()`。
- 托盘偏好持久化：userData 下一个 JSON，读坏了当默认值；写用 `writeFileSync(tmp)` + `renameSync`。
- 界面控制托盘：页面 `PUT /api/desktop/tray`，server 存快照并经进程端口通知壳；壳改完再推回一个状态帧。
- 托盘跟随界面语言：页面 mount 与语言变化时上报 locale；壳持久化并在下次启动画菜单前先读它。
- 应用菜单：`Menu.setApplicationMenu(Menu.buildFromTemplate([...]))`，自己加几项 shell 动作 + `role` 复用标准项。
- 日志文件：一个同步 `fs.writeSync` 的 append 器，每行 ISO 时间戳，超过 5 MB 时 `rename` 成 `.1`；写失败就关掉日志、绝不上抛。
- 进程死亡记录：`app.on("render-process-gone")` / `app.on("child-process-gone")` / `webContents.on("unresponsive")`
  各记一行（类型、URL、原因、退出码）。
- 登录 shell 环境导入：spawn `$SHELL -i -l -c "printf SENT; env -0; printf SENT"`，5s 超时，
  只填缺不覆盖，PATH 做合并、排除 `TERM`/`SHLVL`/`ELECTRON_RUN_AS_NODE` 等。
- 系统代理注入：`session.defaultSession.resolveProxy("http://example.com/")`，把 `PROXY host:port` 解析成
  `HTTP_PROXY`/`HTTPS_PROXY` 注入子进程 env，已存在的值不覆盖。
- 安装 `penguin` 命令（macOS）：生成一个 `bin/penguin` 脚本，内容
  `ELECTRON_RUN_AS_NODE=1 exec <可执行文件> <入口.js> "$@"`，再 symlink 到 `/usr/local/bin/penguin`；
  写入被拒才走一次提权（`osascript … with administrator privileges`）。
- 安装 `penguin` 命令（Windows）：同一个脚本模板，改为幂等地把 `<app>\bin` 追加到 `HKCU\Environment` 的 `Path`
  （`reg add … /t REG_EXPAND_SZ`），无需提权。
- 安装 `penguin` 命令（AppImage）：写一个 `~/.local/bin/penguin` 包装脚本，内容是
  `ELECTRON_RUN_AS_NODE=1 exec <AppImage 路径> -e '<引导 JS>' -- "$@"`。
- CLI 安装的克制规则：写之前 `lstat` 目标，非本程序写的（无 marker）一律跳过并记录；macOS 检查路径是否
  `/Volumes/` 或 `/AppTranslocation/`，是就不装。
- CLI 每次启动自修复：启动时跑一次同步检查，`current`/`absent`/`ours`/`foreign` 四态决定跳过或重写。
- 把内置 CLI 交给 Agent：把入口路径以环境变量交给子进程，让子进程用同一份。
- 自动更新：用 `electron-updater`，`autoDownload=false`，`setFeedURL({provider:"github", owner, repo})`，
  每次检查只落到 `available`，下载与 `quitAndInstall()` 由用户动作触发。
- 更新源测速与切换：可简化为「一个主 feed + 一个备用 URL，主 feed 报错就 `setFeedURL` 换过去重试一次」。
- 更新可用性判定：`if (!app.isPackaged) return unsupported`；Linux 上再要求 `process.env.APPIMAGE` 存在。
- 更新状态快照：一个 `{state, version, percent}` 对象 + 一个递增 `seq`，页面轮询 `GET`，动作走 `POST`。
- 更新签名校验：签名与公证交给 electron-builder 的 CI 配置；**无论如何不要删 `publisherName`**，否则更新校验被跳过。
- 更新调度：`setTimeout(20_000).unref()` + `setInterval(6h).unref()`。
- dev profile / 第二实例：用命令行开关切 `app.setName()`（不同 userData ⇒ 不同单实例锁与 Chromium profile），
  再按 profile 选数据根。
- 数据根优先级：`env.PENGUIN_HOME ?? (profile === "release" ? releaseRoot() : devRoot)`，一行三元。
- 窗口 / 托盘图标：随包放 PNG，按 `app.getAppPath()` 相对路径找；macOS 用 `…Template` 命名单色图。
- Web 资源注入与自检：打包时把前端 dist 映射进应用目录，fork server 前 `fs.existsSync(dist/index.html)`，
  缺了就抛出带路径的错误。
- macOS 文件夹授权：`fs.promises.readdir(dir)` 在应用进程里读一次（触发 TCC 询问），回复 `{granted, code}`；
  「打开系统设置」用 `shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders")`。
- 内置浏览器承载（壳侧半）：主窗口 `webviewTag: true` + 固定 `partition` + `will-attach-webview` 里
  `event.preventDefault()` 除非分区与 src 合规，`did-attach-webview` 后 `wc.debugger.attach("1.3")` 转发
  命令与事件；「只用 Electron 自带能力」的版本可以只做标签列表 + 后退/刷新 + 导航，不做 CDP。
- 内置浏览器规则：把这些判断写成**纯函数**（分区、scheme 白名单、UA 清理、权限白名单、右键菜单数据），
  壳里只剩调用与 Electron 绑定。
- 打包：electron-builder 三个 target（dmg+zip / nsis / AppImage+deb），`asar: false`，产物名不带版本号。
- asar 关闭：`asar: false`，让子进程 fork、磁盘读 md、真 shell 都能照常工作。
- MinGit 随包：`extraResources` 放一份 sh.exe，fork 时把它作为 `PENGUIN_BUNDLED_SHELL` 注入。
- 打包装配：用 esbuild/tsup 把入口各打成一个自包含 ESM 文件，`electron` 保持 external；
  被打包进来的 CJS 依赖需要 banner 声明 `require`/`__dirname`/`__filename`。
- 冒烟钩子：环境变量开关 → `did-finish-load` 后等 2.5s，`capturePage()` 存 PNG，打印一行 JSON，`app.quit()`。

**第 2 节（界面）**

- 内置浏览器面板：`<webview>` 元素 + 自建标签数组，标签栏/工具栏/地址栏三块 UI；地址栏「是 URL 就导航、
  否则拼搜索 URL」。不需要 CDP 也能有完整的人用浏览器。
- 内置浏览器：导入系统浏览器登录态：最小版只做「导入 cookie 到 `<webview>` 分区」，且**必须**只读副本文件；
  跨平台解密（钥匙串/DPAPI）不建议在没有原生能力时尝试。
- 内置浏览器：清数据 / 主页 / 历史：`session.fromPartition(...).clearStorageData()` / `clearCache()`；
  主页与历史就是服务端两个 JSON 文件 + 两个路由。
- 内置浏览器：负载警告与崩溃恢复：`webContents.on("render-process-gone")` → 在 UI 里显示「已崩溃 + 重新加载」；
  负载用 `app.getAppMetrics()` 按 pid 汇总，超过阈值给一个图标提示。
- 对话链接的应用内菜单：判断 `navigator.userAgent` 含 `Electron/`，就渲染自己的右键菜单而非依赖系统菜单。
- 客户端更新行 + 更新弹窗：一个共享的 `updateFlow` 状态机 + 一个「打开面板」的行；按钮只发三个动作（check/download/install）。
- 设置 › 外观：托盘图标开关：一行 `ToggleRow`，初值 `GET`，变化 `PUT`，失败静默。
- 界面语言上报给壳：一个 `useEffect([locale])` 里 `PUT /api/desktop/tray {locale}`，失败忽略。
- 没有「修改密码」/「登出入口」：把这两个控件的显示条件写成一个纯谓词（两个布尔字段的与），并在 UI 与后端路由上共用同一谓词。
- 没有用户管理 / Project 成员：`if (desktopMode) return null`（服务端同时返回 403 兜底）。
- 「在文件夹中显示」：服务端 `POST /reveal`，按平台 `open -R` / `explorer.exe /select,` / `xdg-open`，
  子进程 detached + unref，路径先做与读文件相同的越界校验。
- Workspace 选择器的「允许访问」：被拒时渲染一个说明框 + 一个按钮 → `POST /dirs/access` → 成功后重新列目录；
  「打开系统设置」按钮只在 macOS 且是桌面窗口时出现。
- 拆出终端窗口：`window.open("/terminal?id=…", …)`，壳允许该路径弹窗；关闭时用 `window.opener` 把标签还给面板。
- Workspace HTML 预览新窗口：`setWindowOpenHandler` 允许自己站内的预览重定向路径，用同样的无 Node webPreferences 开子窗口。
- 任务完成系统通知：`new Notification(title, { body, tag })`，只在 `document.hidden || !document.hasFocus()` 时发，
  点击 `window.focus()` + 导航，每次检查 `Notification.permission`。
- Penguin Go 授权在桌面直接打开：`if (/Electron\//.test(navigator.userAgent))` 就直接设
  `location.href = authUrl`，不走「先开空白标签页再导航」的浏览器路径。

## 附：这次**没有找到**的东西

- 壳**没有** preload 脚本，也没有任何 `window.penguin` / `window.electron` 之类的桥（全仓 `packages/desktop`
  里无 preload 文件，`webPreferences` 也没有 `preload` 字段）。界面拿到的桌面能力全部经 HTTP 路由。
- 壳**没有**启动画面（splash）实现：只有「`ready-to-show` 前不显示窗口」这一条（`main.ts:198`）。
- 托盘**没有**「最近会话」子菜单、也没有「有任务在跑」指示——changelog 明确记为刻意不做，因为壳不向 server 查询状态
  （`changelog/0.2.13/2026-09-12-desktop-tray.zh.md`）。
- 没有 `docs/` 下独立成篇的「桌面端架构」文档：只有 `packages/docs/content/quickstart-desktop.zh.md`
  这一篇面向用户的快速上手。
