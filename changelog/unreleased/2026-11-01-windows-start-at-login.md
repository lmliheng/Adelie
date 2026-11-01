# The desktop app can start with your Windows session, and waits in the tray

- **Date:** 2026-11-01
- **Type:** feature
- **Scope:** `desktop`, `server`, `web`
- **Breaking:** no

[中文](2026-11-01-windows-start-at-login.zh.md)

Settings › Appearance has a new row in the Windows desktop app — 「Start when you sign in」 — which
registers the installed app to start when that user signs in to Windows. It is off until it is
turned on, it applies at once, and the launch Windows itself starts opens no window: the app waits
in the tray, and the tray icon (or starting the app again, which comes to the same window) is how
the window appears. Nothing needs administrator rights and no service is installed — the entry is a
value in the current user's own startup list (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`),
and uninstalling removes it.

The row shows what Windows holds rather than a preference of our own, which is why it can also go
the other way: disable Adelie in Task Manager › Startup apps and the switch here reads off, because
that is what will happen at the next sign-in.

## Details

- `packages/desktop/src/login-item.ts` (new, pure, unit-tested): the argument the entry registers
  (`--started-at-login`), the write, the read and the frame parsers. Two decisions are recorded
  there: the value is registered under a name of the app's own (`Adelie`) so the uninstaller deletes
  exactly one value, and the reading therefore comes from `executableWillLaunchAtLogin` — Electron's
  `openAtLogin` compares the value named the AppUserModelId, which ours is not, while
  `executableWillLaunchAtLogin` answers the question the switch is asking: does any startup entry
  launch this executable and is it not disabled.
- The row is offered only where there is an entry to manage: the release build, on Windows. A dev
  shell draws nothing, because an unpackaged run would register the bare `electron.exe` from
  `node_modules`, and a `--dev` instance of an installed build would register a release launch under
  a dev-suffixed name — entries the user could not get rid of from the app. A browser signed into
  the same desktop-mode server draws nothing either, the rule the tray and the pet rows already use.
- The sign-in launch keeps the main window built and loaded but never shown, and only when a tray
  icon exists: a hidden app with no icon would be a window nothing can bring back. Closing the
  window, the tray menu, a second launch and the Dock all reach it through `showMainWindow`.
- `GET`/`PUT /api/desktop/login-item` (desktop-shell sessions only) read and write the switch over the
  same utilityProcess relay the tray icon uses: the status is what the shell last read from Windows,
  the patch is validated (`openAtLogin` must be a boolean; an empty patch is refused) and a PUT
  answers 503 when no shell is listening.
- `packages/desktop/build/installer.nsh` (new, hooked up by `nsis.include`) deletes both halves of the
  entry when the app is uninstalled — the startup value and Windows' record of whether it was
  enabled — so no dead row is left pointing at an executable that is gone.

## Tests

- `packages/desktop/test/login-item.test.ts` (new, 9 cases): the platform/profile support rule, the
  argument and its near misses, the write shape, the status mapping (a Task Manager disabled entry
  reads off, an unsupported shell reports `supported: false`), the command parser, and the
  uninstaller's literal matching the release identity's name.
- `packages/server/test/desktop-login-item.test.ts` (new, 8 cases): GET serving null before the
  shell's first push and the pushed status after it; 403 for a password session and 404 outside
  desktop mode; a PUT forwarded to the shell and answered 202; a non-boolean or empty field refused
  with 400 and never relayed; 503 with no shell wired; and only frames carrying both fields read as
  status pushes.
- Existing suites, unchanged: `desktop` 314 cases, `server` 3029, `web` 3374; `tsc` for the three
  packages; `oxlint` over the tree; `prettier --check .`.
- The Windows installer was built here under wine to prove the new NSIS include compiles into the
  uninstaller. The behaviour on a real machine — the entry appearing in Task Manager › Startup apps
  as enabled, a sign-out and sign-in starting the app into the tray with no window, the switch
  removing it, and an uninstall leaving nothing behind — needs a Windows machine.
