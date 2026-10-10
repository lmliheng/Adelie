# A reply can be copied as plain text, not only as Markdown

- **Date:** 2026-10-11
- **Type:** feat
- **Scope:** `web`, `ui`

[中文版](2026-10-11-reply-plain-text-copy.zh.md)

A reply's footer had one copy button, and it handed over the reply's Markdown source. Pasted into a
chat, a ticket or a doc, the reader got the markers themselves — `##`, `**`, `| --- |` — and had to
clean them up by hand. The footer now carries two copy buttons: the first still copies the
Markdown, and a new "Copy as plain text" beside it gives the same words with the markup taken out.

## Details

- The two are told apart by their marks — the familiar copy glyph, and three lines. Hovering names
  what each one copies; on a successful copy both swap to a check and the screen-reader region
  beside them says 已复制.
- The plain text unwraps the same dialect the transcript renders: heading, bold, italic,
  strikethrough and inline-code markers go; a list keeps its bullet or number and its nesting as an
  indent; a table comes out row by row, without the edge pipes or the `| --- |` alignment row; a
  blockquote loses its `>`; a link reads `label (url)`, while a bare URL that was autolinked still
  appears once; an image gives its alt text; a fenced block keeps its code verbatim, unfenced;
  a footnote stays `[^id]`; math keeps its TeX source; raw HTML passes through as written.
- "Copy as plain text" only appears when the turn actually said something — with no reply body the
  first button falls back to the turn's usage stats, and there is no plain text to offer.
- The conversion walks the same syntax tree the transcript renders
  (`packages/ui/src/components/content/prose/plain-text.ts`), so a construct the renderer typesets
  is a construct this knows how to unwrap.
