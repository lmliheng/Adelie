# 文件面板：Edit 打不开编辑器时，原因留在预览上方

- **Date:** 2026-11-26
- **Type:** fix
- **Scope:** `web`

[English](2026-11-26-files-edit-open-refusal.md)

在文件面板里按「编辑」并不是每次都能开出编辑器。隔离的 HTML 预览不带正文（iframe 送的是页面本身），
所以源码要等这次点击才去读 —— 而超过预览上限的文件读不全，读本身也会失败（Agent 刚刚重写或删掉了
那个文件）。两种情况下面板都跟按之前一模一样：没有编辑器、同一个预览、同一个指针下的「编辑」按钮。
唯一的回答是一条六秒后自己消失的通知，读者回头看面板时，那个按钮就像从来没被按过。

现在原因留在预览上方、就在那个按钮旁边，直到下一次尝试。超过上限那句直接说该做什么（下载后编辑，
下载才是重试）；读失败那句是「无法打开编辑器：」加上原因 —— 与全应用每一处拒绝槽位同一条规则。

## 细节

- `packages/web/src/features/chat/edit-open-refusal.ts`（新增）：`editOpenTooLargeRefusal` 管面板自己的
  测量，`editOpenFailedRefusal` 管读抛出来的值 —— 后者走 `refusalText`，服务端的回答按错误码换成当前
  语言的句子，面板自己抛的值保留它自己写的字。
- `packages/web/src/features/chat/workspace-browser.tsx`：`startEdit` 里那两处 `toastError` 换成一份按
  路径记的 `editRefusal` 状态（另一个文件的预览不可能显示它），每次新尝试开始时清掉，只在编辑器没开
  着的时候画在预览上方。`fetchTextPreview` 抛出的消息从裸状态码改成 `HTTP <状态码>`，因为这句话就是
  面板要显示的那句。
- `packages/web/src/lib/strings{,-en}.ts`：新增一个槽位 `files.editOpenFailed(reason)`。
- `packages/web/test/edit-open-refusal.test.ts`：七条单测（两半、两种语言、服务端回答、自己抛的值、
  无可奉告的兜底）。
- `packages/web/e2e/files-edit-open-refusal.spec.mjs`：两条用例 —— 超过上限的 HTML 文件、读被 500 拒；
  每条都断言句子在面板上、通知区是空的、预览与「编辑」按钮还在、句子活得比 toast 久。

## 兼容性

接口、数据根与成功路径都没变；没有新依赖。成功的「编辑」开出的还是同一个编辑器，保存被拒那几处也
原样未动。
