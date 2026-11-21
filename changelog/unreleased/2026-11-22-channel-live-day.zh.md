# 频道里实时到达的消息，按它所在的日文件归日，不再一律算今天

- **Date:** 2026-11-22
- **Type:** fix
- **Scope:** `web`, `server`

[English](2026-11-22-channel-live-day.md)

打开着的频道收到 `org_channel` 事件就把它追加进流里，不重新拉取。事件过去只说这是哪个频道的哪条
消息，不说它来自哪个日文件，于是视图把每一条到达都算成「今天」（`meta.today`，服务端自己的日期）。
这对此刻正在发的消息是对的，对扫描器广播出来的其它行都不对：CLI 或手改往昨天的文件里追加的一行、
或者午夜前一秒写出、午夜后才被扫描广播的一行，会被画进已经打开的频道的「今天」那一段 —— 而刷新之后
同一条消息又回到它自己的日子里。同一个频道的两种读法不一致，唯一的线索是那条消息自己的时钟
（在「今天」里写着 23:59）。

现在事件带上 `date`（它读出来的那个日文件），视图按它归日。首屏没有拉到过的那一天会按日期顺序插到
该在的位置，所以更早的一天绝不会画在今天下面。

## 细节

- `packages/server/src/api/types.ts`：`CompanyServerEvent` 的 `org_channel` 多一个 `date`
  （`yyyy-mm-dd`，组织时区），注释写明它为什么存在。
- `packages/server/src/runtime/organization/reconcile.ts`：`scanChannels` 给每条广播出去的事件填上
  正在遍历的那个日文件的日子 —— 它本来就是循环变量。
- `packages/web/src/features/company/channel-view.tsx`：实时追加改用 `ev.date`，不再用 `meta.today`。
- `packages/web/src/features/company/channel-stream.ts`：`appendMessage` 遇到还没加载的那一天时，按
  日期顺序插进去，而不是追加到末尾（流是按日期从旧到新画的）；注释写明缘由。已有那一天的追加没变。

## 测试

- `packages/web/test/channel-stream.test.ts`：有序插入 —— 更早的一天排到今天上面、夹在两天之间的一天
  排到它该在的位置、传进来的数组不被改动、已经存在的那一天保持原位。
- `packages/server/test/organization-runtime.test.ts`：广播的事件里 `date` 就是那一行读出来的日文件。
- `packages/web/e2e/channel-live-day.spec.mjs`（真服务端 + 真浏览器）：频道打开时只有今天；把一行直接
  写进数据根里昨天的日文件，再经由一次 API 写入触发对账广播（不需要模型 key）→ 昨天成为今天上面的
  独立一段、那行在它里面，刷新后顺序一样。同一份用例跑在改前产物上会红在日分隔线上：那行被画在
  「今天」里。

## 兼容性

频道日文件的存储格式、路由与重新拉取的路径都没动。事件多出的字段是附加的：客户端读它，线上格式其余
一字未改。
