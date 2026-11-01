# The credits page states the themes' licence and where they come from

- **Date:** 2026-11-01
- **Type:** feature
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-01-theme-credits.zh.md)

Settings › Credits listed a licence for every font but said nothing about the other half, the
themes. Below the fonts there is now a 「Themes」 block: the three the app ships (Primer, Frost,
Console) come with Adelie, and the four in the theme library on the Appearance page (Cyberpunk,
Doodle, Clay Glow, Skeuo) are maintained by lmliheng and fetched on request. All seven are
Apache-2.0, the licence Adelie itself carries, and the block ends with the theme library's
repository. A theme file holds colour and size values only, never code.

## Details

- `packages/web/src/features/settings/credits-section.tsx`: the font list gains an outer spacing
  wrapper and a following `ThemeCredit` — a heading, one paragraph and a link out to
  `github.com/lmliheng/adelie-themes`.
- Copy: `creditsThemeLibrary` ("Themes") and `creditsThemeLibraryInfo`. Static words rather than a
  fetch: the page has to stay readable offline and cannot fail to say what the app itself ships just
  because the library is unreachable. The library's live list is the Appearance page's, beside the
  picker.
- `packages/web/test/credits-section.test.ts` (new, 2 cases): the font family names and the licence
  heading are still rendered, and the theme block carries `Apache-2.0`, `lmliheng`, the repository
  URL and all seven theme names.

## Compatibility

- Display only: the `themes/*.json` format and the way themes are fetched are unchanged, and
  `THIRD-PARTY-NOTICES.md` is unchanged too.
