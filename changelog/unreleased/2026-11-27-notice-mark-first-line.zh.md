# 会折行的提示条，标记留在第一行

- **Date:** 2026-11-27
- **Type:** fix
- **Scope:** `ui`

[English](2026-11-27-notice-mark-first-line.md)

共用的 `Notice` 过去把开头那个标记在整个盒子里居中，于是一折行的提示条——一行失败说明下面列着几条
原因、标题盖着较长正文的提示块——圆点（现代主题）或 `[WARN]` 标签（极客主题）会停在文字中间某一行旁边。

现在开头那块是 `items-start`，标记所在的槽只有一行高（`min-h-[1lh]`）并在里面居中：文字折到多少行，
标记都停在这一行；单行的提示条看起来仍像整个盒子居中。自己画色调标记的主题（现代的点、极客的标签）也
跟着这一块的第一行走，横幅的标记则落在条带内边距下的第一行。

## 细节

- `packages/ui/src/components/feedback/notice/notice.tsx`：开头块带 `data-slot="lead"` 与 `items-start`；
  `icon` 槽是 `min-h-[1lh] items-center`。
- `packages/ui/src/themes/modern.css` 与 `geek.css`：色调标记的 `::before` 挪到 `[data-slot="lead"]` 上
  （按第一行定位），有开头块时宿主自己的标记让位，横幅的标记落在条带内边距下。
- `packages/ui/src/hooks.ts` 与 `notice-strip.tsx`：钩子的槽清单与条带注释写上 `lead`。
- `packages/ui-gallery`：提示板加一条多行示例，中英各一份。
- 用例：`notice.test.ts` 钉住开头块与单行的图标槽；`hooks.test.ts` 与 `token-contract.test.ts` 跟着
  新的槽与选择器。

## 兼容性

`ui-notice` 钩子、它的色调与其他槽都没变；不画标记的调用点看到的样子与以前一致。数据、接口与已存格式
都没变。
