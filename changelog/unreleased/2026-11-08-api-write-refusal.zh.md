# Agent 的 API 页里写不进去时，原因留在按下去的那个开关或下拉下面

- **日期:** 2026-11-08
- **类型:** 修复
- **范围:** `web`
- **破坏性变更:** 无

[English](2026-11-08-api-write-refusal.md)

API 页有三处写是不问就写的：打开 API、API 会话的审批模式、关掉无密钥访问。这三个控件都不做
乐观更新 —— 开关与下拉显示的是服务端答复的位置 —— 所以一次被拒的写之后，页面与按下之前一模一样。
唯一解释它的那句话在六秒后自己消失的通知里；此后那个控件看上去就像按了一下又弹回来了。

这正是 7.19 禁止的形状，而在这张页面上它的代价最大：没关掉的无密钥访问意味着任何能访问这个地址
的程序都能无密钥调用这个 Agent，而读者记忆里那个开关还停在「已关」。

这三处现在各自把原因留在自己的控件下面：`role="alert"`、危险色、整句换行，一直留到这个控件再次
被使用为止 —— 开关和下拉自己就是重试。三句话故意说得不一样：API 仍然没有打开；审批方式没有改，
并念出被要求的那一档（因为下拉已经退回存着的那一档）；以及无密钥访问仍然开着。

## 细节

- 新增 `packages/web/src/features/agents/api-write-refusal.ts`：`apiEnabledRefused(err)`、
  `apiApprovalModeRefused(mode, err)` 与 `apiKeylessOffRefused(err)`。原因走 `refusalText`
  （7.19 的规则：服务端答复的按错误码念界面自己的本地化句子，不念线上英文原文）；审批模式那一句
  自己解析模式的显示名，所以中英文读起来都是界面的话。
- `packages/web/src/features/agents/api-tab.tsx`：`write()` 把被拒的写交还给按下它的那个控件，
  不再交给人一眼看不见的通知；三个槽位在该控件再次按下时先清掉；`ApiTabView` 在开关下、审批下拉下
  与无密钥开关下各画一条 `role="alert"` 行，这个文件不再引用 `toastError`。
- `packages/web/src/lib/strings{,-en}.ts`：三条新文案 `agent.apiEnableRefused(reason)`、
  `agent.apiApprovalModeRefused(mode, reason)` 与 `agent.apiKeylessOffRefused(reason)`。

## 测试

- `packages/web/test/api-write-refusal.test.ts`（新增，9 条）：三句话都保留服务端的原因但按错误码
  念（绝不念线上原文）、保留界面自己抛出的句子、什么都没说时落到通用文案、明说「API 仍然没打开」与
  「无密钥访问仍然开着」、并念出被要求的那一档审批方式 —— 中英双语各一条。
- `packages/web/test/agent-api-tab.test.ts`（+1 条渲染断言）：三条 `role="alert"` 各在各的位置，
  没有被拒时一条都不画。
- `packages/web/e2e/agent-api-write-refusal.spec.mjs`（新增，真服务端 + 真浏览器）：三处写都在
  `page.route` 上被拒，并且再从 API 读回服务端的状态。句子只出现一次、念的是界面的话、通知区为空、
  控件停在原位、服务端什么都没写 —— 而且**七秒之后**那句话还留着。放行后按同一个控件，句子消失、
  改动落地。

## 兼容性

不改接口、不引入新依赖、不改 Project 配置。三处先问再写的确认框（关掉 API、允许无密钥访问、
删除密钥）仍然把拒绝画在卡片里，它们那一份 spec 原样通过。
