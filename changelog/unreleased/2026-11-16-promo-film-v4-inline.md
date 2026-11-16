# The front-page film is the fourth cut; the README plays a GIF, not a `<video>`

- **Date:** 2026-11-16
- **Type:** docs
- **Scope:** `docs`

[中文版](2026-11-16-promo-film-v4-inline.zh.md)

`assets/promo/adelie-promo.mp4` is now the 60-second fourth cut: every screen in it is a screenshot of the
running Adelie plus the recording of one real conversation, the icon is the repository's own
`packages/web/public/adelie-icon.svg`, and the film itself carries nothing but black, grey and white. The
cover frame (`assets/promo/adelie-promo-poster.png`) was replaced with it.

## Why the old block would not play

The front page showed the cover image, linking to `assets/promo/adelie-promo.mp4` — a **repository
relative** link. GitHub turns that into `github.com/lmliheng/Adelie/blob/main/...`, an HTML page whose only
video affordance is "Download raw file"; it plays nothing. The `raw.githubusercontent.com` path for the
same file answers with `application/octet-stream`, so opening it downloads.

## GitHub's README does not keep `<video>`

The obvious fix — `<video src="…raw.githubusercontent.com/…">` — survives `POST /markdown` but **is deleted
outright by the README renderer on the repository page**: after pushing it, the line came back as an empty
`<p>`. The same markup on `peers/peerjs` and `schmich/instascan` is stripped the same way.

What does survive is GitHub's own attachment host: a `<video>` pointing at
`https://github.com/user-attachments/assets/<uuid>` is kept, and the renderer adds `data-canonical-src`
(see `matt1398/claude-devtools`, `agentheroes/agentheroes`). Those URLs only come from dragging a file
into the web editor while signed in, which is not what this change did.

## What ships instead

`assets/promo/adelie-promo-preview.gif` — the film's **first 9 seconds** as a loop: 800×450, 10 fps, 2.8 MB.
The icon lands, the wordmark follows, "most AI just talks to you" is struck through, and the thesis arrives.
Every frame is taken from the film; nothing was redrawn. Being an `<img>`, GitHub rewrites it to `/raw/…`
which 302s to raw.githubusercontent.com — the same path the icon GIF on the same page takes, so what can
display can animate. A `<video>` differed not in reachability but in the tag itself: GitHub drops it.

Clicking it opens the mp4's blob page for download; the caption line keeps direct links to the film and the
cover image.
