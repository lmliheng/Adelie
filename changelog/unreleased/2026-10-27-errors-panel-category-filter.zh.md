# 成本中心的异常表能按类型过滤，清空也只清看到的那一类

- **Date:** 2026-10-27
- **Type:** feat
- **Scope:** `web`, `server`, `docs`
- **Breaking:** no

[English](2026-10-27-errors-panel-category-filter.md)

成本中心页面底部的**异常**面板，表格右上方多了一个类型筛选：**全部** / **未预期** / **预期内**。选一类，
表格、翻页和**清空**都只认这一类；上面的汇总数字仍按两类合计，因为它是整段范围的摘要。此前要单独看
未预期异常只能自己在十几行里找。

清空跟着这个筛选走：确认框会写明是哪一类、另一类保留（例如「将删除本项目 近 7 天内的 1 条「未预期」
错误记录，另一类与其余时间段的记录保留。」），按钮也确实只删这一类 —— 点了「清空」却把没显示在屏幕上的
另一类一起带走，正是确认框要防的事。

## 细节

- `packages/web/src/features/usage/errors-panel.tsx`：面板自己新增一个 `kindFilter` 状态，与页面的日期 /
  Agent 筛选合成 `activeFilters`，取数、行数、翻页与清空全部走它。仪表盘快照里没有按类型过滤的页 0，
  所以选了类型后连第 0 页也改为向服务端读；切类型时页码回到第 1 页（第 2 页的偏移量是按上一类的行数算的）。
  空表文案分两句：全部为空是「暂无异常」，某类为空是「该类型下暂无异常」。
- `packages/server/src/http/routes/usage.ts`：`DELETE /usage/errors` 接受 `kind`，与读接口用同一个
  `ERROR_KINDS` 闭集校验（非法值返回 400 —— 一个认不出的类型匹配不到任何行，静默「已清空」而记录还在）。
- `packages/server/src/services/usage-service.ts`：`UsageErrorsClearQuery` 加 `kind`，透传给
  `ErrorsRepo.deleteFiltered` 的同一个 `conds`，删除与读取共用一处 WHERE，不会两处走偏。
- `packages/web/src/api/endpoints.ts`、`packages/web/src/lib/strings.ts` / `strings-en.ts`：`kind` 参数与
  四句确认文案（按类 / 按类加 Agent）、两个新文案键。
- `packages/ui-gallery/src/app/mock/routes.ts`：演示数据里的清空接口也按 `kind` 过滤，与真路由一致。
  样例数据里有 2 条预期内、1 条未预期，刚好能看出收窄前后的差别。
- 文档：`packages/docs/content/usage.zh.md` / `usage.en.md` 的异常面板与清空步骤补上这个筛选。

## 兼容性

- 不改依赖、不改磁盘格式、不改包名。`kind` 是可选参数：不带它的请求与以前完全一样，旧客户端不受影响。
