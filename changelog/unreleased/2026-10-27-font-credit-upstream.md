# Typography credits link to the type's own project, with the npm package on its own line

- **Date:** 2026-10-27
- **Type:** feat
- **Scope:** `web`, `ui`
- **Breaking:** no

[中文](2026-10-27-font-credit-upstream.zh.md)

**Credits** in settings lists every face by the themes that use it, its licence, and the full text. Its
**Source** row used to print a package name such as `@fontsource-variable/mona-sans`, which is neither a
URL nor the party the licence credits. Source is now a link to the type's own project (Mona Sans points
at GitHub's `github/mona-sans`, and JetBrains Mono, IBM Plex and Noto Sans SC likewise), and how the file
reaches us is a second row, **Packaged as**, underneath. MiSans already came from the vendor's own
download page, where both would be the same address, so that row is left out for it.

## Details

- `packages/ui/src/fonts/credits.ts`: `FontCredit` gains a required `upstream` (whose type it is);
  `source` stays "how the file got here" (an npm package or the vendor's download page).
- `packages/web/src/features/settings/credits-section.tsx`: **Source** links `upstream`; a **Packaged as**
  row is drawn only when `source` differs from it, in monospace and not as a link.
- Strings: `creditsPackaged` ("打包来源" / "Packaged as").

## Compatibility

- Presentation only: license texts and `THIRD-PARTY-NOTICES.md` are unchanged.
