# 频道：加入被拒时，确认框留着，原因也留在框里

- **Date:** 2026-10-25
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[English](2026-10-25-channel-join-refusal.md)

加入频道的那张确认框有两个入口 —— 频道页「你还不是这个频道的成员」那条提示里的「加入」，和侧栏
「其他频道」那一行悬停时露出的「加入」—— 它们问的是同一张框。过去这两处都在写入之前就把框关掉，被拒
时服务端原话只落进一条几秒后自己消失、还浮在页面上的通知里：页面一点没变，读者只看到按钮又亮了，为什
么没加进去却得凭那条一闪而过的通知去想。

现在关框只发生在加入落地那条路径上；被拒时服务端原话画进框里、重试按钮正上方（`ConfirmModal` 的
`refusal` 槽，用的是应用既有的「操作被拒绝：」前缀）。重开这张框会先清掉上一次的原因 —— 那句话属于上次
那次尝试；一个写入在途时只认一次点击，取消不决定任何事。

## 细节

- `features/company/channel-dialogs.tsx`：两个入口共用的 `JoinChannelConfirm` 多一个可选 `refusal`，
  原样交给 `ConfirmModal` 的那个槽（没有原因时槽根本不画）。
- `features/company/channel-view.tsx`：`join()` 不再在 `await` 之前 `setConfirmJoin(false)`；成功那条
  路径才关框并清原因，失败把服务端原话留在 `joinRefusal` 里。提示条里那枚「加入」开框前先清掉旧原因；
  框的 `onClose` 在写入在途时不再响应（`busy` 置灰之外的第二道）；换频道时一并清掉。
- `features/company/channel-sidebar.tsx`：侧栏那行 `join()` 同样把 `setPendingJoin(null)` 挪到成功之后，
  失败留在 `joinRefusal` 里；行的「加入」开框前清旧原因，框的 `onClose` 在写入在途时不再响应。
- 新增浏览器用例 `e2e/channel-join-refusal.spec.mjs`（两条，两个入口各一条）：用 `page.route` 把
  `POST …/channels/<频道>/members` 拒成 500 之后，框、框里那句话与服务端上的成员表都不变（通知区里没有
  那句原话）；取消后重开不带旧原因；在同一张框上重试才真正加入 —— 框关掉、成员表里有这个人、提示条与
  侧栏那行的「加入」都消失。

## 兼容性

- 没有接口、传输格式、已存数据或依赖变化：只改了这张框「什么时候关」与「原因画在哪」。除既有的
  `S.common.refused` 前缀外没有新文案。
