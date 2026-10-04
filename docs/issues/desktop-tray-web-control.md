---
title: "desktop: 托盘开关与托盘菜单语言只能改文件，界面里没有入口"
labels: [欠账, scope:desktop, P3]
issue: 15
---

## 现象

本轮做的托带有两个开关存在 `<userData>/tray.json` 里（`showIcon` 显示图标、
`hideOnClose` 关窗后继续运行），语言则完全没有实现。但它们现在**只有一条路能改**：

- `hideOnClose`：托盘菜单里的勾选项（这条有了）；
- `showIcon`：只能手动编辑 `tray.json` 或删掉它回到默认；
- 语言：托盘菜单文案固定中文（`tray-menu.ts` 的 `locale` 参数默认 `"zh"`，界面从不告诉
  壳该用哪种语言）。

Penguin 的对应能力是「设置 › 外观」里的一个开关 + 界面 mount 时上报语言。Adelie 的界面
（`packages/web/src/components/SettingsDialog.tsx`）现在没有任何桌面相关的设置项。

## 复现

```bash
# 壳起来之后
cat "<userData>/tray.json"        # {"showIcon":true,"hideOnClose":true}
# 想关掉图标：只能手工改文件再重启；界面里找不到这个开关
# 想把托盘菜单换成英文：改不了
```

## 期望

一条桌面专用的接口，两个动作：

- `GET /api/desktop/tray` → `{showIcon, hideOnClose, locale}`
- `PUT /api/desktop/tray` ← 任一个字段的变化

壳侧在 `main.ts` 里把请求接到 `prefs` + `tray.refresh(prefs)`（本轮已经把刷新逻辑做好，
`refresh()` 处理「图标该建的建、该毁的毁、菜单跟着重画」），界面侧加一个开关行 + 一个
`useEffect([locale])` 上报。

要注意的是**权限**：这条路由改的是壳的行为，只有桌面窗口（`sessionVia === "desktop"` 那条
判据，见 `docs/research/penguin-desktop-features.md` §3.1）该能调到，普通浏览器调它应当 403。

## 影响

- 不致命：默认值（有图标、关窗留守）对绝大多数人是对的，所以用户感觉不到「缺了什么」。
- 真正的代价在两处：① 想要「关掉图标」的人只能去翻 `tray.json`，而那个路径文档里没写；
  ② 界面语言若不是中文，托盘菜单会是中英混着的样子。
- 依赖：需要先有 `docs/api.md` 里的路由（改接口先改契约，见仓库约定）。

## 证据

- `packages/desktop/src/tray-prefs.ts`（偏好的读写都在，缺调用方）、
  `packages/desktop/src/tray-menu.ts`（`locale` 参数已留，缺上报方）。
- 参考实现：`docs/research/penguin-desktop-features.md` §1「界面控制托盘（开关）」
  「托盘跟随界面语言」两行，及 §4 对应的两条最小版本。
