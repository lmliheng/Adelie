# The desktop app can keep a pet on screen: a small penguin for notices, updates and balance

- **Date:** 2026-10-20
- **Type:** feature
- **Scope:** `desktop`, `server`, `web`
- **Breaking:** no

[中文版](2026-10-20-desktop-pet.zh.md)

The desktop app has a companion window: a small Adelie penguin in the bottom-right corner of the
screen the main window is on, above other windows, drawn on a transparent background so it floats
on the desktop instead of sitting in a box. Settings › Appearance gained a "Show desktop pet"
switch beside the tray-icon one, and the pet's own panel carries a way to hide it again; both write
the same preference, so the two cannot disagree. It is **off by default** — the tray icon is chrome
inside a window the user already opened, while the pet is a window of its own floating over other
apps, so it appears when it is asked for and not before. The shell remembers the choice in
`pet.json` under its user data and reopens the window on start when it is on.

What the pet is for: it says one thing at a time in a bubble above the penguin — a schedule that
fired, by name; how many tool calls are waiting for a person ("有 N 个工具调用在等你批准"); a
colleague's spend nearing or passing its budget — and keeps the last five in the panel behind a
click. The panel also carries the account's pinned group balance with a refresh action, the
client-update state with the one action that state offers (check, download, restart to install),
and the newest notice.

## Details

- The pet window is a second window of the same app origin showing a route of the Web App itself
  (`/pet`): no preload, no IPC bridge, no separately served page. It is frameless, transparent,
  non-resizable, kept off the taskbar and always on top; the page paints the penguin and marks the
  rest of the window draggable, so the pet is moved by dragging anywhere on it that is not a control.
- Everything it shows comes over the same HTTP surface every other page reads: the user-level event
  stream for what happened while nobody was looking, the shell's update snapshot, and the pinned
  model balance. Because that stream is the user-level one, a schedule firing in any Session, an
  approval waiting in any Session and a budget warning all reach the pet.
- Turning it on and off crosses the same relay the tray switch uses: `GET`/`PUT /api/desktop/pet` on
  the server, restricted to the shell's own windows and refused anywhere else, then a
  `desktop-pet-command` frame over the utilityProcess channel to the shell, which writes `pet.json`
  and opens or closes the window. A missing `showPet` and a non-boolean one are rejected at the
  route instead of being relayed.
- The window is 260×248, 24px off the bottom-right corner of the main window's working area. It is
  not click-through — a transparent pixel still swallows the click that lands on it — so the size is
  kept as tight as the bubble and the penguin together need.
- The penguin is an inline SVG in the Web App with fixed colours and no external asset, and it bobs
  gently unless the system asks for reduced motion.
- The pet's page re-reads the update snapshot once a minute and speaks only when the announced state
  actually changes: the shell pushes that snapshot to the server, so polling is what turns it into
  something the pet can say.
- `/pet` is an ordinary route. In a plain browser tab the penguin still draws and the notices still
  arrive; the two readings that belong to the shell say so rather than failing, and the pet's own
  hide action is not offered where there is no pet window to hide.
- The desktop shell's smoke run now reports the pet window's URL and title, and screenshots it
  beside the main window's when a screenshot was asked for.

## Compatibility

- Nothing existing changed: this adds a route, a preference file and a window. `showPet` defaults to
  off, so an install that had no pet keeps having none until the switch is turned on, and the shell
  members the pet's relay adds are optional, so a shell without them is not required to answer.
