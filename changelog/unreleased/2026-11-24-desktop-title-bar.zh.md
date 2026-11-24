# 桌面应用顶部那条标题栏改由应用自己画，颜色跟着主题走

- **Date:** 2026-11-24
- **Type:** feature
- **Scope:** `desktop`, `server`, `web`

[English](2026-11-24-desktop-title-bar.md)

Windows 和 Linux 上，窗口最上面那条标题栏一直是操作系统画的：背景是系统配色，白底就是白底、深色
就是深色 —— 它是整个应用里唯一一块任何主题都够不着的地方，换了主题、导入了主题，这条还是老样子。
现在窗口不再带系统标题栏，由页面自己在导航栏和主区**之上**画一条，背景取自主题的 chrome 面，所以
内置主题和导入主题都跟着变。

最小化、最大化、关闭这三个按钮仍然是系统的：Electron 把它们画在页面之上（Window Controls Overlay），
窗口因此还是能拖动、能关掉。它们的底色和符号颜色由页面读主题令牌算出来交给壳，主题一换就重新交一次。
macOS 不动 —— 那三个红黄绿按钮是它自己的那一条，这版本来也没有 macOS 包，不该由它来开这个头。

## 细节

- **壳（`packages/desktop`）**：新增 `src/title-bar.ts`（`titleBarWindowOptions` / `titleBarStatusMessage` /
  `parseTitleBarCommand` / `overlayOptionsFor`）。窗口创建时带上 `titleBarStyle: "hidden"` 与
  `titleBarOverlay`（高 32，与系统标题栏同高）；启动后把「这条标题栏交给你画了」推给页面；收到页面
  发来的两个颜色就调 `setTitleBarOverlay` 重新给按钮上色，失败只记一行日志。只有 Windows 与 Linux
  会这么做，macOS 的窗口选项与状态都表示「照旧」。
- **服务端（`packages/server`）**：新增 `GET/PUT /api/desktop/title-bar`（只有桌面壳自己的会话能访问，
  与托盘、桌宠那几条同一条继电器）。GET 读壳最近推来的状态，PUT 把两个颜色转给壳；颜色不是非空字符串
  或被请求里一个颜色都没有就回 400，壳没接上回 503。线上类型、`platform.ts` 的路由表和 `ifaces.json`
  一并更新。
- **前端（`packages/web`）**：新增 `components/layout/desktop-title-bar.tsx`，挂在 `AppLayout` 最外层。
  它只在「桌面壳自己的窗口」且壳明确说交出了标题栏时才画；窗口标题复用页签标题那份实时值；拖动区由
  `styles.css` 里一条 `-webkit-app-region: drag` 提供；根元素上任何属性变化（主题切换就写在这上面）
  都重新读一次令牌并重新上报颜色。
- **颜色要落到 sRGB 再发**：令牌的值常常是 `var()` 链，最后落到 `oklch(...)`（Tailwind 那套灰度），
  Electron 的控件认不了这个写法，实测会报 `Could not parse color as CSS color` 然后保持默认色。所以
  先用一个探针元素把令牌解析成一个颜色、再涂进 1×1 画布读回像素，发出去的就是 sRGB 的 `#rrggbb`。
- 没有新依赖，没有动存储格式。

## 测试

- `packages/desktop/test/title-bar.test.ts`（新，10 条）：只给 Windows/Linux 交出标题栏、窗口选项与
  状态两个平台的分岔、命令解析只认自己的那一帧、以及「字母表里没有的颜色不会当成 undefined 发下去」。
- `packages/server/test/desktop-title-bar.test.ts`（新，8 条）：GET 先回 null 再回壳推来的状态、密码
  会话 403、非桌面模式 404、PUT 转发与 202、非法颜色与空请求 400、壳没接上 503，以及同一条继电器上
  标题栏的帧不会和托盘、桌宠的串台。
- `@adelie/desktop`、`@adelie/server`、`@adelie/web` 的 `tsc --noEmit` 全过，`oxlint`、`prettier --check`
  全过；`@adelie/web` 全量单测 356 个文件通过。
- **真机**：本机（Linux，支持 overlay）用 Xvfb 跑真正的 Electron 壳，通过调试端口驱动窗口量到的结果 ——
  标题栏高 32px、拖动区在、文字是窗口标题；内置浅色主题下背景是 `oklch(0.985 0 0)`、发给壳的是
  `#fafafa` / `#171717`；切到深色变成 `#202020` / `#d6d6d6`；换上一个导入主题（`--ui-surface-muted`
  写成 `#7a3b2e`）后背景与发给壳的颜色都跟着变成该主题的值。壳里不再出现解析失败的日志。三态整窗
  截图见工作区 `titlebar-shots/`。

## 兼容性

旧壳不推这条状态，页面读不到就不画，照旧用系统的标题栏；这次只新增一个路由与一组推拉帧，没有改动
任何已有字段。
