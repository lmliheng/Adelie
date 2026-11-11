# 换权限档被拒时，原因留在输入框上方，不再只活六秒

- **日期:** 2026-11-12
- **类型:** 修复
- **范围:** `web`
- **破坏性变更:** 否

[English](2026-11-12-permission-refusal.md)

输入框里的权限按钮一次写两半 —— 审批模式与会话自己的沙盒策略 —— 按钮先把选中的那一档画出来，写入落定后再回读
会话。所以被拒时屏幕上什么都不变：按钮退回它原来读到的等级，而那一档**没有写成**、会话上的权限一处没动；这条
路由又是先把每个字段都验过才写，被拒时什么都不落库。此前这个原因只在页面顶部一条六秒后自己消失的通知里，留下
一次看起来根本没被记下的点击。

现在那句话画在**输入框卡片上方**（与思考等级被拒时同一个位置）：`没能切换权限（会话仍是原来的权限）：<原因>`。
它留到下一次选择为止 —— 那个权限按钮就是重试；这件事不再另弹通知。

## 细节

- `packages/web/src/features/chat/permission-refusal.ts`（新增）：`permissionRefused(error)` 按 `refusalText`
  （全应用统一的拒绝口径，7.19）造句，并说清「会话仍是原来的权限」—— 一个退回原位的按钮自己说不出来的事实。
- `packages/web/src/features/chat/chat-page.tsx`：`onChangePermission` 的拒绝写进 `permissionRefusal`
  （按 sessionId 归属，切换会话不会串），每次尝试开始先清掉上一句；这一处不再 `toastError`。
- `packages/web/src/features/chat/chat-input.tsx`：`ChatInput` 多一个可选的 `permissionRefusal`，画在卡片上方
  （`role="alert"`、危险色、限两行、整句挂悬停），与 `thinkingRefusal` 并排。
- `packages/web/src/lib/strings{,-en}.ts`：两种语言各一句。

## 测试

- `packages/web/test/permission-refusal.test.ts`：句子走 `refusalText` 而不是线上原话、保留没到路由的失败、
  没话说时回落到通用文案、说明会话仍是原来的权限、跟随当前语言。
- `packages/web/e2e/permission-refusal.spec.mjs`：真服务端 + 真浏览器 —— 被拒的选择把句子留在卡片上方、通知区
  没有东西、七秒后仍在、按钮退回「总是询问」、服务端那一行仍是 `always-ask`；同一次重试写成功后句子归零、按钮
  变成「全部放行」、服务端跟上。

## 兼容性

线上接口没变、没有新依赖、Project 配置没变。同一页面上思考等级被拒的那一句、成功的写入、以及其余通知都一字未改。
从「智能体」停靠面板里改权限走的是同一个写入，因此它的拒绝也落在同一处；面板挡住输入框时，那颗控件自己仍读着
原来的等级，就是重试。
