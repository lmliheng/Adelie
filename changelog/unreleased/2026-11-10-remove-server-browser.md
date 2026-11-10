# The server browser is gone

- **Date:** 2026-11-10
- **Type:** refactor
- **Scope:** `server`, `web`, `ui-gallery`, `docs`
- **Breaking:** yes — the Server Browser page and every `/api/server-browser` route are removed, and `ADELIE_SERVER_BROWSER` / `ADELIE_SERVER_BROWSER_BIN` are no longer read

[中文版](2026-11-10-remove-server-browser.zh.md)

The **Server Browser** page — a Chromium the server ran itself, whose picture was streamed into the page as MJPEG — is no longer part of this build. It shipped in 0.6.3 ([a browser the server runs itself](2026-11-01-server-browser.md)) and on the machine it was run on the picture cost more than the page was worth. The desktop app's built-in browser is untouched: its pages are elements of the app's own window and it never needed a browser on the server.

## What is gone

- The page and its sidebar row. `/browser` now falls through to `/chat` like any other unknown path.
- Every route: the status read, start, stop, navigate, back, forward, reload, resize and input, plus the MJPEG `frames` stream.
- The `ADELIE_SERVER_BROWSER` and `ADELIE_SERVER_BROWSER_BIN` environment variables, and the "switched off" status the first one produced.
- The server browser's stand-in in the UI gallery's demo, and its documentation page and configuration entries.

## What is left on the discarded machine

The profile that feature had filled in lives in the data root (`browser-profile/`), with whatever a sign-in left in it. An upgrade does not delete it — remove that directory by hand once its contents no longer matter.

## Compatibility

Nothing else in the product called those routes, so no caller needs a change. A deployment that still exports `ADELIE_SERVER_BROWSER` or `ADELIE_SERVER_BROWSER_BIN` starts up exactly as before; the two names are simply unread.
