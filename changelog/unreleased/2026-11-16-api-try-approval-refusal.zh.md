# API 标签页的「试一试」里，审批决定没送到时原因留在那一行

- **Date:** 2026-11-16
- **Type:** fix
- **Scope:** `web`, `ui`, `docs`

[English](2026-11-16-api-try-approval-refusal.md)

Agent 的 **API** 标签页末尾有一个**试一试**：它经你的登录身份发一次真实的 API 运行，把程序会收到的事件流
按行显示出来。审批模式需要询问时，`approval.requested` 那一行会出现**允许**和**拒绝**，按下去是向会话的
审批路由发一个 POST —— 而它外面那句 `catch` 只是把失败弹成一条**六秒后自己消失**的通知：服务器出错或连接
断开时，那一行与按之前一模一样，读者看不出刚才按的是哪一颗、为什么没成，也不知道这个调用还在等他回答。

现在被拒的决定把原因写在**那一行**里、两颗按钮正上方：「没能把「允许」交给服务器，这次调用仍在等你回答：
〈原因〉」。两颗按钮都留着 —— 什么都没写进去，再点就是重试。**404** 仍不说话：调用已经不在等待（它结束了，
或另一个窗口已经答过），于是这一行就地收起，不让一句关于已完成决定的话比它的对象活得更久。

## 细节

- `packages/ui` 的 `ApprovalButtons` 多一个可选的 `refusal`，句子就画在它自己的两颗按钮上方；
  `ApprovalBlock` 的那个槽改成由它来画 —— 于是会话里被拒的决定与这里被拒的决定是**同一份画法**（同一个
  `role="alert"`、同一个 `data-testid="approval-refusal"`、同样的危险色与两行封顶）。
- `api-try-log.ts`：`approval` 这一格多一个可选的 `refusal`，新动作 `refused` 只把它写上、`pending` 照旧；
  `decided`（本地答复成功、别处答了、运行结束）连句子一起清掉。判定收成导出的
  `approvalAnswerFailed(toolCallId, decision, err)`：404 → `decided`（静默收起），其余 → `refused`，句子
  与对话里那份共用 `approval-refusal.ts` 的 `approvalAnswerRefused`。
- `api-try-panel.tsx` 的 `onApprove` 不再弹通知，改成把那份动作交给 reducer。
- 文档：`agent-api.zh.md` / `agent-api.en.md` 的「试一试」一段补上这句。

## 测试

- `packages/web/test/api-try-log.test.ts` 加 2 条：被拒的答复让这一行继续发问、句子逐字踩在「允许」按钮上方
  且不吐线上英文、两颗按钮仍在，随后一份 `decided` 把按钮与句子一起清掉；以及 404 只让这一行静默收起、
  一句都不说。
- `packages/ui/test/tool-call-card.test.ts` 那条「拒绝句画在审批块里、两颗按钮之上」原样通过 —— 句子挪了
  位置（进 `ApprovalButtons`），画出来的东西没变。

## 兼容性

只动前端状态、一处共用组件与文案、文档：接口、线上格式与已存数据都没变。
