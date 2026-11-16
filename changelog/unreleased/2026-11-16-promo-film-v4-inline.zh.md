# 首页宣传片换成第四版成片，README 里直接能播放

- **Date:** 2026-11-16
- **Type:** docs
- **Scope:** `docs`

[English](2026-11-16-promo-film-v4-inline.md)

`assets/promo/adelie-promo.mp4` 换成 60 秒的第四版：画面里的每个界面都是真实运行的 Adelie 的截图与
一次真实会话的录屏，图标直接用仓库里的 `packages/web/public/adelie-icon.svg`，片子本身只有黑灰白。
封面帧一并换掉（`assets/promo/adelie-promo-poster.png`）。

## 为什么原来那块看不了

原来 README 首屏挂着封面图，点它是 `assets/promo/adelie-promo.mp4` 的**仓库内相对链接**。GitHub 把
它翻译成 `github.com/lmliheng/Adelie/blob/main/...` —— 一个 HTML 页面，页面上只有「Download raw file」，
它不会播放；而 `raw.githubusercontent.com` 那一路返回的是 `application/octet-stream`，点开是下载，
不是播放。所以封面看起来能点，点下去什么也放不出来。

## 现在怎么放

两份根 README 都改成 GitHub 认的 `<video>` 标签，`src` 指向 `raw.githubusercontent.com` 上的同一个文件：

```html
<video src="https://raw.githubusercontent.com/lmliheng/Adelie/main/assets/promo/adelie-promo.mp4" controls width="920"></video>
```

GitHub 的 markdown 清洗器保留 `video[src|controls|width|muted]`（`poster` 与 `playsinline` 会被去掉），
浏览器把 raw 上的 mp4 当媒体源播放（实测 Chrome `readyState=4`、时长 60s）。同一段下面一行小字留着
「下载 mp4」和「封面图」两条相对链接，网络放不出来时还能存下来看。

另注：把视频拖进 GitHub 的输入框、拿 `github.com/user-attachments/assets/<uuid>` 那种链接也是通行写法，
但那需要在网页里登录后上传，本仓库没有走那条路 —— 仓库里的文件本身就是权威副本，链接不该指向别处。
