# 版权信息页写明主题的许可与来源

- **Date:** 2026-11-01
- **Type:** feature
- **Scope:** `web`
- **Breaking:** no

[English](2026-11-01-theme-credits.md)

设置 › 版权信息此前只逐个字体列出许可，主题那一半没有交代。现在字体列表下面多了一段「主题」：应用自
带的三套（通用、白领、极客）随 Adelie 一起提供；外观页「主题库」里的四套（赛博朋克、手绘涂鸦、陶光、
拟物化）由 lmliheng 维护，按需取用。七套都是 Apache-2.0，与 Adelie 同一个许可，末尾给出主题库仓库的
地址。一段主题只含颜色与尺寸这类取值，不含代码。

## 细节

- `packages/web/src/features/settings/credits-section.tsx`：字体列表外包一层间距，其后新增
  `ThemeCredit`——一个标题、一段说明与一个指向 `github.com/lmliheng/adelie-themes` 的外链。
- 文案：`creditsThemeLibrary`（中「主题」/ 英 "Themes"）与 `creditsThemeLibraryInfo`。写成静态文字而
  非按需拉取：这一页要在离线时也能读，也不能因为主题库不可达就说不出应用自己带了什么。库里的实际清单
  在外观页的选取器旁边。
- `packages/web/test/credits-section.test.ts`（新，2 条）：渲染后字体族名与许可标题仍在；主题块含
  `Apache-2.0`、`lmliheng`、仓库地址与七个主题名。

## 兼容

- 只加了展示：带 `themes/*.json` 的格式与主题的取用方式都没变，`THIRD-PARTY-NOTICES.md` 也没有变。
