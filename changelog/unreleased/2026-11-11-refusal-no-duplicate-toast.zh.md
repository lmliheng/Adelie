# 被拒的开关、插入占位符与保存只说一遍，不再重复一条通知

- **日期:** 2026-11-11
- **类型:** 修复
- **范围:** `web`
- **破坏性变更:** 否

[English](2026-11-11-refusal-no-duplicate-toast.md)

Agent 设置页把被拒的写入讲在它被问的地方：每个分区的「启用」开关把服务端原话留在卡片下面，「插入占位符」条把
它留在条下面，确认式保存的卡片把它留在那张可以重试的卡片里。这三处都是「把拒绝从六秒通知搬到发问的控件旁边」
那一轮（7.19 的规则）里出现的，而每一处都把旧的 `toastError` 留在了新句子旁边。于是同一件事被说了两遍：一遍在
人正看着的地方，一遍在页面顶部那条随后自己消失的通知里。

这次去掉的是第二遍 —— 三份文件、七个调用点。**写成功**的通知一条没动（开关是静默移动的，所以那是成功唯一的
交代）；去掉的只是「已经有地方留着原因」的那些拒绝。这三处本身一字未改：句子、槽、清空规则、以及每一次重试。

## 细节

- `packages/web/src/features/agents/memory-tab.tsx`：记忆开关（`switchRefusal`）、记忆的占位符条
  （`insertRefusal`）、以及这一页自己的提示词保存（保存卡片）不再 `toastError`。**打开一条记忆**仍走通知：
  那次读取没有可以留住的宿主 —— 面板正是因为读不到才没打开 —— 所以通知仍是它唯一的交代。
- `packages/web/src/features/agents/prompt-injection-controls.tsx`：同样的三处，作用于技能 / 保险柜 / 定时任务 /
  钩子四个分区共享的开关、占位符条与提示词保存。
- `packages/web/src/features/agents/agent-settings-page.tsx`：页面共享的 `save`（每个设置表单都经
  `useSaveConfirm` 走到它）只把失败交回卡片，不再同时发通知。
- 原来放那条通知的每一处，注释改成了「为什么」：就地那句就是全部交代，六秒后自己收起的副本只是卡片上方的一层噪声。

## 测试

- `packages/web/e2e/agent-switch-refusal.spec.mjs`、`placeholder-insert-refusal.spec.mjs`、
  `agent-save-refusal.spec.mjs`：「通知区没有东西」这条断言从 `toHaveCount(0)` 改成立刻读一次
  （`expectNoToast`）。会重试的那种写法对着一条六秒后自己过期的通知同样会通过 —— 而那正是这三份用例在讲的事，
  也是它们过去每条都要跑十五秒的原因。
- `agent-save-refusal.spec.mjs` 新增一条共享提示词写入的用例（技能页的提示词区），这是保存 Promise 的第三种
  形状，之前没有浏览器用例钉过。

## 兼容性

线上接口没变、没有新依赖、Project 配置没变。成功的通知、拒绝自己的句子、删除 / 导入 / 导出那几处、以及记忆页
那次读取失败的通知都一字未改。
