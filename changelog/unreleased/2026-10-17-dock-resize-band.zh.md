# 下侧栏的拖拽边界整条都能抓

- **Date:** 2026-10-17
- **Type:** fix
- **Scope:** `ui`, `web`

[English](2026-10-17-dock-resize-band.md)

底边停靠栏（下侧栏）的上边界是一条 6 px 的拖拽带，用它上下拖动改高度。这条带子过去以框架顶边为中心横跨两侧 —— 但框架自己是 `overflow-hidden`（动画收缩尺寸时要裁内容），于是伸到框架外面的那一半被裁掉：真正能抓的只剩内侧 3 px，而屏幕上看到的那条边界线（框架的 1 px 边线）恰好落在被裁掉的一侧、按下去毫无反应。

现在这条带子整体贴在框架顶边以内（`top-0`，仍是 6 px），不再被裁：边界线以下 6 px 都能拖，指针也在这 6 px 里变成上下箭头。右侧栏那条（列与列之间的竖带）没有裁剪它的祖先，照旧跨在边界上；全屏时那条仍由框架的固定定位「座位」托着，位置不变。

## 细节

- `packages/ui` 的 `ResizeHandle`：`edge="start"` 在 `axis="y"` 时由 `-top-[3px]` 改为 `top-0`，并在常量旁写明缘由。
- `packages/web` 的 `dock-panel.tsx` 只改注释：边界柄沿顶边放、且贴在内侧。
- `test/resize-handle.test.ts` 那条断言跟着改，并补上「x 轴仍跨在边界上」的对照。

## 验证

真服务端 + 真浏览器（一次性数据根、`localhost`、Chromium）：改前在拖拽带中心 `elementFromPoint` 命中的是停靠栏框架本身、按下拖动高度变化为 **0**；改后在同一点命中拖拽带，向上拖 120 px 高度 **276 → 394**（+118）。浏览器 e2e 的 `dock.spec.mjs`「sizes and the arrangement survive a reload」由红转绿。
