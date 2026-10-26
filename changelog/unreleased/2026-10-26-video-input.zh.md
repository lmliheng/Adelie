# 对话界面能收视频了：把片子拖进输入框，模型可以直接看

- **Date:** 2026-10-26
- **Type:** feat
- **Scope:** `core`, `server`, `web`, `docs`
- **Breaking:** no

[English](2026-10-26-video-input.md)

输入框的回形针菜单多了一项**上传视频**，也可以直接把视频拖进来或粘贴进来。选中的视频在发送前显示成一张
能看第一帧的卡片（带文件名和大小，可删），发出去之后在对话里就是一个能播放、能全屏的视频。

会话用的模型**接受视频输入**时（模型库里的 Seed 系列等，卡片上标着**视频**），这段片子会作为视频内容随这
一轮请求直接发给模型——模型能描述它、总结它、就画面提问，不需要任何中间步骤。模型**不接受视频**时也不会被
拒绝：片子会落到这个会话的暂存目录，消息里出现一行 `[attached file: …]`，由 Agent 自己用工具处理，和附件
完全一样。前端不需要你去判断模型属于哪一种，服务端按模型决定。

## 细节

- **AgentHub 补丁**（`patches/@prismshadow__agenthub.patch`，用 `pnpm patch` 生成并已登记在
  `pnpm-workspace.yaml` 的 `patchedDependencies`，锁定 0.4.15）：`ContentItem` 联合类型加上
  `{ type: "video_url"; video_url: string }`，`transformUniMessageToModelInput` 里加一条分支把它翻成
  Chat Completions 的 `{"type":"video_url","video_url":{"url":…}}`。服务商要的就是这个形状（火山方舟的
  视频理解接口），视频**不做 base64 重新编码**——与图片不同，图片拿到的是完整的 data URL。
- **core**：`VideoUrlPayload` + `videoUrlMessage()`（`omni-message` 的 public API）；
  `GenerativeModel` 加上视频预算（`maxVideos`）——一次请求只带一个视频，更旧的换成一行
  `[video omitted: …]`，因为一次视频请求是几十兆的 base64，历史里攒两个视频会被服务商永久拒绝。上限由
  `catalogSupportsVideo(provider, modelId)`（或条目上的 `video` 注解）决定。
- **服务端**：任务输入新增部件 `{type:"video_url", videoUrl, fileName?}`，`/steer` 新增同名的
  `videos` 字段；内联视频上限 **32MB**（413 `video_too_large`，方舟本身是「视频 <50MB、请求体 <64MB」，
  base64 涨 4/3），必须 `data:video/…`；模型不吃视频时自动落成附件（http(s) 地址无法落盘，这种组合直接 400
  并说明原因）。模型列表多报一个 `video`，`/api/me` 多报一个 `videoMaxMb`，前端据此做预检与分支。
- **历史页**：`video_url` 和图片一样按引用下发（新路由
  `GET /api/sessions/:id/trace-video?file=&ordinal=`，由 `services/trace-media.ts` 提供，旧的
  `trace-images.ts` 一并改名合并），否则一页历史要把几十兆 base64 整份读回来。撤回未发出的消息（#287）
  也会把内联视频原样还回输入框。
- 文档：`models.zh.md` / `models.en.md` 的笔记里写明「视频」标签与两种走法。
- 测试：`server/test/video-input.test.ts`（内联 / 落盘 / 无名视频按类型命名 / 非视频数据 URL / 超限 413 /
  中途 steering 的两种走法）、`server/test/trace-media.test.ts`（视频按引用、字节与类型、404 与 400）。

## 兼容性

- 依赖多了一份**补丁**：`pnpm install` 会应用 `patches/@prismshadow__agenthub.patch`（pnpm 会为它算
  `_patch_hash`），npm 上仍是官方 `@prismshadow/agenthub@0.4.15`。上游还没有 `video_url` 支持，所以补丁
  锁定版本号——上游升版时 pnpm 会报冲突而不是悄悄丢掉它。
- 服务端接口只增不改：老的 `input` 部件、老的 `/steer` 请求照旧；`/api/me` 与模型列表多了字段，旧客户端
  忽略即可。
- 没有视频的会话完全不受影响：视频预算是「从未带过视频」时的空操作。
