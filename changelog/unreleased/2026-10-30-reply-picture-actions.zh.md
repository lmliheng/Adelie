# 回复里的图片点开后多了两个动作：拆图层，照这张改一版

- **日期：** 2026-10-30
- **类型：** feature
- **范围：** `web`、`ui`
- **破坏性：** 无

[English](2026-10-30-reply-picture-actions.md)

对话里点开一张图，此前只有「下载」和翻页：图已经能看了，想拿它再生成点什么都得回输入框里手打
一遍那张图的路径。现在放大层的胶囊条上会多出两个按钮 —— **拆图层** 与 **照这张改一版** —— 图片
自己的路径由界面填好，用户不用再抄一遍。

两个动作都不走 App 自己的接口：这一仓没有图像端点，模型、密钥和文件都在 Agent 那一侧，所以动作
其实是**交给 Agent 的一句话**。拆图层是一次参数确定的 Seedream 调用（`--layers`），点了就直接作为
用户的消息发出去，回复里会有底图和每一层透明 PNG；改一版改成什么样得由用户说，所以它只把带参考图
的指令填进输入框，按下发送仍是用户的事 —— 生成按张计费，不该由一次「重做」的点击替人买单。

Agent 没装出图技能（`@adelie/use-seedream` 带来的 `seedream`）时两个按钮都不出现：只能失败的按钮比
没有按钮更糟，这也是胶囊条一开始就立下的规矩。

## 细节

- `packages/ui/src/components/overlays/lightbox/lightbox.tsx`：`LightboxAction`（`key` / `label` /
  `onSelect`）成为 `Lightbox` 与 `ZoomableImage` 的可选 `actions`，画在胶囊条里「下载」之后。选中
  先关覆盖层再执行 —— 动作多半要落在下面的页面上（输入框里的一段话、给 Agent 的一轮对话），隔着遮
  罩做等于让用户看回自己刚点过的那张图。
- `packages/ui/src/components/content/prose/prose.tsx`：`ProseImagesProvider` 多一个可选
  `actions` 解析器（`ProseImageActionsResolver`），与旁边的图片/链接解析器同形，`MdImage` 把它交给
  放大层。传下去的是 **Markdown 写下的 src**，不是解析器换出来的 URL —— 上层按 src 认文件，文件路
  由那一串 URL 它认不出来。
- `packages/web/src/lib/image-actions.ts`（新）：`hasSeedreamSkill`、`replyImageActionBuilder`。
  纯逻辑，两个动作的接线都在这里，词典里的措辞由调用方传入，所以中英各自一处。
- `packages/web/src/features/chat/workspace-refs.tsx`：会话多一个按工作区路径回答「这张图能做什么」的
  解析器，与取文件走同一个 `resolveReplyImage`（同一条路径分拣两次，是两次各说各话的机会）。
- `packages/web/src/features/chat/chat-page.tsx`：技能清单本来就在（输入框的技能选择用同一份），够
  判断要不要出按钮。拆图层用 `api.postTask(..., { queueIfBusy: true })` 直接发，不动用户正在写的
  草稿；改一版走 `ComposerControl.fillPrompt`，并钉上 `seedream`，与拆图层发出的是同一条
  `[use_skills]` 消息。
- `packages/web/src/features/chat/message-stream.tsx`：渲染上下文多 `imageActions`，透给 Markdown。
- `packages/web/src/lib/strings{,-en}.ts`：`chat.imageAction` —— 两个按钮的字，以及各自那句话
  （提示词就是消息本身，所以跟着界面语言走）。
- 测试：`packages/web/test/image-actions.test.ts`（新：技能门禁、两个动作的名字与去向、
  `[use_skills]` 包装、路径原样带上）、`packages/ui/test/lightbox.test.ts`（条上的按钮、没有动作时
  条子一个像素不变、先关再执行）、`packages/ui/test/prose.test.ts`（解析器拿到的是写下的 src）、
  `packages/web/e2e/reply-picture-actions.spec.mjs`（新，真浏览器：没装技能的 Agent 不出按钮，装上之后点了按钮，覆盖层关掉、输入框里是带路径的那句话，拆图层则作为一条带技能标记的消息发出去）。

## 兼容

- 接口、磁盘格式、线上协议都没变。没装出图技能的 Agent、以及一切非会话的 Markdown 界面，行为与
  从前完全一致：图片照旧只可放大与下载。
