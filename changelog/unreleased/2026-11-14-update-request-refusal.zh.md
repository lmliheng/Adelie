# 更新弹窗自己发出的两个请求被拒时，原因留在弹窗里、就在那颗按钮上方

- **日期：** 2026-11-14
- **类型：** 修复
- **范围：** `web`

[English](2026-11-14-update-request-refusal.md)

**软件更新**弹窗会自己发出两个请求：「下载并更新」开始自更新任务（或在桌面壳里请求下载），
「重启并更新」重启到那次任务装好的版本。两处被拒时都只有一条通知 ——「无法执行更新操作：…」——
浮在发出那颗按钮的弹窗**之上**，而弹窗本身仍旧原样显示「新版本可用」（或它在等的重启），跟按之前
一模一样。六秒后原因没了，读者只剩一颗自己刚按过的按钮，没有任何交代。更新流程自己的失败（任务跑了
但失败、检查答了一个错误）本来就在弹窗正文里有位置，只有这两个请求没有。

现在拒绝留在弹窗里，画在正文末尾、也就是重试它那颗按钮的正上方，并且一直留到下一次尝试。两句各自
点名是哪一步，因为后果不同：下载被拒意味着一个字节都没取到，重启被拒意味着新版本已经装好、只是还没
跑起来。原因走 `apiErrorText`（服务端的话已本地化，别的错误就是它自己的说法），原样带出。只有一种
情况仍然发通知：请求已经在路上、而弹窗被关掉了 —— 原因不因为它落脚的地方走了就消失。

## 细节

- `packages/web/src/lib/update-request-refusal.ts`（新增）：`updateRequestRefused(step, reason)`，
  两个取值 `download` / `restart`，句子放在词典里，每一步守住自己的措辞。
- `packages/web/src/lib/use-update-flow.ts`：状态里多一个 `requestRefusal`（存的就是那句话，
  `string | null`）；`downloadUpdate` / `installUpdate` 不再弹通知而是写它，走同一个 `refuseRequest`
  （只有弹窗关着的那一小段路仍发通知）；每次新尝试、打开与关闭弹窗都清掉它（7.19 给每个拒绝槽定的规则）。
- `packages/web/src/components/account/update-modal.tsx`：弹窗把这句话画成正文末尾的 `role="alert"`
  一行 —— 就在底部按钮上方 —— 限两行，整句停在悬停提示里。
- `packages/web/src/lib/strings.ts`、`strings-en.ts`：`requestFailed`（两步共用一句）拆成
  `downloadRefused` / `restartRefused`，各自说清是哪一半被拒、那意味着什么。

## 测试

- `packages/web/test/update-request-refusal.test.ts`：两步各说各的、原因原样传递、两句互不相同、
  中英两种语言。
- `packages/web/e2e/update-request-refusal.spec.mjs`：真服务端 + 真浏览器，两个请求各一条 —— 句子在
  弹窗里、通知区没有按钮、七秒后仍在、桩放行后同一颗按钮真的落地（下载那次任务答「不是通过 CLI 启动」，
  重启那次答「没有托管进程」—— 都是这台服务端自己的回答，不会 spawn、也不会重启）。拿上一版产物跑，
  两条都红在找不到那句话。

## 兼容性

没有接口变化、没有新依赖、没有配置变化。弹窗的措辞多出了原因并点名是哪一步；这些拒绝原先会弹的
通知没有了。
