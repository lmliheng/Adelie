# 定时任务的启用开关被拒时，原因留在那一行下面，不再只活在六秒的提示里

- **日期：** 2026-10-31
- **类型：** fix
- **范围：** `web`
- **破坏性：** 无

[English](2026-10-31-schedule-toggle-refusal.md)

定时任务行的启用开关同样是**不乐观写入**：写入落地之前它不动，所以被拒的那一次什么都不会发生 ——
开关还在原位、列表也没有变。于是原因只剩一条 toast，六秒之后屏幕上就是「点了没反应」，而读者
看着的正是那个开关。两个共用这一行的界面（「定时任务」页与对话停靠栏里的定时任务面板）现在把服务端
的话留在这一行下面，直到下一次翻转。

## 细节

- `packages/web/src/features/schedules/schedule-toggle.ts`（新）：`ScheduleToggleRefusal` 与
  `scheduleRefusalFor()` —— 一句话属于哪一行由这里一处决定：任务的名字是「Agent 的目录 + 文件名」，
  两个 Agent 可以有同名任务，所以只让被拒的那一行画出这句话。
- `packages/web/src/features/schedules/schedule-row.tsx`：多一个 `refusal` 属性，在名字与排期行
  下面画一行 danger 色的 `role="alert"`（限两行、整句挂在悬停上），引子复用全站共享的
  `S.common.refused`，与「被拒的写入」在别处读起来一致；没有新增文案。
- `packages/web/src/features/schedules/schedules-page.tsx`、`schedule-panel.tsx`：各自多一个
  `toggleRefusal` 状态（两个宿主本来就各留一份删除确认的拒绝，行本身共用），翻转前清空、被拒时
  经 `apiErrorText` 填上（所以是服务端原话，或该码的本地化句子），不再走 `toastError`。

## 测试

- `packages/web/test/schedule-toggle.test.ts`（新，4 条）：没有拒绝时不出声、被拒的那一行拿到
  句子、同一个 Agent 的另一个任务不继承、另一个 Agent 的同名任务也不继承。
- `packages/web/e2e/schedule-toggle-refusal.spec.mjs`（新，真服务端三条）：被拒的翻转把原因留在
  那一行（旁边那一行没有）、通知区里没有可点的 toast、开关仍是开位、服务端里任务仍启用，并且
  toast 该消失的六秒之后这一行还在；放开拒绝后下一次翻转真的落地，这一行随之消失、开关跟着移动；
  停靠栏面板里同样成立。

## 兼容

- 接口、磁盘格式、请求体都没变。成功的翻转与从前完全一致，只有失败那条路不再用 toast。
- Agent 设置页的定时任务 tab 用的是按钮与表格（不是共用的这一行），本轮没动，见台账。
