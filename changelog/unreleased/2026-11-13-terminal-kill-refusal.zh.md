# 结束终端被拒时，原因留在发问的那张卡片里

- **日期:** 2026-11-13
- **类型:** 修复
- **范围:** `web`
- **破坏性变更:** 否

[English](2026-11-13-terminal-kill-refusal.md)

结束一个 Shell 有两条路 —— 停靠栏里终端标签的 ×，以及独立 `/terminal` 窗口里的 terminal.close 快捷键
（⌃⌥` / Ctrl+Alt+`）—— 两条都会先问一句，因为结束一个 Shell 无法撤销。可两条都不看答案：请求发出去就不管了
（`void killTerminal(...)`），而那个函数既不读非 2xx 的回话、也不报连不上的连接。于是被拒的结束照样把标签摘掉、
或者把窗口关掉，而 Shell 仍在服务端跑着，屏幕上**一个字都没有** —— 连别的拒绝以前至少还有的那条六秒通知都没有。
列表同样在发请求之前就把条目删了，从不还回来。

现在被拒的结束会把条目还回去，并在发问的那张卡片里说明原因（共享卡片的 `refusal` 槽，`操作被拒绝：<原因>`）：
标签留在停靠栏里（窗口也留着，因为它是这个 Shell 唯一被显示的地方），服务端自己的话画在卡片那句话下面，卡片的
按钮就是重试。标签只在结束真的落地之后才离开。

## 细节

- `packages/web/src/features/terminal/terminal-list.ts`：`killTerminal` 的 DELETE 改走应用的 API 客户端，
  不再是裸 `fetch` —— 非 2xx 于是变成全应用同一个 `ApiError`（码按词典本地化），连不上变成 `network_error`；
  两种情况都把条目放回、清掉 `pendingKills` 里的记号、并重读一次列表 —— 对一个真的已经没了的 Shell，404 会让它
  再次消失，那正是用户要的结果。DELETE 仍然发给持有这个 pty 的那台机器。
- `packages/web/src/features/dock/dock-panel.tsx`：结束卡片多一个 `killRefusal`；标签只在结束 resolve 之后才
  移除、卡片才关闭。这句话在卡片打开时与关闭时清掉。
- `packages/web/src/features/terminal/terminal-page.tsx`：独立窗口同理，被拒时不再关窗 —— 那会把仍在跑的
  Shell 藏起来。
- 词典多一条码：`terminal_not_found`（DELETE 自己的 404），中英各一条。

## 测试

- `packages/web/test/terminal-kill-refusal.test.ts`（新增，四条，走 node 套件唯一的 `fetch` 假件）：被拒的
  DELETE 把条目放回并以服务端的码拒绝；连接断掉算 `network_error`，条目同样放回；真的落地的那次让条目留在外面，
  且发给持有 pty 的那台机器；200 带 body 不算失败。
- `packages/web/e2e/terminal-kill-refusal.spec.mjs`（新增，三条，真服务端 + 仓库自带的 mock 模型 + 真浏览器）：
  停靠栏的卡片留下 `terminal_not_found` 的那句话、标签与活着的 Shell，通知区什么都没有，七秒后仍在 —— 随后
  同一个按钮重试、结束落地（204），标签离开、Shell 也没了；被拒之后按 Escape 关掉，下一次打开的卡片是干净的；
  独立窗口同样把自己那条拒绝（`internal`）留在屏幕上、仍连着那个 Shell，重试后才结束它。
- 拿改动前的页面（`HEAD` 的源码重新构建）跑同一份用例，三条都死在卡片里找不到 `role="alert"`。

## 兼容性

线上接口没变、没有新依赖、Project 配置没变。每一次成功的结束与以前一模一样（条目立刻离开列表，标签在服务端确认后
离开）；变的是「根本没发生的结束」—— 它不再看起来像发生了。
