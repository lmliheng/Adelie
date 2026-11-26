# 提示气泡在面板内折行过长的不可断文本

- **Date:** 2026-11-26
- **Type:** fix
- **Scope:** `ui`

[English](2026-11-26-tooltip-wrap-long-words.md)

移植自上游 PenguinHarness（#1893，提交 `20b9715a3`）。

共享的悬停提示按用途分三种面板：`label`（一个控件的名字）、`code`（被截断的一行命令）与 `text`（被截断的一段话）。面板的宽度是限死的，所以长文本该在这个宽度里折行 —— 但 `label` 这一类此前完全没有 `overflow-wrap`：一条没有空格的串（文件路径、一长串没有空格的标识符）没有可折的地方，于是整条文字跑出圆角面板、压在页面别处，读者连面板本身都看不清了。`text` 那一类用的是 `wrap-break-word`，它在计算内在宽度时不算断点，与「面板先长到上限、再折行」的写法对不齐。

现在三种面板一律用 `overflow-wrap: anywhere`：面板边缘就是断点，普通单词照旧整词换行。画廊的「悬停提示」画板多一条长路径示例，作为这一条的现场。

## 细节

- `packages/ui/src/components/overlays/tooltip/tooltip.tsx`：`contentClass` 的 `label` 由 `""` 改为 `wrap-anywhere`、`text` 由 `wrap-break-word` 改为 `wrap-anywhere`，并在类型注释里写下「没有断点的长串在面板边缘折断，普通单词保持整词」这条口径。
- `packages/ui-gallery/src/library/boards/tooltips.tsx`：「被截断的一行」那一组多一条 `data-tooltip` 的长路径（`label` 型面板，带 `data-tooltip-extra`），与已有的 `code` 型命令并排。
- `packages/ui/test/tooltip.test.ts`：一条新用例从源码的 `contentClass` 表里读出三种类型的类名，逐个要求带 `wrap-anywhere`，并断言 `wrap-break-word` 不再出现 —— 少任何一类就是回退。

## 兼容

只改排版，不动接口、不动数据、没有新依赖。面板的最大宽度、挂载位置与开合时机都没变；区别只在「文本是否跑出面板」。
