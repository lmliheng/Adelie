# 成本中心的异常表能把一整条异常复制走

- **Date:** 2026-10-27
- **Type:** feat
- **Scope:** `web`, `docs`
- **Breaking:** no

[English](2026-10-27-errors-panel-copy.md)

成本中心页面底部的**异常**面板，每一行右端多了一个复制按钮：把这条异常整条复制到剪贴板，成为一段可直接
粘贴的文字 —— 最近一次的时间、**来源 · 错误码**、类型，合行时还有条数与首次时间；随后是完整消息（换行
照原样）。

这个复制是为着把异常**送出**面板：粘到聊天里、贴进 issue、或者交给另一个 Agent 排查。所以它得能独立
成立：对面看不到这里的筛选、拿不到悬停提示、点不开那个 `×4`，而一段 provider 报错里真正说明问题的那
部分（402 的响应体、栈的头几帧）往往在第二行往后 —— 恰恰是表格里被截掉的部分。此前唯一的办法是在一行
被截断的单元格里拖选。

## 细节

- `packages/web/src/features/usage/errors-panel.tsx`：`errorCopyText(item)` 生成这段文字，并且导出 ——
  与 `errorsClearScopeText` 同样的理由：这个包的 vitest 跑在 `node` 里，点击和剪贴板看不到，文字看得到。
  行里用 ui 包既有的 `CopyButton`（`size="sm"`）。它画在每一行、不做悬停才显形：手机没有悬停（Tailwind v4
  把 `hover:` 收在 `@media (hover: hover)` 里），悬停才出现的操作在那里等于不存在 —— 消息格本身是个
  按钮，也是同一个理由。它上方那格表头留空：图标自己用 `aria-label` 报了名，每行再读一遍列名是重复。
- 表格的 `min-w` 由 720 改成 752，即复制列自己的宽度：在最窄的视口里这一列不从消息列身上抢宽度（那个
  盒子本来就会横向滚动）。
- `packages/web/src/lib/strings.ts` / `strings-en.ts`：一个新文案键 `errorsCopy`。
- 文档：`packages/docs/content/usage.zh.md` / `usage.en.md` 的异常面板一节。

## 兼容性

- 不改依赖、不改磁盘格式、不改接口：这段文字完全由客户端从面板已有的一行里拼出来，服务端一行没动。
