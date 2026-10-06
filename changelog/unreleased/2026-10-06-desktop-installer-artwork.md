# Desktop: the Windows installer carries Adelie's own sidebar and header artwork

- **Date:** 2026-10-06
- **Type:** feature
- **Scope:** `desktop`

[中文版](2026-10-06-desktop-installer-artwork.zh.md)

The NSIS assisted installer draws two images, and neither of them was Adelie's: the welcome and
finish pages fell back to NSIS's own stock graphic (`${NSISDIR}/Contrib/Graphics/Wizard/nsis3-metro.bmp`)
and the inner pages' header bar stayed empty. Anyone installing Adelie on Windows therefore saw
NSIS's branding — a dated, low-resolution bitmap — around Adelie's name, and no brand of ours in the
header at all.

Both images are now rendered from the same immutable brand mark the app icon comes from
(`packages/web/public/adelie-icon.svg`): a navy sidebar with the mark, the wordmark and a short
tagline, and a light header chip with the mark and the wordmark. They are committed as 24-bit BMPs
under `packages/desktop/build/nsis/`, wired into `electron-builder.yml` (`nsis.installerSidebar`,
`nsis.installerHeader`; the uninstaller reuses the sidebar), and pinned by
`packages/desktop/test/installer-art.test.ts`.

## Desktop

- `scripts/render-installer-art.mjs` draws each image at its exact target size — 164×314 for the
  sidebar, 150×57 for the header — on a canvas and encodes the BMP itself (no image library, no
  downscaling). Both sizes and the 24-bit depth are NSIS's own requirements: a bitmap of any other
  size, or a 32-bit one, is ignored **in silence**, leaving the stock graphic and the blank header
  back in place. `test/installer-art.test.ts` reads the committed headers and fails on any
  drift, and also checks that the config still names those two files.
- Regenerating is manual (`node packages/desktop/scripts/render-installer-art.mjs`) and
  byte-reproducible; it needs the Playwright chromium the Web App's tests already install.
