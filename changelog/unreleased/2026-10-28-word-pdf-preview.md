# Word and PDF files preview in the Files panel

- **Date:** 2026-10-28
- **Type:** feat
- **Scope:** `web`, `server`, `docs`
- **Breaking:** no

[中文](2026-10-28-word-pdf-preview.zh.md)

Selecting a `.docx` in the Files panel used to answer "Preview not supported for this type; download
instead" — a Word file is the one kind of document people hand an Agent most often, and the panel had
nothing to say about it. It now opens: the document's headings, paragraphs, bold and italic runs, lists
and tables, laid out as read-only text in the pane. The extraction runs on the server (a .docx is a zip
of XML, and reading it needs no office suite installed) and comes back as Markdown, so the panel renders
it through the Markdown pipeline it already trusts. A Word preview is a preview: no editor, no source
view, because what is on screen is not the file. A legacy `.doc` says to save it as `.docx`; a `.docx`
that cannot be read says so instead of rendering as garbage.

PDFs stop depending on the client. The pane used to hand the file to the browser's own PDF viewer in an
iframe, which worked on a desktop Chrome and left a blank rectangle wherever that viewer is missing or
set to download instead — a blank pane that reads exactly like a broken file. The panel now paints the
pages itself, one canvas per page as it scrolls into view, so a PDF looks the same in the desktop app, in
any browser, and on a machine with no PDF plugin at all.

## Details

- `packages/server/src/services/docx-preview.ts` (new): `docxToMarkdown` — inflates only
  `word/document.xml` (its declared size capped before inflation), then walks the body's tags into
  Markdown: headings from `w:pStyle` / `w:outlineLvl` (the outline level wins, as Word's own navigation
  pane has it), list items indented by `w:ilvl`, `**bold**` / `*italic*` runs, GFM tables whose first row
  is the header, `w:tab` / `w:br` as spaces, and the XML entities decoded. Every character Markdown would
  read as syntax is escaped, and only the tail of a block is trimmed so a nested item keeps its indent.
  The output is capped at 200,000 characters with `truncated`; a zip without the document part, or bytes
  that are not a zip at all, is a `DocxPreviewError`.
- `packages/server/src/http/routes/workspace-files.ts`: `GET <base>/preview-text?path=…` serves that
  Markdown with the read's version as `ETag`, `no-store`, `nosniff` and `X-Content-Truncated` when the
  extraction was cut. A `.doc` is 415 `doc_legacy`, any other type 415 `preview_unavailable` — this route
  serves a derived document, never the file's own bytes. Registered in both scopes, so the new-chat draft
  and a sidebar Workspace group get it too.
- `packages/server/src/app.ts`: `.mjs` joins the static content types. The web build now emits one ES
  module worker (pdf.js's), and a browser refuses a module script served as `application/octet-stream`.
- `packages/web/src/features/chat/pdf-preview.tsx` (new): `PdfPreview` fetches the bytes with the
  session's credentials, loads pdf.js lazily (its worker as its own asset, so parsing is off the main
  thread), and paints each page at the pane's width — redrawn on resize rather than stretched, at most 2×
  device pixel ratio and a 16MP canvas ceiling, with a placeholder holding each page's height until it
  renders. The loading task is what gets destroyed on unmount, not the document proxy (which has no
  `destroy` in this version).
- `packages/web/src/lib/workspace-tree.ts`: `previewKindFor` gains `doc` for `.docx` / `.doc`;
  `previewKindOf` (the read-only UI `FileBrowser`, which does no extraction fetch) names it unsupported.
- `packages/web/src/features/chat/workspace-browser.tsx`: the `doc` branch fetches `preview-text` and
  presents a read-only Markdown view, with its own message for a legacy `.doc` and for a `.docx` the
  server could not read; the `pdf` branch draws `PdfPreview` instead of an iframe. `fetchTextPreview`
  also honours the server's `X-Content-Truncated`.
- `packages/web/src/api/{endpoints,workspace-files}.ts`: `workspaceFileTextUrl` /
  `workspaceDirFileTextUrl`, and `textUrl` on `FilesApi` for both scopes (with the machine routing the
  other file URLs already carry).
- Strings: `previewDocLegacy`, `previewDocxFailed`, `pdfLoading`, `pdfFailed`.
- Docs: `packages/docs/content/files.{zh,en}.md` — the preview table gains the two types, plus what each
  keeps and drops, the read-only rule, and the legacy `.doc` answer. The context-menu note no longer
  claims PDFs, which are ordinary DOM now.
- `packages/web/package.json`: `pdfjs-dist@^6.4.299` (Apache-2.0, code-split into its own chunk; per
  `THIRD-PARTY-NOTICES.md` a bundled npm package needs no entry there).

## Compatibility

- `preview-text` is a new route; nothing existing changed shape.
- A `.docx` can no longer be mistaken for a text file: it has its own preview kind now.
- PDF previews no longer need the browser's PDF viewer, so no configuration on the client side.
