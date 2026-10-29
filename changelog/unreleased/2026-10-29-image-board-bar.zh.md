# 图片打开后，下面那条胶囊条是真的能用的

- **日期：** 2026-10-29
- **类型：** feature
- **范围：** `ui`、`web`
- **破坏性：** 无

[English](2026-10-29-image-board-bar.md)

图片在 lightbox 里打开以后，过去只有一个动作：关掉。现在图片下方多了一条胶囊工具条，只放页面**真做
得到**的事 —— **把这个文件存下来**，以及图片是同一批一起到的几张时，**在它们之间前后翻**。图片自己的
像素尺寸写在框的左上角，于是 2364 × 1773 的截图会这么说自己，而不是看上去只有窗口那么大。

不摆做不了的按钮。编辑、分图层、去背景那一族是图像生成服务的活，这里没有接口撑着它们，于是那条条上
一个这样的按钮都没有。

## 细节

- `packages/ui/src/components/overlays/lightbox/image-board.ts`（新增）：把算式从标记里分出来 ——
  `stepIndex`（一批图是转盘：最后一张的「下一张」是第一张）、`pixelSizeLabel`（图片自己的尺寸；还没
  加载完的 `<img>` 报 0 × 0，那时什么都不说）、`downloadName`（URL 或路径的最后一段并解码；路由自己
  那一段只是个 id 时取它在 `path=` 里带着的名字，如 `…/files/content?path=shot.png`；`data:` URL 按
  媒体类型给名字；`blob:` 用调用方的兜底名）。
- `packages/ui/src/components/overlays/lightbox/lightbox.tsx`：`Lightbox` 新增 `images` —— 这张图所属
  的那一批 —— 在点的那张上打开，每张一个缩略图（当前那张标 `aria-current`）、一个「2 / 3」计数与两个
  翻页按钮，保存的就是屏幕上那一张，文件名走 `downloadName(src)`。`ZoomableImage` 把调用方给的
  `group` 转进去。关闭按钮与 Escape 层的行为没动；只有一张图时，条上只剩下载。
- `packages/ui/src/strings.ts`：三个无障碍文案键 —— `download`、`previousImage`、`nextImage` —— 由
  Web 按语言映射（`common.previousImage` / `common.nextImage`、`files.download`）。
- `packages/web/src/features/chat/chat-input.tsx`：暂存的附件算一批，于是五张图里点开一张，就在另外
  四张之间翻，不用关掉再去找下一个缩略图。
- 测试：`packages/ui/test/image-board.test.ts`（新增：环绕、尺寸未知、每种名字来源）、
  `packages/ui/test/lightbox.test.ts`（条上的文案、下载名、一批图开在点的那张、缩略图、计数、空批
  次），以及 `packages/ui/test/strings.test.ts` 的键表。

## 兼容

- 接口、磁盘格式、线上协议都没变。不带 `images` 打开的 lightbox 仍是原来那张图加关闭按钮，多出一个
  保存动作；缩略图的标记与以前一模一样。
