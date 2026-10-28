# 回复里的图片点一下就看全图

- **日期：** 2026-10-29
- **类型：** feature
- **范围：** `web`、`ui`
- **破坏性：** 无

[English](2026-10-29-prose-image-lightbox.md)

自从上一轮回复里的图片能显示出来，它一直是按阅读栏宽度缩着显示的：一张 2000px 的截图出来只有几
百像素宽，想看清只能去文件面板里找那个文件。现在会话里的图片点一下就按自己的尺寸打开 —— 用的是
文件预览与附件早就在用的那个 lightbox，按 Esc（或点背景）关掉。

其余都不变。会话之外的每一处 Markdown 界面 —— README、手册、记忆视图、文件预览 —— 仍然是静止的
一张图；会话里**被作者用链接包住的图片**也一样：那一下点击归链接。

## 细节

- `packages/ui/src/components/content/prose/prose.tsx`：`ProseImagesProvider` 多了 `zoomable`
  （默认关），打开时 `img` 适配器渲染成 `ZoomableImage`。两种情形仍是普通 `<img>`：空 src（没有
  东西可放大），以及被链接包住的图片 —— 按钮嵌在 `<a>` 里两个处理器都会触发，点一下会同时开一个
  标签页和一层覆盖。`MdLink` 现在告诉自己的子节点「你在链接里」（`ProseInLinkContext`），适配器
  因此不必去查 DOM。
- `packages/ui/src/components/overlays/lightbox/lightbox.tsx`：`ZoomableImage` 把调用方给的其余
  `<img>` 属性（Markdown 图片的 `title`、`width`、`height`）转发给缩略图；lightbox 本身按文件原尺寸
  显示，仍然只收 src 与 alt。
- `packages/web/src/features/chat/workspace-refs.tsx`：会话给整条对话打开 `zoomable`，与 src 解析成
  什么无关 —— 解析器决定图片从哪取，不决定读者能不能放大。
- 测试：`packages/ui/test/prose.test.ts`（适配器：开、关、空 src、在链接里）、
  `packages/ui/test/lightbox.test.ts`（缩略图保留调用方的属性）、`packages/web/test/md.test.ts`
  （真管线：会话里的图片是按钮，别的界面不是）。

## 兼容

- 接口、磁盘格式、线上协议都没变。会话之外的图片仍是原来那个 `<img>`；会话里的图片多了一层按钮，
  而被链接包住的图片渲染出的标记与以前一模一样。
