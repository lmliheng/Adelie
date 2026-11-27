# `@adelie/device-adb`

The Android leg of Adelie's device bridge (design: `adelie-device-bridge-design.md`, P0).
A standalone process that finds an `adb`, polls USB (and wirelessly paired) phones, collects a
layered snapshot, executes the command set in `@adelie/device`, and speaks that protocol over a
local pipe to the Adelie server.

```
adelie-device-bridge --data-root ~/.adelie/data
```

## What it does

- **Finds one adb, in order**: `--adb` / `ADELIE_ADB_PATH` → `PATH` → Android Studio's
  `platform-tools` → scrcpy's folder → the `--bundled-adb` the desktop app ships. It talks to
  the user's own adb server when one is running (5037) and only starts one when `adb devices`
  says it cannot connect.
- **Polls** `adb devices -l` every 5 s (all of them, so last-seen stays honest) and reports the
  list; an unplugged phone turns `offline`, an unapproved one is `unauthorized`.
- **Collects** identity once (`getprop` + `su` + kernel + cpuinfo) and readings every 15 s
  (battery, memory, storage, screen, network, foreground), as `snapshot` frames the host merges.
- **Executes** the command ops: screenshot, files list/pull/push, apps list/install/uninstall,
  shell, tap/swipe/text/key, notifications, snapshot refresh, and the Android 11 wireless
  pairing QR (`pair.wifi.start`).
- **Enforces permissions twice**: the server refuses first; the bridge refuses again from the
  `permissions` frames it is sent, because a revoke can race a command.

## Endpoints

The server listens on a Unix socket at `<data root>/run/device-bridge.sock` or a Windows named
pipe `\\.\pipe\adelie-device-<install id>`. `--socket` overrides it; the desktop app passes the
pipe name directly. The bridge never opens a port.

## Honest limits (P0)

- **One command carries at most 6 MB** of bytes (screenshots, pulled photos, pushed files),
  because the local pipe has no file channel yet — the protocol's frame cap is 12 MiB of JSON.
  Above it the command fails with a sentence, not a dropped connection.
- **`input text` is ASCII only** (adb's own limit). Non-ASCII is refused with a pointer to
  ADBKeyboard rather than typed as question marks.
- **Clipboard** is not offered: `cmd clipboard` is not reliable across versions, so the bridge
  does not claim the capability.
- **Wi-Fi devices get their own record**: the id comes from the adb serial, and a phone reached
  over TCP has `host:port` instead of its USB serial. The companion app (P2) is what will make
  one phone one record across transports.
- Windows specifics (named pipe, `adb.exe`, USB drivers, the bundled platform-tools) are not
  verified on this machine — see the design's §11.

## Tests

```
pnpm typecheck
pnpm test
```

The tests use a scripted adb (and one real shell script standing in for `adb`) plus a real Unix
socket host for the bridge: no phone, no Windows, no network.
