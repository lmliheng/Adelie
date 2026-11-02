# A browser the server runs itself, for the machines with no desktop window

- **Date:** 2026-11-01
- **Type:** feature
- **Scope:** `server`, `web`, `ui-gallery`, `docs`

[中文版](2026-11-01-server-browser.zh.md)

The sidebar has a **Server Browser** page: the browser process runs on the machine serving the app, its picture is streamed into the page, and clicks, scrolls and keystrokes travel back.

The built-in browser cannot do this. Its pages are elements of the desktop app's window, so opening `penguin web` in a browser, running in Docker, or reaching a machine remotely leaves no browser at all — `penguin browser` answers `browser_unavailable` in those cases. This page is the other way round: all it needs is a Chromium or Chrome on the server. Give it a virtual display and it is an ordinary windowed browser rather than a headless one — headless Chromium is unrecognizable to many sites, and often will not play their video at all.

Admins only: starting it spawns a process on the server, and the browser's profile is shared by the whole installation.

## The picture is one MJPEG stream

`GET /api/server-browser/frames` answers `multipart/x-mixed-replace`, which is what an `<img>` plays natively. So the page needs no canvas, no frame decoder and no socket — the browser on that machine rasterizes, and the page shows the result. Frames are dropped rather than queued when a viewer falls behind: somebody watching wants the newest picture, not a backlog of old ones. With no viewer, the screencast is not started at all, so a page standing still costs nothing.

## The last frame does not stay behind

In a `multipart/x-mixed-replace` stream, the browser only takes up a part once the next one begins. While a page is moving that is invisible; when a page repaints once it is the whole problem — you click, the page changes, and the picture still shows what was there before the click, as if the click had done nothing. So a frame that is not followed by another within 150 milliseconds is written again, and the copy is what gets taken up: the picture is current straight away. A page in motion pays nothing for this — no frame is written twice. The same holds for the dropping rule: what is dropped is the older frame a newer one replaced, never the newest itself.

## The address and the title come from the browser's history

No pixels carry an address bar, so the page reads the status every 1.2 seconds. The title is not the one the browser reports for the target: a page that commits with a `<title>` still reports its host name there — `example.com/` comes back as `example.com`, a local address as `127.0.0.1:38809` — while the browser's own history entry is right. So the title is asked of the history, not of the document by running a script in it.

## The page is redrawn at the size of the box

The picture is not a fixed-size image scaled to fit: the page redraws the server's page at whatever size this box measures (clamped to 320×240 … 1920×1200). Narrow the window and the page inside narrows with it, instead of becoming a small unreadable copy. Pointer coordinates are converted through the area `object-fit: contain` actually draws into, so a click does not drift when there are margins.

## Whose browser it is

Opening the page starts it (the picture request is the request for it), and closing the page leaves it **running** — it is not an appendage of the page, and whoever opens the page next sees the same browser and its one page. To actually let it go, press the stop button at the end of the toolbar. Sign-ins live in the data root's `browser-profile`, so they survive a restart and an upgrade. When the App is hot-swapped or shut down, the process goes down with it, rather than leaving two browsers fighting over one profile.

## What it cannot do

With no Chromium or Chrome on the server, or with it switched off by `ADELIE_SERVER_BROWSER=off`, a status read answers `available: false` with the reason and the page says so — a fact about the deployment, never a failure — and no route starts a process. A browser installed elsewhere is named by `ADELIE_SERVER_BROWSER_BIN`.

The page has one page and no tabs: what it exists for is watching a page your own machine cannot reach, and a second tab is where a window manager starts. The desktop app keeps its own tabs.

## The bar is watching, not scrolling a feed

The picture, the clicks, the wheel and the keyboard all work. Whether a data-centre IP can sign into some platform, or make its video play, is that platform's risk control and login problem and has nothing to do with this page showing a page. A browser under its default user agent cannot open some sites at all (it lands on a captcha interstitial), and those sites ask for a sign-in in a real desktop browser too.

## Input methods are not wired up yet

What travels back is the keyboard: letters, digits, symbols, Enter, Tab and the arrow keys all reach the page. Chinese — anything an input method composes first and then hands over as a whole string — does not, because the composing happens on your side and there is nothing there to catch it yet. That is the next thing to add, not a setting.
