# 两个服务器开关读不出来时，原因留在开关下面，不再只活六秒

- **日期：** 2026-11-02
- **类型：** fix
- **范围：** `web`
- **破坏性：** 无

[English](2026-11-02-server-switch-read-refusal.md)

设置 →「服务器」里的两页各是一个服务端级的开关 ——「Agent API」与「公司模式」。两个开关都要等到服务端
的值到达才能用，所以一次读失败留下的是一个谁都读不到的、灰着的开关；页面对此只说过一句六秒的通知，
六秒后开关还是灰着，而屏上没有任何理由。

现在那句话画在开关下面，用的正是被拒的写入已经在用的那一行：danger 色、`role="alert"`、限两行、整句挂
悬停，并且一直留到离开这一页再回来 —— 重新挂载即重新拉取，那就是重试。两个开关都没有自己的按钮。

## 细节

- `packages/web/src/features/settings/server-switch-read.ts`（新）：`readServerSwitch(pick)` 读一次
  `GET /api/admin/settings`，答 `{ status: "read", value }` 或 `{ status: "unread", reason }` —— 失败从不
  抛出，因为这两页自己没有什么可重试的；`serverSwitchRefusal(read)` 把后者变成本地化的那句（走共享的
  `refusalText()`，外面套共享的「被拒」引子），读到了就什么都不画。一次失败的读取变成哪句话，是一句话
  加一条用例，两页共用。
- `packages/web/src/features/settings/agent-api-section.tsx` 与 `company-section.tsx`：写入失败那个状态
  之外多一个 `loadRefusal`，画在开关下面；读那条路不再 `toastError`。写的那条路一个字没动。

## 测试

- `packages/web/test/server-switch-read.test.ts`（新，6 条）：取哪个开关由 pick 决定；被拒的读回答应用的
  那句话（不是英文原文），外面套着引子；句子跟着当前语言；根本没连上服务端时说的是客户端那句网络错误；
  传进来的句子原样保留；读到了就什么都不画。
- `packages/web/e2e/server-switch-read-refusal.spec.mjs`（新，真服务端两条）：读被拒时 —— 句子在设置区里
  一条、开关停用、完全没有 toast、七秒后仍在；离开这一页再回来（重新挂载即重试）后句子消失、开关打开、
  显示的是服务端真正存着的值。

## 兼容

- 接口、请求与存储都没变：还是同一个 `GET /api/admin/settings`。改变的只有失败时那句话画在哪里。
