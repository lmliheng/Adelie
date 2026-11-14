# 文件面板里的 mp4 能在页面里直接播放

- **Date:** 2026-11-15
- **Type:** feature
- **Scope:** `server`, `web`, `ui`, `docs`

[English](2026-11-15-workspace-video-preview.md)

文件面板现在能放视频：在目录树里选中一个 `.mp4`，右侧就直接出现带控制条的播放器，拖动进度条只取那一段，不会把文件从头重新读一遍。超过 50MB 的视频不在页面里预览 —— 那是服务端自己的读取上限 —— 面板会直接说明，而不是挂一个放不出来的播放器。

## 细节

- `packages/server/src/services/workspace-files-service.ts`：`.mp4` 以 `video/mp4` 发出。它原先不在类型表里，发出去的是 `application/octet-stream`，带着 `nosniff` 的 `<video>` 会拒绝播放。
- `packages/server/src/services/byte-range.ts`：新增纯函数 `parseByteRange`，把单段 `Range` 的文法收在一处，自带用例。多段、畸形、首尾倒过来的请求一律忽略、照旧发整份文件（RFC 9110 允许）；只有起始字节在文件末尾或之后才算无法满足。
- `packages/server/src/http/routes/workspace-files.ts`：`GET …/files/content` 对可满足的区间回 `206` 加 `Content-Range`，对无法满足的回 `416` 并写明文件大小，其余照旧回整份文件。每条响应（包括忽略请求头的那几条）都带上了 `Accept-Ranges: bytes`。文件仍然是整份读进内存再发，所以 50MB 的读取上限和超限时的 `413` 都没变。
- `packages/ui/src/components/files/preview-pane/preview-pane.tsx`：`PreviewView` 多了一种 `{ kind: "video"; src; title; reloadKey? }`，画成 `<video controls preload="metadata" playsInline>`，用图片和 PDF 那样的带边框盒子。`reloadKey` 让同一个地址下重读到的新文件重新挂载播放器。
- `packages/web/src/lib/workspace-tree.ts`：`previewKindFor` 把 mp4 判成 `video`，`VIDEO_PREVIEW_LIMIT` 镜像服务端的读取上限；新增 `listingSize`，从已加载的目录列表里读出某个文件的字节数。只读的文件浏览器照旧把视频映射成 `unsupported` —— 它既没有播放器，也没有可判断大小的列表。
- `packages/web/src/features/chat/workspace-browser.tsx`：和上限的比较放在渲染视图的地方，而不是打开文件的时候。按引用打开（消息里的 `@path`）时，沿途目录是后台加载的，装着大小的那份列表可能还没到，而视图每次渲染都会重建，列表一到就会跟上。超限时面板给出原因，不挂播放器。
- 中英文案在 `packages/web/src/lib/strings.ts` / `strings-en.ts` 的 `files.previewVideoTooLarge`；说明写进 `packages/docs/content/files.zh.md` / `files.en.md` 的文件类型表、预览一节和限制表。

## 测试

- `packages/server/test/byte-range.test.ts`（8 条）：闭合区间、开放区间、从末尾倒数的后缀形式、越过文件末尾被截断的区间、几种无法满足的情形，以及多段 / 畸形 / 倒序 / 超大数这些一律退回整份文件的值。
- `packages/server/test/workspace-files.test.ts`：mp4 的 `files/content` —— 整份读取带真实类型，`bytes=0-3` 与 `bytes=6-` 回 `206` 切片并带 `Content-Range`，起点越过末尾回 `416`，无法解析的区间被忽略、仍回 `200`。
- `packages/web/test/workspace-tree.test.ts`：`clip.mp4` 判成 video、在只读浏览器里判成 `unsupported`；`listingSize` 能从持有它的列表里读出大小，而对没有列表覆盖的路径什么也不说。
- `packages/ui/test/files-panes.test.ts`：视频视图画出的 `controls` 元素带 `preload="metadata"` 和自己的标题。

## 兼容性

纯增量：新的预览类型、新的内容类型，以及给一个原本只发整份文件的路由加上区间支持。没有新依赖、没有数据库变更、没有 Project 配置变更。不发 `Range` 的客户端拿到的和以前逐字节相同。
