---
title: Server browser
description: A browser the server itself runs, streamed into the Web App — for machines with no desktop window, such as a Linux box reached over ssh.
---

The **server browser** is a page in the Web App (the **Server Browser** row in the sidebar): the browser process runs on the machine serving the app, and you watch its picture here — and click, scroll and type on it from here too.

It exists for what the [built-in browser](/builtin-browser) cannot reach. The built-in browser's pages are elements of the desktop app's window, so only a desktop app has one; open `penguin web` in a browser, run in Docker, or reach a machine remotely, and there is none. The server browser is the other way round: all it asks for is a Chromium or Chrome on the server.

- What it is and when to reach for it: [When to use it](#when-to-use-it).
- Opening a page and clicking in it: [Using it](#using-it).
- No browser on the server, or none wanted: [Switching it off, or naming another browser](#switching-it-off-or-naming-another-browser).
- An agent driving a browser itself is a different thing: see the [built-in browser](/builtin-browser#drive-it-from-the-command-line).

## When to use it

It is the machine's single set of browsing pages, and they belong to the server itself: every Project and every conversation sees the same browser and the one page it has open. That is unlike the built-in browser, whose tabs are also shared machine-wide — but that browser lives inside the desktop app's window.

It is for the cases where the browser on *this* machine sees something different from yours:

- Opening something reachable only from inside a server's network.
- Seeing what a web page looks like on a machine with no display at all: the server gives the browser a virtual display, so it is an ordinary windowed browser rather than a headless one.
- Keeping a page open somewhere that does not deserve a place on your own screen.

**It is an admin's tool.** Starting it spawns a process on the server, and the browser's profile is shared by the whole installation, so this page and every route behind it are open to admins only.

## Using it

Opening **Server Browser** in the sidebar is enough: the browser is started when the page asks for its picture, so there is no separate first step. The toolbar is **Back**, **Forward**, **Reload**, the address bar and **Go**; at the far end is the button that **Starts** the browser when it is not running and **Stops** it when it is.

- The address bar follows a browser's rules: a bare domain like `example.com` opens over `https://`, and Enter opens what you typed. Anything that is not http or https is refused.
- The picture is the page. **Click it to use it**: clicks, double-clicks, right-clicks, drags and the wheel all reach the page, and so does the keyboard — Tab, Enter and the arrow keys included.
- **Typing with an input method works too.** Letters, digits, symbols, Enter, Tab and the arrow keys travel as keys, and a composed character — Chinese, and anything else an input method hands over as a whole string — travels as that string. There is an invisible field over the picture, and that is where the composing happens.
- The line above the picture shows the page's title, its address, and whether it is still loading; the right-hand end is the size the browser is drawing the page at.
- The page is redrawn at the size of the box on this page. Narrow the window and the page on the server narrows with it — what you see in this area is the viewport, so nothing has to be magnified.
- When the picture stops — the browser was stopped, or the server was restarted — a line and a **Reload** button take its place; the button reconnects.

The browser **keeps running** after you close this page: it is not an appendage of the page, and anyone who opens this page sees the same browser. To actually let it go, press **Stop the browser** at the end of the toolbar.

## Sign-ins stay on the server

The browser's profile lives in the server's data root (`<root>/browser-profile`), so the sites you signed into are still signed in after a restart or an upgrade — and the same signed-in browser is what another machine opening this page sees.

That directory is shared by the whole installation: everyone using this server browser uses the same sign-ins.

## Switching it off, or naming another browser

With no Chromium or Chrome on the server, this page says so instead of showing an empty box. To keep the server from pulling a browser up at all, set `ADELIE_SERVER_BROWSER=off`; for a browser installed somewhere else or under another name, `ADELIE_SERVER_BROWSER_BIN` names its executable. Both are in [Configuration](/configuration#environment-variables).

The browser creates its profile directory inside the data root the first time it starts, so the disk holding that root has to be writable.

## The server API

The routes behind the page are the `/api/server-browser` group, admin-only like the page:

- `GET /api/server-browser` — what is going on: whether this server can show a browser, whether one is running, and the current page's address, title and drawn size.
- `POST /api/server-browser/start`, `/stop` — start or stop the browser.
- `POST /api/server-browser/navigate` with `{ url }`; `/back`, `/forward`, and `/reload` (with an optional `{ hard }`).
- `POST /api/server-browser/resize` with `{ width, height }` (brought inside 320×240 … 1920×1200).
- `POST /api/server-browser/input` with `{ events: [...] }`: one batch of input events, applied in order.
- `GET /api/server-browser/frames` — the picture itself, a `multipart/x-mixed-replace` MJPEG stream an `<img>` plays as it arrives. Frames are dropped rather than queued when a viewer falls behind.

With no browser on the machine, or with it switched off, a status read answers `available: false` and the reason — it is never reported as a failure.
