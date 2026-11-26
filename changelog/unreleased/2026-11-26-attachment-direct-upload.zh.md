# 大附件不再塞进消息正文里

- **Date:** 2026-11-26
- **Type:** feat
- **Scope:** `server`, `web`

[English](2026-11-26-attachment-direct-upload.md)

以前一条消息的附件是**以 base64 塞在请求体里**的，所以一个 177MB 的文件就是一次约 236MB 的
`fetch`：只有整份都发完浏览器才说得出一个「已发出」，慢网下就是输入框被禁用几分钟（以及它前面那道
超时）。现在大文件走自己的上传：发送时先把每个大文件传进这个会话的 scratchpad，消息里只带一个指向
落盘文件的小 part。

分界是 2MB（`DIRECT_UPLOAD_MIN_BYTES`）：比它大的走直传，其余照旧内联，所以一张截图、一段短日志
不会为此多一个来回。

## 细节

- `POST /api/sessions/:sessionId/attachments?name=…`（新）：正文是原始字节
  （`application/octet-stream`），边收边落盘；单文件上限按到达的字节量判定，超了就断开并删掉写了一半
  的文件回 `413`——不在内存里整份缓冲。空正文 `400`，成功 `201` 回 `{fileName, path, bytes}`
  （`packages/server/src/http/routes/sessions.ts`）。
- `services/task-attachments.ts`：`TaskAttachment` 现在是 `inline`（同以前）或
  `uploaded { fileName, path }`。`receiveAttachment` 写进会话的 scratchpad，`resolveUploadedFile` 只认
  该会话 scratchpad **直接层**里的普通文件（`lstat` 查过、不是软链）——别的会话给的路径、或者指到外面
  去的路径一律拒绝。`assertAttachmentBudget` 只计内联正文，`assertTotalBytes` 把已上传的加上；
  `attachFilesToInput` 先量后写，并把写过的东西返回，失败的一轮可以收回去。
- `packages/web/src/lib/upload-limits.ts`（新）：`DIRECT_UPLOAD_MIN_BYTES` 与 `splitByTransport`。
- `packages/web/src/features/chat/message-upload-progress.ts`：`ComposerFile` 变成
  `inline | direct | uploaded`；`resolveComposerFiles` 逐个直传，每个文件一张进度卡，`filePartsOf` 把
  结果变成消息要带的 part。
- 上传发生在**发送时**、拿到会话 id 之后（草稿的首条消息先建会话）——所以上传失败就是这一次发送失败，
  原因显示在输入框上方，草稿和附件都留着，按钮就是重试。

## 兼容性

内联附件照旧，`packages/docs/content/chat.{zh,en}.md` 的附件一节写明了文件走哪条路。上传的文件住在会话
的 scratchpad 里，随会话删除；被撤回的上传文件不再读取或重发，撤回那一行只报它的名字和大小。
