# 回复图片的「拆图层」没能发出时，原因留在图片动作栏下面

- **Date:** 2026-11-16
- **Type:** fix
- **Scope:** `ui`, `web`

[English](2026-11-16-image-action-refusal.md)

灯箱里那张回复图片的「拆图层」是**一条投给 Agent 的消息**（App 自己没有图像接口，模型、凭证和文件都在
Agent 那一边），所以被拒时什么都没写：对话没变、图片还在、刚按下的那颗按钮也没动过 —— 它就是重试。而此前
按下的瞬间灯箱先关掉、动作再跑，原因就只剩一条**六秒后自己消失**的提醒挂在页顶：六秒后屏幕上是一个跟按
之前一样的对话，图片和那颗失败的按钮都不在了。这正是「拒绝的原因不能只活在 toast 里」这条规则最贵的一处。

现在灯箱**为一个会回答的动作留住覆盖层**：动作返回 Promise 时按钮进入忙态、覆盖层不关，它 resolve 出的
那句拒绝就画在胶囊动作栏的**正下方**（`role="alert"`、危险色、最多两行、整句挂悬停）；成功（resolve 空）
或拒绝（reject）则照旧收工关灯箱。拒绝句由调用方给：这里读的仍是普通发送那一对
`sendRefusalReason`，句子说清「这条消息没有发出」—— 不声称工作区改了什么，因为投递就没到。

## 细节

- `packages/ui` 的 `LightboxAction.onSelect` 现在可以返回 `Promise<string | null | undefined>`：一段非空
  字符串 = 这次按下的拒绝（画在动作栏下面，覆盖层留着）；空值 = 工作落地、关灯箱；普通 `void` 动作行为
  不变（跑完即关）。按钮在等答复期间 `disabled`，不会把同一条消息投两次。
- 判定顺序抽成纯模块 `src/components/overlays/lightbox/action-press.ts`（`pressLightboxAction`）：先
  `pending`（只对会回答的动作），再恰好一次 `done` / `refused`；promise 被拒时按「已完成」处理 ——
  说人话是调用方自己的事，它才知道这次按下意味着什么。
- 关灯箱（Esc、点遮罩、点关闭）会一起丢掉上一句拒绝：再打开是一次新的观看，不是上次失败的备忘录。
- `packages/web/src/lib/image-actions.ts` 的 `ask` 改成返回 `Promise<string | null>`；
  `chat-page.tsx` 的 `askWithPicture` 不再 `toastError`，把句子交给灯箱的那条路。
- 文案 `chat.imageAction.refused(reason)` 中英各一条：「没能把这张图拆成图层，这条消息没有发出：…」。

## 测试

- `packages/ui/test/action-press.test.ts`（新，7 条）：普通动作跑完报 `done`、动作先于汇报执行、会回答的
  动作先报 `pending` 再按答复分流（空值 / 一句拒绝 / 空串 / 被拒的 promise / promise-like）。
- `packages/ui/test/lightbox.test.ts`：原来那条「先关再跑」的源扫描按新契约改写为「把每次按下的处置交给
  `pressLightboxAction`，不许退回关掉再跑」。
- `packages/web/test/image-actions.test.ts` 加 1 条：动作把拒绝句原样交回给灯箱。
- `packages/web/e2e/image-action-refusal.spec.mjs`（新，1 条，真服务端 + 仓库自带 mock 模型）：把
  `POST …/tasks` 拒成 500 `internal`（带一句英文原文）→ 覆盖层仍在、句子在动作栏下方（量过它的 y 在按钮
  之下）、不含线上英文、通知区 0 个按钮、只发出一个请求、七秒后仍在；放开桩之后按同一颗按钮 → 覆盖层关掉、
  `使用技能：seedream` 与「拆成图层（--layers）」落进对话；再打开图片时上一句拒绝不再出现。

## 兼容性

只动前端的动作契约、状态与显示；接口、线上格式与已存数据都没变。`LightboxAction` 的新返回值是可选的，
现有调用方（不给 `actions` 或给普通动作的页面）行为与之前一致。
