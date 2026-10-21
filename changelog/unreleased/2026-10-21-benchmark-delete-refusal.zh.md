# 删除 Benchmark 被拒时，确认框留着，原因也留在框里

- **Date:** 2026-10-21
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[English](2026-10-21-benchmark-delete-refusal.md)

评估中心里删除一个 Benchmark 要先确认，而那张卡片过去在 `finally` 里关掉：成功与失败一样关。于是被拒的
删除虽然什么都没删（卡片仍在页面上），原因却跟着框一起没了；那句话只出现在一条六秒后自己消失、且浮在框
上方的 toast 里。

现在只有删除真的落地，卡片才关。服务端拒绝时，卡片留着它的句子 —— Benchmark 的标题一字未改 —— 服务端的
原话画在句子下面，于是重试就是同一个按钮，而不是去找一张「明明还在」的卡片。

## 细节

- 规则来自模型库与定时任务那两轮（`ConfirmModal` 的 `refusal` 槽）：原因画在发起写入的那张卡片里，而
  打开这张卡片时先撤掉上一次的原因 —— 那句话说的事是上一次。
- `features/benchmark/benchmark-page.tsx`：`setDeleting(null)` 搬进成功那一条，`catch` 把服务端的原话
  交给 `deleteRefusal` 状态，不再弹 toast。
- 被拒时不再弹 toast：卡片是唯一说这句话的地方，也就没有一件会在用户还看着问题时自己消失的东西。
- 新增浏览器用例 `e2e/benchmark-delete-refusal.spec.mjs`（两条）：被拒的删除留着卡片、句子与那个
  Benchmark，且不弹 toast；重试真的写进去，而只有写成功的那一次才关框。

## 兼容性

- 没有接口、传输格式或依赖变化；只改了卡片什么时候关、拒绝提示画在哪。
