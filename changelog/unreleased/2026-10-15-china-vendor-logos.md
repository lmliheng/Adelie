# Xiaomi, Baidu, Tencent and iFlytek groups get their own marks

- **Date:** 2026-10-15
- **Type:** feat
- **Scope:** `ui`

[中文版](2026-10-15-china-vendor-logos.zh.md)

The four vendor groups added to the Models page (Xiaomi MiMo, Baidu ERNIE, Tencent Hunyuan, iFlytek
Spark) no longer show a first-letter tile: each draws its platform's mark — Xiaomi's rounded Mi
square, Baidu's paw over the "du", Tencent Hunyuan's ring, and iFlytek's winged emblem.

All four follow the rules the rest of the set does: **monochrome** (the brand colour collapses into
the surrounding text colour, so the mark reads in both themes), pure paths, no external image
assets. Nothing was redrawn — every shape is the one its owner publishes: Xiaomi, Baidu and Tencent
Hunyuan the marks on `mi.com` / `baidu.com` / `hy.tencent.ai` (as simple-icons traces them), and
iFlytek the emblem of its site logo with the wordmark beside it dropped and the viewBox cropped to
the ink. The iFlytek mark is a little wide (1.17:1), so it letterboxes top and bottom in a square
box, as TokenDance and the other wide marks already do.

The previous release shipped these groups as letter tiles because no brand asset for them had been
checked, and a hand-drawn approximation of a trademark is worse than the tile. This change brings
the four shapes back verbatim, source by source (each glyph's comment names its own).
