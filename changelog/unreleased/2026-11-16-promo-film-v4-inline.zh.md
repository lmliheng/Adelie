# 首页宣传片换成第四版成片；README 里放的是会动的 GIF，不是 `<video>`

- **Date:** 2026-11-16
- **Type:** docs
- **Scope:** `docs`

[English](2026-11-16-promo-film-v4-inline.md)

`assets/promo/adelie-promo.mp4` 换成 60 秒的第四版：画面里的每个界面都是真实运行的 Adelie 的截图与
一次真实会话的录屏，图标直接用仓库里的 `packages/web/public/adelie-icon.svg`，片子本身只有黑灰白。
封面帧一并换掉（`assets/promo/adelie-promo-poster.png`）。

## 原来那块看不了的原因

首页挂着封面图，点它是 `assets/promo/adelie-promo.mp4` 的**仓库内相对链接**。GitHub 把它翻译成
`github.com/lmliheng/Adelie/blob/main/...` —— 一个 HTML 页面，页面上只有「Download raw file」，它不
播放；`raw.githubusercontent.com` 那一路返回 `application/octet-stream`，点开是下载。

## GitHub 的 README 不放 `<video>`

先按常见写法试了 `<video src="…raw.githubusercontent.com/…">`：`POST /markdown` 的渲染结果里标签是
留着的，但**仓库首页的 README 渲染会把它整段删掉** —— 实测推上去以后线上那一行只剩一个空 `<p>`，
同类写法在 `peers/peerjs`、`schmich/instascan` 这些公开仓库的首页上也一样被删。

活下来的只有 GitHub 自己托管的附件地址：`https://github.com/user-attachments/assets/<uuid>` 的
`<video>` 会保留（渲染时会加上 `data-canonical-src`，见 `matt1398/claude-devtools`、
`agentheroes/agentheroes`）。那种链接只能在网页里登录后把文件拖进输入框换来，本次没有走那条路。

## 现在放的是什么

`assets/promo/adelie-promo-preview.gif`：片子**开头 9 秒**的循环预览，800×450、10fps、2.8MB ——
图标落位、字标出现、划掉「大多数 AI，只会陪你聊天」、然后是那句立题。它是从成片里逐帧取的，没有重画。
它是 `<img>`：README 里的图片由 GitHub 翻译成 `/raw/…` 再 302 到 `raw.githubusercontent.com`，
和页面上那条图标 GIF 走的是同一条路 —— 能显示就能动。`<video>` 的差别不在取不到文件，
而在 GitHub 压根不留那个标签。

点这张预览图 = `assets/promo/adelie-promo.mp4`（blob 页，可下载）；下面一行小字还留着整片与封面两条链接。
