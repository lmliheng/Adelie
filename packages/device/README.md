# @adelie/device

The protocol between a device **bridge** (a process that owns phones) and the **host** (the
server's device service), and the model both sides share. No runtime dependency; Node 24 and
browsers.

A phone reaches Adelie through a bridge: the desktop app's embedded one, `penguin
device-bridge` on a machine someone plugs into, or a phone-side companion. The bridge talks to
the host over a local channel — the Windows named pipe `\\.\pipe\adelie-device-<instance>`, or
a Unix socket under the data root — with one JSON frame per line.

What lives here:

| File | Content |
|---|---|
| `protocol.ts` | Frame types, the command table (`COMMAND_SPECS`), error codes, protocol version |
| `codec.ts` | `encodeFrame` / `decodeFrame` / `FrameReader`, and the validation on the way in |
| `types.ts` | `DeviceInfo`, the layered `DeviceSnapshot`, events |
| `snapshot.ts` | `mergeSnapshot`: newest layer wins, untouched groups survive |
| `capabilities.ts` | The capability table and the permission defaults (reads on, writes off) |
| `manifest.ts` | The `.adev` adapter package manifest and its validation |

What is not here: any transport, timer or adb. Those belong to whoever runs the bridge —
`@adelie/device-adb` is the ADB one.
