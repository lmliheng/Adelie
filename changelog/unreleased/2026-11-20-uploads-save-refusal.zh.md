# 上传限制的保存被拒时，原因留在表单里，不再只是一条六秒通知

- **Date:** 2026-11-20
- **Type:** fix
- **Scope:** `web`

[English](2026-11-20-uploads-save-refusal.md)

设置 → 服务器 → 上传限制 的两个数字由**一次** PUT 一起写。它们自己的那条拒绝
（`invalid_attachment_limit`）本来就画在两个输入框下面；而这之外的每一种失败（会话掉了、服务端死了、500）
只落在一条六秒就走的通知里 —— 两个框还留着敲进去的数字、Save 还是那个重试按钮，可它们身上没有一个字说
这次保存没成。读者转过眼就分不出「没存上」和「存上了」。

现在这类拒绝画在表单里、正好在 Save 那一行上方，与旁边代理选项、语音输入两页同一写法（7.19 的规矩：句子
留在尝试发生的地方）；哪句话进哪个槽位仍然是一个有测试的纯函数。

## 细节

- `packages/web/src/features/settings/uploads-save-refusal.ts`（新）：`uploadsSaveRefusal(error)` 交回
  `{ slot, text }` —— `invalid_attachment_limit` 落 `fields`（两个数字下面，一起标红），其余一切落
  `section`（整张表单）。句子走 `refusalText`。
- `packages/web/src/features/settings/uploads-section.tsx`：`save()` 的 `catch` 改用它，原来那句
  `toastError` 去掉；新增一个 `refusal` 状态，画在 Save 那一行上方，每次尝试前清空、读到服务端那份后清空；
  表单槽位套上与相邻页同一个引导句（`S.common.refused`，先说清这句话是关于什么的）。

## 测试

- `packages/web/test/uploads-save-refusal.test.ts`（新，5 条）：成对的那条码落 `fields` 且是界面语言的句子、
  不是线上的英文；任何别的答话落 `section`；没到路由的失败保留自己的话；什么都没说的值退回通用文案；换英文
  词典时两个槽位都跟着换。
- `packages/web/e2e/uploads-save-refusal.spec.mjs`（新，2 条，真服务端 + 真浏览器）：① 保存被拒（PUT 用
  `page.route` 答 500 `internal`）：句子在表单里、只一条，通知区 0 条，七秒后仍在，服务端那两个数一分没变、
  两个框仍是敲进去的值，重试即落地；② 合计低于单个上限（真服务端答 `invalid_attachment_limit`）：句子画在
  两个数字下面，表单槽位没有它，通知区 0 条，服务端一分没变。
- **反证**：同一份 spec 挂改前产物（源码退回 `HEAD` 重建）→ ① 失败：通知区 1 条、表单里没有那句话。

## 附带（同一处槽位）

语音输入（设置 → 服务器 → 语音输入）那一节把「哪句话进哪个槽位」也收成同一个形状的纯函数
（`asr-save-refusal.ts` + 5 条单测 + 一份 3 条的 spec）。它原来在拒绝不是 `ApiError` 时还会再弹一条通知 ——
可 `apiFetch` 连网络失败都包成 `ApiError`，那条分支从来没有到过（改前产物实测：表单里有句子、通知区 0 条），
所以删掉它没有改变任何行为；那两页上唯一可见的差别是引导句（`操作被拒绝：…`），与相邻几页统一。

## 兼容性

只动前端渲染：接口、线上格式与已存数据都没变，服务端一句没改。
