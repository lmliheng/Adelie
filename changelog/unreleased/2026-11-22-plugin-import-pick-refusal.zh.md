# 插件导入弹窗拒掉一个 zip 时，原因留在选择文件那一行下面

- **Date:** 2026-11-22
- **Type:** fix
- **Scope:** `web`

[English](2026-11-22-plugin-import-pick-refusal.md)

插件市场的「上传插件」弹窗有两种拒绝发生在请求发出之前：zip 超过 14 MB 的解包上限（这样就不必先上传
一遍再去挣服务端的 413），以及浏览器根本读不出来这个文件。两种情况下选择文件那一行旁边都没有文件名、
「上传并导入」也一直按不下去 —— 而唯一的说明落在一条盖在弹窗上的通知里，六秒后自己走了。之后弹窗与选
文件之前一模一样，没有一个字说得出这个文件被拒了、为什么。

现在两种拒绝都写进弹窗自己的拒绝行，就在选择文件那一行下面 —— 与「导入被服务端拒绝」用的是同一处。浏览
器读不出来那个还换了句子，不再沿用通知里那句笼统的「请求失败，请稍后重试」。

## 细节

- `packages/web/src/features/plugins/plugin-import.ts`：新增 `pluginPickRefusal(cause)` —— 没能变成请求的
  那次选择的两句话（`too_large` 引用上限检查用的那个数字，`unreadable` 说读不出来），放在决定前者
  `pluginZipTooLarge` 旁边。
- `packages/web/src/features/plugins/plugin-import-dialog.tsx`：新增 `refusePick`，把选中的文件连同句子一起
  丢掉（于是选择行不写文件名、确认按钮也不会去发上一个包），并把句子写进弹窗的 `refusal` 槽；`onPickFile`
  在每次选择开始时清空那个槽，上限与 `FileReader` 的失败都改走它、不再 `toastError`。
- `packages/web/src/lib/strings.ts`、`strings-en.ts`：`plugins.importUnreadable`。

## 测试

- `packages/web/test/plugin-import.test.ts`（+2）：上限那句话里带着检查所用的数字；读失败有自己的句子，
  不是 `S.common.unknownError`。
- `packages/web/e2e/plugin-import-pick-refusal.spec.mjs`（新，2 条，真服务端 + 真浏览器）：14 MB + 1 字节
  的 zip → 句子在选择文件那一行下面、通知区没有它、七秒后仍在、没有文件名且确认按钮不可点，换一个装得下
  的文件之后句子消失、文件名出现、按钮回来；读失败（读文件那一层被打桩，因为健康的临时文件不会失败）→
  另一句话在同一处。改前产物上两条都红：上限那条是六秒通知，读失败那条是笼统的「请求失败」。

## 兼容性

没有动路由、存储格式或线上类型：两种拒绝都留在客户端，上传本身没变。
