# 「清空」第一步没读出记录数时，原因留在那个按钮旁边

- **Date:** 2026-11-26
- **Type:** fix
- **Scope:** `web`

[English](2026-11-26-errors-clear-count-refusal.md)

「清空」是两个请求：先读一遍当前筛选出来的集合（确认框必须报出这个数，而删除只吃表格显示的那些行，所以只有这次读能数得出），再执行删除。读那一步失败时，确认框根本没打开，面板和按之前一模一样 —— 行还在、按钮仍是唯一能再试的地方 —— 原因只在一条六秒后自己消失的通知里。

这次读被拒的时候卡片还不存在，所以载体不可能是卡片。那句话现在留在发起的那个按钮旁边、表格下面那一行：界面自己的措辞（「清空没有开始」）加上服务端的理由，最多两行、完整句子在悬停提示里，直到下一次尝试或筛选条件改变。后来某次读通了，确认框照旧打开。

## 细节

- `packages/web/src/features/usage/errors-panel.tsx`：`openClear` 的 `catch` 不再弹通知，改为写入新的 `countRefusal` 状态；`ClearCountRefusal` 把它画成按钮与翻页器之间的 `role="alert"` 一行（`data-testid="errors-clear-count-refusal"`）；每次尝试开始与筛选条件改变时清掉（那句话说的是上一次读的那个集合）。
- `packages/web/src/lib/strings{,-en}.ts`：`usage.errorsClearCountRefused(reason)`。
- `packages/web/test/errors-panel.test.ts`（4 条）与
  `packages/web/e2e/errors-clear-count-refusal.spec.mjs`（把真读那一步打成 500：句子活过 toast 的寿命、就在按钮旁边、没有确认框、通知区 0 条；放开拦截再按，确认框打开、句子收走）。

## 兼容

只改 Web App。卡片自己的拒绝（删除那一步失败）照旧留在卡片里，删除接口没有变化。
