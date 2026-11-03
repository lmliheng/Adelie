# 保存确认框被拒时留在原地说明原因，不再关掉之后只剩一条六秒的通知

- **日期：** 2026-11-03
- **类型：** fix
- **范围：** `web`
- **破坏性：** 无

[English](2026-11-03-agent-save-refusal.md)

Agent 设置里每一次「保存」都先弹同一张卡片问一句，卡片点下确认就开始写。过去它在同一次点击里
就把自己关掉：写被拒之后表单里那条没保存的修改还在原处，卡片没了，原因只剩提示区里一条六秒的通知，
而它盖在卡片原来待的地方上方。六秒一到，页面上没有任何东西还记得那次保存失败过 —— 想重试得自己
再找到那颗「保存」。这一个卡片背后是四份表单（概览的名字与描述、系统提示词、运行时、工具）与两个
提示词写入（记忆页自己的、技能 / 保险柜 / 定时任务小节的），形状都一样。

现在卡片等到服务器答复才关：写入在途时两颗按钮都锁着（第二次点击不会对同一句话发出竞价的写入），
被拒时把服务端的原话画在自己那句话下面 —— `ConfirmModal` 的 `refusal` 槽，与「还原为默认配置」和
模型库里那些确认框同一条规则 —— 那句话留到这次写入落地为止，卡片上那颗确认按钮就是重试。只有真的
写进去才关。失败通知保留：本笔补上的是活得下去的那条说法，没有撤掉任何一条。

## 细节

- `packages/web/src/features/agents/save-confirm-outcome.ts`（新）：`awaitSave(run)` —— 同步或异步
  的写入都等（`void` 掉的 promise 等不到，所以调用点必须把它交回来），落地给 `{ ok: true }`，被拒给
  `{ ok: false, reason }`，原因按每处拒绝槽同一条规则读（`refusalText`：服务端答复 → 代码自己抛出、
  本来就是给人看的那句 → 通用失败）。判定词复用模型库那份 `WriteOutcome`（`features/models/
  write-outcome.ts`，插件页也已经在用它）。
- `packages/web/src/features/agents/save-confirm.tsx`：多一个 `busy`（写入在途）与一个 `refusal`
  （服务端原话），打开卡片时清空 —— 那句话属于上一次被拒的写入。
- `packages/web/src/features/agents/agent-settings-page.tsx`：四处调用改成把 promise 交回
  （原来是 `requestSave(() => void onSave(...))`，`void` 让卡片拿到 `undefined`、以为没有写入要等），
  页面级 `save` 的 catch 里在发通知之后把错误再抛出去。
- `packages/web/src/features/agents/memory-tab.tsx` 与 `prompt-injection-controls.tsx`：同一件事，
  这两处是各自 `.then/.catch` 的写入链 —— 交回链本身，并在 catch 里发完通知后 rethrow。

## 测试

- `packages/web/test/save-confirm-outcome.test.ts`（新，6 条）：同步与异步的落地都算 `ok`、被拒带
  本地化后的原因（中文界面不显示服务端英文原话）、未映射的码原样带过、代码自己抛的那句原样显示、
  没有话说的值落到通用失败、写入只跑一次。
- `packages/web/e2e/agent-save-refusal.spec.mjs`（新，真服务端两条）：系统提示词页与记忆页各一条，
  各走一条不同的调用路径（页面的共享 `save` / 记忆页自己的写入链）。写入在 `page.route` 上被拒成
  500：卡片仍在、原因在卡里（`操作被拒绝：agent state is read-only`）、通知区没有可点的条目、服务端
  仍是旧值；七秒后那句话仍在；放开拒绝再按同一颗确认按钮，卡片关闭、服务端拿到新值。**反证**：同一
  份 spec 跑改前产物两条都红（卡片在点下确认后就不见了）。
- 相邻回归（真浏览器四份 spec）：`agent-config-refusal` 2 + `agent-switch-refusal` 2 +
  `memory-write-refusal` 3 + `placeholder-insert-refusal` 2 —— 9 条全过。

## 兼容

- 接口、请求与存储都没变：还是那记 `PUT …/agents/<agent>/config`。改变的只有被拒之后画在哪 ——
  卡片自己留着并说明原因，而不是关掉之后只剩通知。
