# 模型没额度了，也能在这次对话里换到别的模型

- **日期：** 2026-10-29
- **类型：** feature
- **范围：** `core`、`server`、`web`
- **破坏性：** 无

[English](2026-10-29-model-switch-drops-dead-context.md)

在会话里换模型，第一步是让**当前**这个模型把上下文压成一段摘要 —— 而这次摘要请求也要发到那个模型上。
所以模型一旦整个不可用（额度用尽、凭据失效、接口不通），这个会话就卡死在它上面：换模型的第一步自己就
发不出去。

现在切换确认框里多了一个默认不勾的选项：**压缩失败就直接切换（放弃摘要）**。勾上以后，压缩真的压不动
时，上下文被整段丢弃（不再发任何请求），对话照常切到目标模型；事件流里失败的压缩之后紧跟一对 `discard`
事件，所以发生过什么，对话里看得见。代价就写在选项下面：摘要没了 —— 对话正文仍在，但新模型接不到这段
工作记忆。

调用方也可以直接走接口：`POST /api/sessions/:id/switch-model` 带 `onCompactionFailure: "discard"`。不传
就是老行为（切换失败，留在原模型）。被用户中断（`aborted`）不算压缩失败，任何时候都不会因此丢上下文。

## 细节

- `packages/core/src/engine/context-engine.ts`：新增 `SwitchFailurePolicy = "stay" | "discard"`；
  `switchContext(signal?, opts?)` 在 summarize 未能完成且调用方要求 `"discard"` 时，跟上一对
  `discard` 事件（`discardContext("manual")`，不发请求）并照常完成切换 —— 只在 `fatal` / `retryable`
  两种失败上降级，`aborted` 与「压根没能开始压缩」都保持原样。带到新上下文的仍只取文本，与既有的切换
  规则一致。
- `packages/core/src/session.ts`：`ModelSwitchOptions.onCompactionFailure` 透传给引擎；`core` 的
  导出表加上这个类型。
- `packages/server/src/runtime/session-manager.ts`：`startSwitch` 接第三个参数并透传；路由：
  `POST /:sessionId/switch-model` 用 `optionalEnum` 校验，只认这两个值，其余 400；
  `SessionSwitchModelRequest`（`packages/server/src/api/types.ts`）加上这个可选字段。
- `packages/web/src/features/chat/chat-page.tsx`：确认框只在「会跑压缩」的那种形状上给出这个复选框
  （另外两种形状不压缩，勾了也没意义），默认不勾，勾上才把 `onCompactionFailure` 放进请求体。
- 文案：`strings.ts` / `strings-en.ts` 各加两条（`modelSwitchInSessionDiscardFails` 与其说明）。
- 测试：`packages/core/test/model-switch.test.ts` 两条（失败降级后轮换到目标、目标的新文件里没有摘要；
  被中断时不降级），`packages/core/test/prompt-cache-invariants.test.ts` 一条（重试预算耗尽那种失败
  同样降级，死掉的模型此后再也收不到请求），`packages/server/test/session-switch-model.test.ts` 两条
  （字段按原样透传到 core；非法取值 400）。
- 文档：`packages/docs/content/sessions-and-traces.{zh,en}.md` 的「会话内切换模型」一节。

## 兼容

- 不传新字段就是老行为：压缩失败仍留在原模型。磁盘格式与 Trace 记录格式没变（新出现的只是既有
  `discard` 事件对），AMSP 协议未动。
