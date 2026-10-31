# 连接开关被拒时，原因留在开关下面，不再只在一条六秒的提示里

- **日期：** 2026-10-31
- **类型：** fix
- **范围：** `web`
- **破坏性：** 无

[English](2026-10-31-messaging-toggle-refusal.md)

「远程控制」绑定的启用开关不做乐观写入：状态请求落地之后它才动，所以被拒的那一次会弹回服务端
仍记着的位置。于是原因只剩一条 toast —— 点完六秒之后，屏幕上是一个不再动的开关、一句已经消失的
解释；而这里的失败恰恰都是读者要据此动作的那几条（另一个对话已经占用这个机器人、凭证还没保存、
连接断了）。

现在原因留在开关下面，与连接自己的错误行同一个位置，并且是 `role="alert"`，出现时会被读屏念到。
下一次翻转与切换渠道都会把它清掉 —— 另一个渠道的开关是另一个控件，不该继承这句指责。编辑器的两
个宿主（侧栏弹窗与对话内的远程控制面板）共用这份正文，因此两处同时生效。

## 细节

- `packages/web/src/features/messaging/messaging-binding-editor.tsx`：`useMessagingBinding` 多一个
  `toggleRefusal`，由失败的状态请求经 `apiErrorText` 填上（所以是服务端的原话），不再走
  `toastError`；`selectChannel` 与下一次翻转把它清空。正文把它排在状态行下面那几行的最前，用
  danger 色、限两行、整句挂在悬停上 —— 与 `lastError` 同一种形状。句子复用共享的引子
  `S.common.refused`，与全站其它被拒的写入读起来一致；没有新增文案。

## 测试

- `packages/web/test/messaging-binding-editor.test.ts`：新增一条，渲染出拒绝后断言「共享引子 +
  原因」、「`role="alert"`」、这一行在状态行之外的位置，以及没有任何翻转被拒时页面上不出现 alert。
- `packages/web/e2e/messaging-toggle-refusal.spec.mjs`（新，真服务端两条）：被拒的启用把原因留在
  开关旁边、什么都不写（开关仍是关的、通知区里没有可点的 toast），并且 toast 该消失的六秒之后这
  一行还在；随后放开拒绝，下一次翻转真的落地，那一行随之消失。

## 兼容

- 接口、磁盘格式、请求体都没变。成功的翻转与从前完全一致，只有失败那条路不再用 toast。
