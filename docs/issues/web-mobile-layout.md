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

## 第二轮：抽屉与输入区（2026-10-04）

顶栏那一轮只量了 390 与 360。这一轮补上 320 与横屏，并把「顶栏以外」的三条做掉。
四档视口实测（Chromium，`isMobile`/`hasTouch`，对着 4000 端口的真实构建）：

| 视口 | 改前 | 改后 |
| --- | --- | --- |
| 390×844 | `scrollWidth` 390 ✓ | 不变（会话列表 469 → 567px） |
| 360×640 | `scrollWidth` 360 ✓，抽屉里会话列表 265px | 会话列表 **363px** |
| 320×568 | **布局视口被撑到 334**（整页缩到 0.96，字更小） | `scrollWidth` **320** ✓ |
| 640×360 横屏 | 会话列表 **16px**，底部信息被切出屏幕（391 > 360） | 会话列表 **83px**，底部回到 360 |

改的是四件事：

1. **抽屉里的 rail 排成两列**（`≤1023px`）：6×40 竖排要 264px，吃掉抽屉四成高度，
   横屏时把会话列表挤到 16px。两列之后 145px，六个入口仍然一眼全在 —— 不藏进横向滚动
   （那是手机上的主导航，藏一半比多占几十像素糟）。
2. **触控尺寸**：`.nav-item` 36 → 40px，`.brand` 加 `min-height: 40px`；触屏下
   （`hover: none`）文本域 `min-height: 40px`（一行时实测只有 34px）。
3. **抽屉自己留安全区**：抽屉盖住顶栏，于是也盖掉了顶栏那份 `env(safe-area-inset-top)` ——
   刘海屏上第一条导航会躲在状态栏/灵动岛下面，底部信息被 home 指示条压住。补 top + bottom。
4. **输入区的控制带**：`.composer-foot` 里的控件单独包一层 `.composer-tools`，窄屏只让这一层
   横滚，发送按钮钉在右侧 —— 整条一起滚的话，控件多一点发送就被推出屏幕了。
   往里面塞 6 个模拟控件实测：320/360/390 下整页不溢出，每个控件仍是 44px 高、可以滚到。

`scripts/e2e.mjs` 的手机段从「一档 390」扩成四档（390 / 360 / 320 / 640×360 横屏），
每档断言：`scrollWidth === innerWidth`（抽屉开与关）、rail 与输入区控制带里的可点元素都 ≥40px、
抽屉里的会话列表至少剩一条会话行（52px）、底部信息不被切出屏幕。
反向验过：把旧的竖排 rail 打回去，横屏那档立刻量回 16px / 391px，断言会红。

## 仍未做（留在本条）

- 抽屉手势与背滑（现在靠点遮罩或点一项关闭）。
- 设置对话框在窄屏的分节排布。
- 顶栏的 `.who` / `.conn` 目前只有 `title`（触屏上永远看不到）：要改成点开。它属于顶栏，
  且得先定「点开之后落在哪一节」，不与本条混着改。
- `env(safe-area-inset-*)` 在**真 iPhone** 上的贴合：桌面版 Chromium 的 `env()` 恒为 0，
  本机只能验「规则在」，验不了效果。
- 横屏（640×360）下会话列表只有 83px（约一条半会话行）：够用但局促。真要在横屏里用，
  得再决定是收窄 rail 还是把抽屉底部那两行信息藏掉。

## 影响

- 手机是 PWA 的主场景，整页缩放等于**全局降字号**，还更容易点错。
- 横向滚动会让 iOS Safari 在滑动时露白边，看起来像「页面坏了」。

## 证据

- 第二轮（2026-10-04）的实测输出与截图：本会话 scratchpad 的 `mobile-probe2.mjs`（四档视口
  的溢出 / 抽屉预算）、`composer-strip-check.mjs`（控制带塞 6 个控件）、`negative-check.mjs`
  （旧排布复现 16px / 391px 会红），截图 `/tmp/adelie-mobile-probe2/*.png`（未进仓库）。
- 断言在 `scripts/e2e.mjs` 的手机段（`MOBILE` 四档）；跑法见 `docs/audit.md` 的 `--with-e2e`。
- `packages/web/src/styles/global.css`：`.topbar:172`、`.brand:194`、`.brand-workspace:217`、
  `.conn-label:285`、`.iconbtn:366`、`.sidebar:405`（抽屉安全区）、`.nav-item:471`（40px）、
  抽屉两列 rail 的 `@media (max-width: 1023px)` 块、`.composer-tools:1323`、`.who:1812`、
  `.who-admin:1831`、`.palette-open:2129`、窄屏顶栏 `@media (max-width: 360px)`（文件末尾）。
- 顶栏构成来源：`packages/web/src/components/TopBar.tsx`；控制带来源：`Composer.tsx`。
- 第一轮（顶栏）的实测：本会话 scratchpad 的 `mobile-audit2.mjs`、`/tmp/adelie-mobile-audit/*.png`。
