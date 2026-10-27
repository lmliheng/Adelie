# 外观页的主题变成一排卡片，每张画着自己的颜色

- **Date:** 2026-10-27
- **Type:** feat
- **Scope:** `web`, `docs`
- **Breaking:** no

[English](2026-10-27-theme-picker-cards.md)

以前挑主题是一行按钮，每个主题占一个词：**通用**、**白领**、**极客**。这台机器一旦导入几个主题，这行
要么折成一坨、要么横向滚动，而且不管哪种，你挑的都是几个看不见的名字 —— 「白领」和「极客」差在哪儿，
只有切过去才知道。现在主题是一组卡片，每张卡片画着这个主题自己的底色、面板色、一行文字色和一枚强调色，
文字名字写在下面。内置的主题在**内置主题**那一组，文件带来的在**导入主题**那一组，两组各自只在有内容
时出现。

主题列表下面那一块也跟着改了：以前是一段说明 —— 主题目录的绝对路径、什么文件、怎么刷新、管理员还能
导入 —— 后面挂着「重新读取」和「导入…」。这段话第一次看有用，之后每次进来都要从它上面滚过去。现在那一块
只有两件能做的事（**重新读取**、管理员的**导入主题…**）和一行「主题目录」，路径与文件格式收进旁边的
「?」里。导入的主题如果只写了一部分取值，下面按主题一行说「N 个令牌沿用默认值」，点开才是具体名字 ——
以前那一长串 `--ui-` 名字是直接铺开的。

## 细节

- `packages/web/src/features/settings/theme-picker.tsx`（新增）：`ThemePicker` 与卡片本身。内置三个主题的
  四种颜色在 `BUILTIN_PREVIEW` 里写死（它们的规则按 `:root[data-theme="…"]` 一次只答一个主题，页面上同时
  画三个就得每张卡重刷一遍），导入主题的颜色来自它自己的文件；明暗跟着当前模式走。
- `packages/web/src/state/external-themes.ts`：`ImportedThemeView` 多一个 `preview`，是这台机器导入的
  主题在两种模式下的四个颜色（文件没写的取默认主题的值）。
- `packages/web/src/features/settings/appearance-section.tsx`：主题那一行换成占满整行宽度的 `ThemePicker`
  （网格要整行才折得开）；下面那块改成「主题目录 + ?」加两个动作按钮，问题清单改成可折叠的一行一条。
- `packages/web/src/features/settings/theme-import-dialog.tsx`：导入入口从小字链接改成次要按钮，和
  「重新读取」并排。
- 文案：`themeBuiltin` / `themeImportedGroup` / `importedThemeUnknownShort` / `importedThemeMissingShort` /
  `importedThemeDetails` / `importedThemesHelp`（旧的 `importedThemesDir` 不再使用）。
- 文档：`packages/docs/content/settings.{zh,en}.md` 的外观一节 —— 原来的「主题 = 浅色 / 深色 / 跟随系统」
  那一行写错了（那是**明暗**），这版分成两行，并补了一段导入主题的说明。

## 兼容

- 没有接口、磁盘格式或配置变化：主题文件还是同一个格式、同一个目录，`data-theme` 还是同一个属性。
