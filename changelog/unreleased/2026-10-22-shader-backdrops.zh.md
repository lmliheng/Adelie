# 组件库多了一族 GPU 背景，画不了就画同色的静态替身

- **Date:** 2026-10-22
- **Type:** feat
- **Scope:** `ui`, `ui-gallery`
- **Breaking:** no

[English](2026-10-22-shader-backdrops.md)

组件库（`@adelie/ui`）多了一族背景：一片会自己漂移的**色彩场**（两色在 oklab 里流动，压一层很轻的噪点，
可选跟着指针的拖尾），和一排**点阵**（一个颜色一个间距的「工程纸」，可以静止也可以微闪）。它们建在 MIT 的
[`shaders`](https://www.npmjs.com/package/shaders) 上，走 WebGPU 画。

这族东西最要紧的一条不是好看，而是**不会破相**：盒子会先问这一台设备到底画不画得了（WebGPU 探针，加上系统
的「减少动效」设置），画不了就把调用方给的静态替身放进同一个盒子里 —— 同色的渐变、或一排 CSS 点。设备中途把
画布收回去（显存不够、驱动掉了），也会立刻切回替身。首帧永远是替身：探针是异步的，猜一次会让页面先闪一下。

颜色是**必填的 props，组件自身没有颜色**：GPU 画布读不到 CSS 变量，所以谁用谁把当前主题的色值传进来。
画廊里多了一个「着色器」话题，按当前主题的底色、强调色与分隔线色演示这两块，并显示它此刻画的是画布还是
替身。

## 细节

- `packages/ui/src/components/shaders/`：`shader-support.ts`（决策表写成纯函数 + 挂载后才探针的 hook）、
  `shader-surface/shader-surface.tsx`（那个盒子，GPU 那条路才渲染 `<Shader>`，并 `aria-hidden`）、
  `aurora-backdrop/`（MeshGradient + SimplexNoise + 可选 CursorTrail）、`dot-grid-backdrop/`（DotGrid 静止 / 微闪）。
- 画廊：新话题 `shaders`（`topics.ts` / `boards.tsx` / `boards/shaders.tsx` / `shader-colors.ts` 与两份文案）。
- 依赖：`shaders@^4.0.5`，只进 `@adelie/ui`；Web 应用的发行产物里不带它（未被引用，树摇掉了）。

## 兼容性

- 没有接口、数据、配置格式或既有组件的变化；这一族是新增的。
- 目前**还没有任何页面在使用**它们；先在画廊里可用、可看。
