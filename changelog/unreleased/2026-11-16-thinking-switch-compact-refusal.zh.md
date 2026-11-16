# 「压缩后切换」没能开始压缩时，确认框留着、原因留在框里

- **Date:** 2026-11-16
- **Type:** fix
- **Scope:** `web`, `docs`

[English](2026-11-16-thinking-switch-compact-refusal.md)

对话中途改思考等级会先问一句（issue #310）：**压缩后切换**（推荐、便宜的那条）、**仍要切换**、**取消**。
第一项是在请服务端开始压缩，而服务端可以拒绝 —— 这个 Agent 没配上下文压缩、还没有完成过一轮对话、刚刚
压缩过、或者 Task 正在跑。被拒时其实什么都没做：没压缩、等级也没钉住；可确认框照样**关掉**，那个选择在
下一轮就被放行，等级于是照常切了过去，而原因只活在一条**六秒后自己消失**的提醒里 —— 选了便宜那条路的
人，安静地拿到了贵的那条。

现在确认框留在原地、还是同一个选择，句子写在它自己的问题下面：「没能先压缩上下文，思考等级仍是〈x〉：
〈原因〉」。于是**仍要切换**成了一个知道代价的选择，**取消**也真的什么都没改。已经开始的压缩后来失败或
被中断时照旧：等级仍然应用，并用提示说明（那一条讲的是先后顺序，不是否决）。

## 细节

- `packages/web/src/features/chat/thinking-level.ts`：`StagedThinkingSwitch` 的打开态多一个可选的
  `refusal`，`"settle"` 阶段与 `heldThinkingSwitch` 的 `notice: "none"` 一起删掉 —— 卡片还在发问时，
  不许有任何东西在它背后放行这个选择。
- `chat-page.tsx` 的 `compactThenThinkingSwitch` 传一个 `onRefused`：把卡片退回同一个等级的 `ask` 并
  写上句子（只改自己暂存的那一份状态，别处来的选择照旧优先）；「正在压缩」的提示改为只有在服务端真的
  接受请求之后才发。
- `thinking-level-refusal.ts` 新增 `compactBeforeSwitchRefused(level, err)`：原因与 `/compact` 命令
  共用同一个 `sendRefusalReason`，于是同样的拒绝在两种界面上说同样的话；点名的等级就是触发器和对话里
  仍然显示的那一个。
- 文案 `chat.thinkingSwitchCompactRefused(still, reason)` 中英各一条。
- 文档：`chat.zh.md` / `chat.en.md` 讲思考等级那一段不再声称「等级照样切换」，改成把「开始了却没完成」
  与「根本没开始」分开说。

## 测试

- `packages/web/test/thinking-level-refusal.test.ts` 加 3 条：句子说出仍然生效的等级与该错误码自己的
  原因、请求没到路由时保留原话、跟随当前语言。
- `packages/web/test/thinking-level.test.ts`：原来那条 `"settle"` 用例换成「卡片还带着拒绝句时这个选择
  仍被扣着」—— 正是此前会被悄悄放行的那个分支。
- `packages/web/e2e/thinking-switch-compact-refusal.spec.mjs`（新，2 条，真服务端 + 仓库自带 mock
  模型）：把压缩拒成 500 `internal` → 卡片仍在、句子在框里（从不吐线上英文）、没有通知、触发器仍读旧
  等级、一个 `PATCH` 都没发出、七秒后仍在，之后按**仍要切换**才把 `high` 钉上；以及被拒后按**取消**
  什么都没变、下一次选等级是一张干净的卡片、上一次的句子不再出现。

## 兼容性

只动前端状态、文案与文档，接口、线上格式与已存数据都没变。这一条取代 `2026-11-16-compact-refusal` 里
「对话框有意保持原样」那句说明。
