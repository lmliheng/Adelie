# 文件面板能直接看 Word 和 PDF 了

- **Date:** 2026-10-28
- **Type:** feat
- **Scope:** `web`, `server`, `docs`
- **Breaking:** no

[English](2026-10-28-word-pdf-preview.md)

在文件面板里点开一个 `.docx`，以前只会得到一句「该类型不支持预览，请下载查看」—— Word 恰恰是最常交给
Agent 的那类文档，面板对它却无话可说。现在能看了：文档的标题、段落、粗体斜体、列表和表格，按只读的排版
文本显示在预览里。解析在服务端做（`.docx` 就是一个装 XML 的 zip，不需要机器上装 Office），结果是一份
Markdown，交给面板本来就在用的 Markdown 渲染管线。Word 的预览只是预览：没有编辑器，也没有源码视图，
因为屏幕上显示的不是那个文件本身。旧版 `.doc` 会提示另存为 `.docx`；读不出来的 `.docx` 直接说读不出来，
而不是画成一堆乱码。

PDF 也不再依赖客户端。以前是把文件塞进 iframe 交给浏览器自带的 PDF 阅读器：桌面 Chrome 上能看，可一旦
那个阅读器不存在、或被设成「下载 PDF」，面板里就是一块空白 —— 而空白看起来和文件坏了没有区别。现在面板
自己画：每页滚到眼前时才画一张画布，长文档不会一次画完。桌面应用、任何浏览器、没装 PDF 插件的机器，
看到的都一样。

## 细节

- `packages/server/src/services/docx-preview.ts`（新增）：`docxToMarkdown` —— 只解
  `word/document.xml`（解压前先按声明的长度封顶），然后把正文标签走一遍写成 Markdown：标题取自
  `w:pStyle` / `w:outlineLvl`（大纲级别优先，和 Word 自己的导航窗格一致），列表项按 `w:ilvl` 缩进，
  粗体斜体分别写成 `**` / `*`，表格写成首行即表头的 GFM 表格，`w:tab` / `w:br` 当空格，XML 实体会解码。
  Markdown 会当成语法的字符一律转义；块只裁掉尾部空白，嵌套项的缩进才留得住。输出上限 20 万字符并置
  `truncated`；没有正文部件的 zip、或者根本不是 zip 的字节，都抛 `DocxPreviewError`。
- `packages/server/src/http/routes/workspace-files.ts`：`GET <base>/preview-text?path=…` 返回这份
  Markdown，带读到的版本作 `ETag`、`no-store`、`nosniff`，被截断时带 `X-Content-Truncated`。`.doc` 回
  415 `doc_legacy`，其他类型回 415 `preview_unavailable` —— 这条路由给的是「派生出来的文档」，不是文件
  本身的字节。会话与目录两种寻址都注册了，所以新建对话页选的文件夹、侧栏的工作区组也能用。
- `packages/server/src/app.ts`：静态资源表补上 `.mjs`。前端产物里多了一个 ES module worker（pdf.js 的），
  而以 `application/octet-stream` 提供的模块脚本浏览器会拒绝执行。
- `packages/web/src/features/chat/pdf-preview.tsx`（新增）：`PdfPreview` 带着会话凭据取字节，按需加载
  pdf.js（worker 单独成资源，解析不占主线程），按面板宽度逐页画到画布上 —— 宽度变了重画而不是拉伸，最多
  2 倍像素密度、单页画布上限 16MP，未画的页先用占位撑住高度。卸载时销毁的是 loading task，不是文档对象
  （这个版本的文档对象没有 `destroy`，之前那一下在切文件时抛了 TypeError）。
- `packages/web/src/lib/workspace-tree.ts`：`previewKindFor` 给 `.docx` / `.doc` 加了 `doc` 类；
  `previewKindOf`（只读的 UI `FileBrowser`，不做解析请求）把它当「不支持」。
- `packages/web/src/features/chat/workspace-browser.tsx`：`doc` 分支去取 `preview-text` 并以只读
  Markdown 显示，旧版 `.doc` 和解析失败的 `.docx` 各有自己的提示；`pdf` 分支改成画 `PdfPreview`，不再是
  iframe。`fetchTextPreview` 也会认服务端的 `X-Content-Truncated`。
- `packages/web/src/api/{endpoints,workspace-files}.ts`：新增 `workspaceFileTextUrl` /
  `workspaceDirFileTextUrl`，`FilesApi` 两种 scope 都多一个 `textUrl`（沿用其他文件 URL 已有的机器路由）。
- 文案：`previewDocLegacy`、`previewDocxFailed`、`pdfLoading`、`pdfFailed`。
- 文档：`packages/docs/content/files.{zh,en}.md` —— 预览表格补上这两类，说明各自保留什么、丢掉什么、
  为什么只读，以及旧版 `.doc` 的答复；右键菜单那条不再把 PDF 算进「弹不出来」的范围（它现在就是普通 DOM）。
- `packages/web/package.json`：新增 `pdfjs-dist@^6.4.299`（Apache-2.0，单独分包；按
  `THIRD-PARTY-NOTICES.md` 的规矩，打进包里的 npm 依赖不必在那里另立条目）。

## 兼容

- `preview-text` 是新路由，原有接口的形状都没有变。
- `.docx` 不会再被当成文本文件去看：它有了自己的预览类型。
- PDF 预览不再需要浏览器自带的阅读器，客户端不需要任何设置。
