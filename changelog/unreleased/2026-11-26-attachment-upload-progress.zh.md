# 大文件附件的上传有了进度

- **Date:** 2026-11-26
- **Type:** feat
- **Scope:** `web`

[English](2026-11-26-attachment-upload-progress.md)

附一个大文件（用户报的是 177MB）发送时，页面从头到尾没有任何读数：输入框只是被禁用，而正文里带着
附件的请求可能要走上几分钟。原因是附件**以 base64 塞在请求体里**（服务端 `attachment-limits.ts` 写明
了为什么，以及 200MB 的上限——177MB 的文件在线上是约 236MB 的请求体），而浏览器发它的 `fetch` 根本
没有上传进度事件。现在这一个请求改走 XHR 读进度，读数显示在角落的进度卡片上（就是删 Agent 时用的
那张卡）：标题、一根实心进度条、以及「已发出 / 总共」两个字节数。600ms 内就能发完的正文不会弹卡；
发送成功或失败都直接收起——消息出现在对话里就是成功，失败的原因由输入框上方那句话说明。

## 细节

- `packages/web/src/api/xhr-upload.ts`（新）：用 `XMLHttpRequest` 发这一个请求，从
  `upload.onprogress` 取读数，并把结果包成一个真正的 `Response`——于是下游（非 2xx → `ApiError` 的
  信封映射、`Date` / `ETag` 的读取、空响应体的处理）与 `fetch` 路径是同一份代码，两条传输不会在含义上
  分家。构造函数是参数，node 里跑的单测传自己的假 XHR。
- `packages/web/src/api/client.ts`：`ApiFetchOptions.onUploadProgress`——给了它才走 XHR；没给就一行都
  不变，普通消息照旧 `fetch`。
- `packages/web/src/api/endpoints.ts`：`postTask` / `postSteer` 透传这个回调。
- `packages/web/src/features/chat/message-upload-progress.ts`（新）：`inputBytes` / `steerBytes` 从各部分
  的字符串本身估出请求体大小（不为了量它而把 236MB 的正文 `JSON.stringify` 一遍），超过 2MB 才开卡片；
  `postTaskWithUploadProgress` / `postSteerWithUploadProgress` 是各调用点改用的包装。
- 调用点：`chat-page.tsx` 的发送、排队追问、`/model` 切换、`@` 交接，以及草稿页的首条发送
  （`draft-view.tsx`）；转向（steer）一处。
- 文案：`uploadingMessage` 与 `uploadProgressDetail`（中英各一份）。

## 兼容性

只改这一个请求的传输方式与前端显示：路径、正文、cookie 鉴权、错误码都没变，服务端一字未动。2MB 以下
的正文仍然走 `fetch`。
