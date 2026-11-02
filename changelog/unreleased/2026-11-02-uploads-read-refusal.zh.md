# 上传限额读不出来时，原因留在两个输入框上面，不再只活六秒

- **日期：** 2026-11-02
- **类型：** fix
- **范围：** `web`
- **破坏性：** 无

[English](2026-11-02-uploads-read-refusal.md)

设置 →「服务器」→「上传限制」的两个数字（单个附件上限、单条消息附件合计上限）都要等服务端存着的值到达
才能填。一次读失败留下的是两个灰着、空着的输入框，而页面对此只说过一句六秒的通知：六秒后框还是灰着，
屏上没有任何理由。

现在那句话画在两个输入框上面 —— 先读到它，因为下面这两个数此刻不代表服务端。用的正是被拒的写入已经在
用的那一行：danger 色、`role="alert"`、限两行、整句挂悬停，并且一直留到离开这一页再回来：重新挂载即重新
拉取，那就是重试。这一页没有自己的重试按钮。

## 细节

- `packages/web/src/features/settings/settings-read.ts`（由上一轮的 `server-switch-read.ts` 改名）：
  第三个页面开始问同一个问题，于是模块不再只管「一个开关」—— `readServerSettings(pick)` 读一次
  `GET /api/admin/settings` 并把 pick 出来的那部分交回（一个布尔，或者这一页要的那对数），失败仍收成
  `{ status: "unread", reason }` 而从不抛出；`settingsReadRefusal(read)` 把后者变成本地化的那句（走共享的
  `refusalText()`，外面套共享的「被拒」引子），读到了就什么都不画。
- `packages/web/src/features/settings/uploads-section.tsx`：`settings`（整份设置）收成 `stored`（这一页
  真正要的那对数），`adopt()` 因此只认这两个数；读那条路不再 `toastError`，改为多一个 `loadRefusal` 状态，
  画在两个输入框上面。写的那条路一个字没动。
- `agent-api-section.tsx` 与 `company-section.tsx` 只跟着改名（同一个函数、同一个语义）。

## 测试

- `packages/web/test/settings-read.test.ts`（原 `server-switch-read.test.ts` 改名，8 条）：除上一轮那 6 条
  之外，新增「这一页要的是一对数」与「要一对数时读失败同样变成那句话」两条 —— pick 交回什么、失败时说的是
  什么，各由一条用例钉住。
- `packages/web/e2e/uploads-read-refusal.spec.mjs`（新，真服务端一条）：读被拒时 —— 句子在设置区里一条、
  两个输入框都停用、完全没有 toast、七秒后仍在；离开这一页再回来（重新挂载即重试）后句子消失、两个框可用，
  显示的是服务端存着的 100 与 120。

## 兼容

- 接口、请求与存储都没变：还是同一个 `GET /api/admin/settings`。改变的只有失败时那句话画在哪里。
