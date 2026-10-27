# 字体致谢里「来源」指向字体项目本身，npm 包名另起一行

- **Date:** 2026-10-27
- **Type:** feat
- **Scope:** `web`, `ui`
- **Breaking:** no

[English](2026-10-27-font-credit-upstream.md)

设置里的**版权信息**页逐个字体列出它用在哪个主题、什么许可、全文在哪。其中「来源」那一行以前写的是
`@fontsource-variable/mona-sans` 这样的包名 —— 它既不是网址，也不是这项许可的持有人。现在那一行是指向
字体项目本身的链接（Mona Sans 指 GitHub 的 `github/mona-sans`，JetBrains Mono、IBM Plex、Noto Sans SC
同理），文件究竟从哪个 npm 包来，另起一行「打包来源」写在下面。MiSans 本来就是从厂商的下载页来的，
两行是同一个地址，所以那一条不出现第二行。

## 细节

- `packages/ui/src/fonts/credits.ts`：`FontCredit` 多一个必填的 `upstream`（这是谁的字体），`source`
  仍是文件怎么来的（npm 包或厂商下载页）。
- `packages/web/src/features/settings/credits-section.tsx`：「来源」链 `upstream`，`source` 与它不同时
  才多画一行「打包来源」，值用等宽字、不可点击。
- 文案：`creditsPackaged`（中「打包来源」/ 英 "Packaged as"）。

## 兼容

- 只改了展示：许可正文与 `THIRD-PARTY-NOTICES.md` 都没有变。
