# The front-page film is the fourth cut, and the README plays it inline

- **Date:** 2026-11-16
- **Type:** docs
- **Scope:** `docs`

[中文版](2026-11-16-promo-film-v4-inline.zh.md)

`assets/promo/adelie-promo.mp4` is now the 60-second fourth cut: every screen in it is a screenshot of the
running Adelie plus the recording of one real conversation, the icon is the repository's own
`packages/web/public/adelie-icon.svg`, and the film itself carries nothing but black, grey and white. The
cover frame (`assets/promo/adelie-promo-poster.png`) was replaced with it.

## Why the old one would not play

The front page used to show the cover image, linking to `assets/promo/adelie-promo.mp4` — a **repository
relative** link. GitHub turns that into `github.com/lmliheng/Adelie/blob/main/...`, an HTML page whose only
video affordance is "Download raw file"; it plays nothing. The `raw.githubusercontent.com` variant of the
same path answers with `application/octet-stream`, so opening it downloads instead of playing. The cover
looked clickable and clicking it produced nothing.

## What it is now

Both root READMEs use the `<video>` tag GitHub accepts, with `src` pointing at that same file on
`raw.githubusercontent.com`:

```html
<video src="https://raw.githubusercontent.com/lmliheng/Adelie/main/assets/promo/adelie-promo.mp4" controls width="920"></video>
```

GitHub's markdown sanitizer keeps `video[src|controls|width|muted]` (it drops `poster` and `playsinline`),
and browsers take the mp4 off raw as a media source (Chrome: `readyState=4`, duration 60s). The line under
it keeps two relative links, "download the mp4" and "cover image", for networks where the player cannot
reach the file.

Drag-and-drop uploads — the `github.com/user-attachments/assets/<uuid>` links many repositories use — also
work, but they need a signed-in browser upload, and this repository should not point its own front page at
somewhere other than the copy it ships.
