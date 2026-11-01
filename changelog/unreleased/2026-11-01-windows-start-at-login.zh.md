# Windows 桌面端可以随登录启动，启动后在托盘待命

- **Date:** 2026-11-01
- **Type:** feature
- **Scope:** `desktop`, `server`, `web`
- **Breaking:** no

[English](2026-11-01-windows-start-at-login.md)

设置 › 外观 在 Windows 桌面端多了一行「开机自启动」：打开它，装好的 Adelie 就会在你登录这台机
时自己起来。默认关闭，打开即生效；Windows 拉起的这一次不弹窗口——应用在托盘里待命，点托盘图标
（或再启动一次应用，落到同一个窗口）就能把窗口调出来。不需要管理员权限，也不装任何服务：条目写
在当前用户自己的启动项里（`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`），卸载时一并删掉。

这一行显示的是 Windows 那份登记本身，而不是我们另存的一份偏好，所以反过来也成立：在「任务管理器 ›
启动应用」里把 Adelie 禁用掉，这里的开关就会显示为关闭——因为下次登录它确实不会起。

## 细节

- `packages/desktop/src/login-item.ts`（新，纯函数，有用例）：登录项注册用的参数
  （`--started-at-login`）、写入、读取与两个帧的解析。其中两个决定写在文件里：注册表值名用应用自己
  的名字（`Adelie`），这样卸载脚本只删一个确定的值；因此读取走
  `executableWillLaunchAtLogin` 而不是 `openAtLogin`——后者比的是以 AppUserModelId 命名的那条值，
  而我们写的不是那一条；前者回答的正是开关在问的问题：有没有哪条启动项会拉起这个可执行文件、且没被
  停用。
- 只有在真有条目可管的地方才画这一行：Windows 上的正式安装版。开发态不画——未打包的运行会把
  `node_modules` 里那个裸 `electron.exe` 写进启动项，而正式安装版跑 `--dev` 又会把「正式版的启动」
  注册在一个带 dev 后缀的名字下，两种条目用户都没法从应用里清掉。浏览器直连同一台桌面模式服务器时
  也不画，判据与托盘、宠物那两行相同。
- 由登录项拉起的那一次，主窗口照样创建、照样加载，只是从不显示，而且仅在有托盘图标时才这样：既没有
  窗口、又没有图标的进程没人能叫回来。关窗进托盘、托盘菜单、再次启动应用与 macOS 的 Dock 都走同一个
  `showMainWindow`。
- `GET`/`PUT /api/desktop/login-item`（仅限外壳自己的窗口）读写这个开关，走的是托盘图标已经在用的那
  条 utilityProcess 通道：状态是外壳最后一次从 Windows 读到的结果，补丁会校验（`openAtLogin` 必须
  是布尔；空补丁拒绝），没有外壳在听时 PUT 答 503。
- `packages/desktop/build/installer.nsh`（新，由 `nsis.include` 挂上）在卸载时把条目两半都删掉——启动
  项那条值，以及 Windows 记着它「已启用/已禁用」的那条——不留一个指向已删可执行文件的死项。

## 测试

- `packages/desktop/test/login-item.test.ts`（新，9 条）：平台与档位的支持判据、参数与近似参数的区
  分、写入的形状、状态的换算（被任务管理器禁用的条目读作关闭、不支持的平台报 `supported: false`）、
  命令帧的解析，以及卸载脚本里的值名与正式版身份名一致。
- `packages/server/test/desktop-login-item.test.ts`（新，8 条）：外壳首次推送之前 GET 为 null、推送
  之后读回；密码会话 403，非桌面模式 404；PUT 转发给外壳并答 202；非布尔或空字段 400 且不转发；没有
  外壳端口时 503；只有两个字段都齐的帧才被当作状态推送。
- 既有用例未变：`desktop` 314 条、`server` 3029 条、`web` 3374 条；三个包的 `tsc`；整仓 `oxlint`；
  `prettier --check .`。
- 在本机用 wine 打了一次 Windows 安装包，确认新加的 NSIS include 能编进卸载器。真机行为——任务管理器
  › 启动应用里出现 Adelie 且为已启用、注销再登录后应用起在托盘且不弹窗、关掉开关后该条目消失、卸载
  后不留死项——需要一台 Windows 机器来验。
