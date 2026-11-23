# 管理员能发通知了，收件人在账号菜单里看到

- **Date:** 2026-11-23
- **Type:** feat
- **Scope:** `server`, `web`

[English](2026-11-23-admin-notifications.md)

管理员现在可以写一条通知 —— 一个标题加一段正文 —— 发给全部账号，或者发给指定的某一个账号。收件人
在左下角账号菜单里一行「通知」上看到未读数徽标，也在那里标已读。这不是往某个聊天工具推一条消息：
通知是**存下来的**，所以发出之后才建的账号同样看得到。

## 两边，一对表

发件人看到的那张表与收件人的收件箱是同一对表（`notifications` 与 `notification_reads`），而「发给
谁」这条规则（全部账号，还是点名的那一个）只写在一处 —— `services/notification-service.ts`。收件人
那两条路由都以「改动之后的整个收件箱」作答（`markRead` 与 `markAllRead` 都返回列表，原因就在这），
客户端因此不必自己复制一份规则来更新列表。`GET /api/admin/notifications` 里的已读人数与收件人数都按
**当下的账号数**算 —— 全局通知的受众随着新账号创建而变多，已读人数跟着标记走，不是发出去那一刻定死
的数字。

## 在这份可靠副本之上，再顺手推一条

一条通知入库时，服务会经由其余跨 Session 事件走的同一个机制，把它发布成 `{type: "notification"}` 到
每个收件人的用户通道（`GET /api/events`）。那是锦上添花：没有开着通道的账号、或者之后才重连的账号，
从 `GET /api/notifications` 学到的是同一件事 —— 徽标数的也是那一份。浏览器的 store 会把「首屏读收件箱
还没回来时到达的通知」留住：那次读取的答复当作基线，比它新而答复里没有的都保留并计入未读，所以正好
落在那个窗口里的一条通知不会被回声抹掉。

## 细节

- `packages/server/src/db/schema.ts`、`db/migrations.ts`：两张表与迁移 16
  （`admin-notifications`、`swapSafe`）。仓库最多留 500 条通知，每插入 20 条清一次最旧的。
- `packages/server/src/db/repos/notifications.ts`、`mechanisms/notifications.ts`、
  `services/notification-service.ts`：存储、用户通道的 `peek` 与发布、以及「发给谁」这条规则与长度
  上限（`NOTIFICATION_TITLE_MAX` 120、`NOTIFICATION_BODY_MAX` 2000 —— 标题或正文为空或超长，都在入
  库前拒绝，绝不截断成不是发件人写的东西）。
- `packages/server/src/http/routes/notifications.ts`：给读者的 `GET/POST /api/notifications…`，给管理员
  的 `GET/POST/DELETE /api/admin/notifications…`；后者拒绝桌面模式（`desktop_single_user`）与非管理员
  （`admin_required`），与旁边的用户后端同一套规矩。
- `packages/web/src/state/notifications.tsx`（新）：store、`isNotificationEvent` 与
  `publishNotificationEvent`，以及带上文那条基线合并的 `useNotifications(userId)`。
- `packages/web/src/features/account/notifications-dialog.tsx`（新）与
  `components/layout/user-menu.tsx`：带未读数的「通知」这一行与收件箱弹窗，只在非桌面模式下画。
- `packages/web/src/features/admin/admin-notifications-section.tsx`（新）与
  `lib/settings-sections.ts`：管理员那边的发送表单（全体 / 指定账号，用户下拉来自 `adminListUsers`，
  长度上限用服务端给的那份）与已发送列表（带已读人数与撤回）。
- `packages/docs/content/server-api.{zh,en}.md`：新增「通知」一节，`ServerEvent` 联合类型里的
  `notification` 事件与它那一行说明，以及通道表里的那一项。

## 测试

- `packages/server/test/notifications.test.ts`（新，14 条）与 `packages/server/test/db-migrations.test.ts`
  （迁移 16 的旧库夹具）。
- `packages/web/test/notifications.test.ts`（新，13 条）：其中有「首屏读收件箱还没回来时到达的通知」
  （留住、只计一次）与「答复里也已经带上它」（不重复计数）。
- `packages/web/e2e/notifications.spec.mjs`（新，2 条，真服务端 + 真浏览器）：管理员发一条全局通知 →
  另一个账号的徽标**不刷新**就变成 1 → 打开弹窗看到它 → 标已读后徽标清掉；另一条钉住「读者上次读收件
  箱之后到达的通知，徽标是 1」。
- `@adelie/server` 与 `@adelie/web` 的 `tsc --noEmit`、`oxlint`、`prettier --check` 全过。

## 兼容性

新迁移只是加两张表；数据根、Trace 格式与既有接口形状都没变。桌面模式下这一行与设置页都隐藏，管理员
那三条路由返回 `desktop_single_user`，与管理面其余部分一致。
