# 桌面端：Windows 安装器带上 Adelie 自己的侧栏与页眉图

- **Date:** 2026-10-06
- **Type:** feature
- **Scope:** `desktop`

[English](2026-10-06-desktop-installer-artwork.md)

NSIS 的助式安装器要画两张图，而这两张原先都不是 Adelie 的：欢迎页与完成页的侧栏回落到 NSIS 自带的
`${NSISDIR}/Contrib/Graphics/Wizard/nsis3-metro.bmp`，内页的页眉栏则一片空白。于是在 Windows 上装
Adelie 的人，看到的是 NSIS 自己的品牌标识 —— 一张过时、分辨率不高的位图 —— 围着 Adelie 的名字，
而页眉上没有我们任何标识。

现在两张图都由应用图标那一份不可变品牌标记渲染（`packages/web/public/adelie-icon.svg`）：深蓝侧栏带
标记、字标与一行小字，浅色页眉条带标记与字标。它们以 24 位 BMP 提交在
`packages/desktop/build/nsis/` 下，在 `electron-builder.yml` 里接线（`nsis.installerSidebar`、
`nsis.installerHeader`；卸载器复用侧栏），并由 `packages/desktop/test/installer-art.test.ts` 钉住。

## Desktop

- `scripts/render-installer-art.mjs` 按目标尺寸原样绘制 —— 侧栏 164×314、页眉 150×57 —— 画在 canvas
  上，BMP 由脚本自己编码（不引图片库、不做缩放）。这两个尺寸与 24 位深度都是 NSIS 自己的要求：尺寸
  不对、或 32 位的位图会被**静默忽略**，回落成自带图与空白页眉。`test/installer-art.test.ts` 读这两份
  已提交的位图头，尺寸一有偏差就失败，同时校验配置里指的仍是这两个文件。
- 重新生成是手工步骤（`node packages/desktop/scripts/render-installer-art.mjs`），逐字节可复现；
  它用的是 Web 包测试本来就装的 Playwright chromium。
