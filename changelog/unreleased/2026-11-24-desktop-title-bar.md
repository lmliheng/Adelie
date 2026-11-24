# The desktop app's caption is the app's own now, and follows the theme

- **Date:** 2026-11-24
- **Type:** feature
- **Scope:** `desktop`, `server`, `web`

[中文](2026-11-24-desktop-title-bar.zh.md)

On Windows and Linux the caption along the top of the window was the operating system's: the system's
colours, light under a light system and dark under a dark one. It was the one strip of the app no
theme could reach — switch themes, import one, and that strip looked the same. The window is now
created without a caption and the page draws one of its own, above the navigation column and the main
column alike, on the theme's own chrome surface. A shipped theme and an imported one both carry it.

Minimise, maximise and close stay the system's: Electron keeps them by drawing its own controls over
the page (the Window Controls Overlay), so the window is still draggable and still closable. Their
background and the ink of their symbols are read off the theme by the page and handed to the shell,
again on every theme change. macOS is untouched — those three buttons are its own strip, and a release
that ships no macOS build should not be the first place a mac window loses its frame.

## Details

- **Shell (`packages/desktop`)**: new `src/title-bar.ts` (`titleBarWindowOptions` /
  `titleBarStatusMessage` / `parseTitleBarCommand` / `overlayOptionsFor`). The window is created with
  `titleBarStyle: "hidden"` and a `titleBarOverlay` 32px tall, the caption's own height; the shell
  pushes "the caption is yours" to the page; a relayed pair of colours re-colours the controls through
  `setTitleBarOverlay`, and a refusal is one line in the log rather than a dead shell. Only Windows and
  Linux go this way — on macOS both the window options and the status say "leave it alone".
- **Server (`packages/server`)**: new `GET/PUT /api/desktop/title-bar` (the shell window's sessions
  only, on the same relay as the tray and the pet). GET reads the shell's last push; PUT forwards the
  two colours and answers 202. A colour that is not a non-empty string, or a request naming no colour
  at all, is refused with 400, and 503 while no shell is wired. The wire types, the route table in
  `platform.ts` and `ifaces.json` move with it.
- **Web (`packages/web`)**: new `components/layout/desktop-title-bar.tsx`, mounted as the outermost
  strip by `AppLayout`. It draws only in the desktop shell's own window, and only when the shell says
  it handed the caption over; the words come from the same live window title the tab title is written
  from; the drag region is one `-webkit-app-region: drag` rule in `styles.css`; and every attribute
  change on the root element — which is where a theme change lands — re-reads the tokens and re-sends
  the colours.
- **The colours are resolved to sRGB before they are sent**: a token's value is usually a `var()`
  chain ending in `oklch()` (Tailwind's own palette), which the controls refuse outright — measured
  here as `Could not parse color as CSS color`, after which they keep their default colours. So the
  token is resolved through a probe element, painted into a 1×1 canvas and read back as bytes; what
  the shell receives is an sRGB `#rrggbb`.
- No new dependency and no storage-format change.

## Tests

- `packages/desktop/test/title-bar.test.ts` (new, 10 cases): only Windows and Linux hand the caption
  over, the window options and the status split the same way, a relayed frame is read only when it is
  one, and a colour the command did not carry is left off rather than sent as `undefined`.
- `packages/server/test/desktop-title-bar.test.ts` (new, 8 cases): the status reads null and then what
  the shell pushed, a password session gets 403 and a plain server 404, a PUT forwards and answers
  202, an unreadable colour or an empty request is 400, no shell is 503, and title-bar frames do not
  cross wires with the tray's and the pet's on the one relay.
- `tsc --noEmit` passes for `@adelie/desktop`, `@adelie/server` and `@adelie/web`; `oxlint` and
  `prettier --check` pass; the full `@adelie/web` unit suite (356 files) passes.
- **On the real thing**: a real Electron shell run under Xvfb on this machine (Linux, which supports
  the overlay), driven through its debug port — the strip is 32px tall, carries the drag region and
  the window's title; under the shipped light theme its background is `oklch(0.985 0 0)` and the shell
  is sent `#fafafa` / `#171717`; in dark mode `#202020` / `#d6d6d6`; under an imported theme whose
  `--ui-surface-muted` is `#7a3b2e`, both the strip and the colours sent to the shell become that
  theme's values. The "could not parse" line is gone. Whole-window screenshots of all three states are
  in the workspace under `titlebar-shots/`.

## Compatibility

A shell older than this change never pushes the status, so the page draws nothing and the native
caption stays. One route and one set of relay frames are added; no existing field changed.
