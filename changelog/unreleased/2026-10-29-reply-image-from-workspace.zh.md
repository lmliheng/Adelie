# 回复里的图片从工作区取，不再指向 Web App 自己的源

- **日期：** 2026-10-29
- **类型：** fix
- **范围：** `web`、`ui`
- **破坏性：** 无

[English](2026-10-29-reply-image-from-workspace.md)

模型写图片的方式和写 README 一样 —— `![预览](shot.png)`，路径相对它工作的那个工作区。会话以前
照原样渲染这个 src，于是浏览器把它解析成 App 自己的路由（`/chat/shot.png`，一个不存在的页面），
回复里每一张工作区图片都是一个坏图。上一轮装上的图像插件更进一步：它直接告诉 Agent **别用**
Markdown 图片语法，因为要看见生成的图只能去文件面板里打开。

现在会话里的图片 src 与链接走同一套判断。指向工作区文件的，从这个会话自己的文件路由取，图片就在
对话里显示（会话在机器上，就从那台机器取）；指向别的站点的，src 原样保留；解析不到东西的 —— 爬出
工作区的 `..`、`~` 路径、被渲染器清空的 src —— 一律照原样保留，坏图本身就是那句话的真相。

## 细节

- `packages/ui/src/components/content/prose/prose.tsx`：新增 `ProseImagesProvider` /
  `ProseImageResolver` 与 `img` 适配器，与旁边的链接解析器同形。上面没有解析器时，图片保留
  Markdown 写的 src，所以渲染 README、手册、文档的每一处界面都不变。空 src 不渲染 `src` 属性
  （而不是 `src=""`，那是在向浏览器要当前页面）。
- `packages/ui/src/components/content/prose/prose.css`：`.md-body img` —— 阅读栏就是图片的最大宽度，
  按原比例缩放，2000px 的截图不会把对话撑宽。
- `packages/web/src/lib/reply-image.ts`：`resolveReplyImage` —— 纯规则，`external` / `file` /
  `none`，复用 `toWorkspaceRelative` 与链接解析器用的那个 scheme 判断（`isExternalRef`，从
  `lib/reply-link.ts` 导出，不再写第二份）。
- `packages/web/src/features/chat/workspace-refs.tsx`（原 `workspace-links.tsx`）：会话同时提供两个
  解析器，文件按它现在做的事改名。`MessageStream` 的渲染上下文多了 `workspaceFileUrl`，由
  `chat-page.tsx` 按会话 id 构造 —— 起草时没有（那时还没有会话的文件可读）。
- `plugins/use-seedream/skills/seedream/SKILL.md`：「把结果交给用户」一节改成让 Agent 直接给图，
  不再说图片语法解析不了。
- 测试：`packages/web/test/reply-image.test.ts`（规则）、`packages/web/test/md.test.ts`（真管线里
  进到 DOM 的东西）、`packages/ui/test/prose.test.ts`（适配器与它的默认行为）、
  `packages/web/e2e/reply-image.spec.mjs`（真浏览器：那张图真的解码了，另两个 src 原样不动），
  并在 e2e 的 mock 模型里加了一条分支。

## 兼容

- 接口、磁盘格式、线上协议都没变。会话之外的 Markdown 界面渲染与以前完全一致；只有回复里的图片换
  了一个取法，而那个 URL 正是文件面板一直在用的。
