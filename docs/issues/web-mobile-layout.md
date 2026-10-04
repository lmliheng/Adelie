---
title: "web: 360–390px 下整页被撑到 433px，浏览器把界面整体缩小"
labels: [bug, scope:web, P2]
---

## 现象

实测（4000 端口的真实构建，Chromium 两种视口）：

| 视口 | `documentElement.scrollWidth` | `visualViewport.scale` | 结果 |
| --- | --- | --- | --- |
| 390×844 | **433** | 1 | 横向可滚 43px |
| 360×640 | **433** | — | 横向可滚 73px |
| 390×844 + `isMobile: true`（真手机行为） | `innerWidth` 直接变成 **433** | 1 | 整页被缩到约 0.9，12px 的字实际更小 |

撑宽的是**顶栏的最小内容宽**：`.topbar` 与 `.shell` 都被拉到 433（`body` 自身没问题）。
按 `global.css` 里的值加起来：`.brand` 87 + 连接胶囊 ≈40 + 身份胶囊 `.who` 99（含 `管理员` 徽标 ≈30）
+ 4 个 40px 图标按钮 + `gap: 8`×7 + 左右 padding ≈ **456**。

`≤560px` 已经藏掉了连接文字（`.conn-label`）、`≤900px` 藏掉了工作区路径（`.brand-workspace`）、
`≤560px` 藏掉了命令面板入口（`.palette-open`），**仍然不够**。

顺带量到的两处：

- `打开会话列表` 按钮被 flex 挤成 **37×40**（`.iconbtn` 是 40×40，但没写 `flex: none`）；
- 身份胶囊在 390 下换成两行（`.who-admin` 那个 `管理员` 徽标没地方站）。

## 复现

```bash
# 手机（或 devtools 选 iPhone 12）打开 http://<host>:4000/ ，右侧有一条 43px 的空白/横向滚动
# 机器上：
CHROME_PATH=~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome node mobile-audit2.mjs
#   要点：newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
#        → 进主界面 → 读 document.documentElement.scrollWidth 与 visualViewport.scale
```

## 期望

`≤560px` 一屏放得下，且**不缩放**（`scrollWidth === innerWidth`）：

- 顶栏只留：菜单 / 品牌 / 连接点 / 身份（图标 + 截断的名字，`管理员` 徽标窄屏不显示）/ 主题 / 设置。
  「用户管理」不在窄屏单独占一个按钮 —— 它在「设置 → 用户」里，命令面板里也有一条。
- 所有可点元素 ≥ 40×40：`.iconbtn` 必须 `flex: none`，不许被挤小。
- 触屏上没有「只能 hover 才看得到」的东西（`.who` 的 `title`、工具卡的悬浮提示这类要改成点开）。

**本 commit 已修**：顶栏按上面的清单收紧 + `.iconbtn { flex: none }`（`scrollWidth` 从 433 降到视口宽）。

**仍未做（留在本条）**：抽屉手势与背滑、设置对话框在窄屏的分节、输入区控件带在窄屏的排布
（见 `web-composer-toolbar.md`）、`env(safe-area-inset-bottom)` 在真 iPhone 上的贴合、横屏。

## 影响

- 手机是 PWA 的主场景，整页缩放等于**全局降字号**，还更容易点错。
- 横向滚动会让 iOS Safari 在滑动时露白边，看起来像「页面坏了」。

## 证据

- 实测输出与截图：本会话 scratchpad 的 `mobile-audit2.mjs`、`/tmp/adelie-mobile-audit/*.png`（未进仓库）。
- `packages/web/src/styles/global.css`：`.topbar:172`、`.brand:197`、`.brand-workspace:215`、`.conn-label:283`、
  `.palette-open`（文件末尾）、`.who:1678`、`.who-admin:1697`、`.iconbtn:364`。
- 顶栏构成来源：`packages/web/src/components/TopBar.tsx`。
