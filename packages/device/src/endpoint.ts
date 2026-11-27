/**
 * Where the host listens for local bridges. One rule for every writer and reader of it (the
 * server that listens, the desktop app that spawns a bridge, `penguin device-bridge` run by
 * hand): Windows named pipes carry the data root's install id so two data roots on one
 * machine never collide; everywhere else it is a socket under the root, next to the other
 * runtime files, which the directory's own permissions already keep private.
 *
 * `platform` is passed in rather than read from `process`: this package runs in browsers too.
 */
export function bridgeEndpoint(root: string, installId: string | null, platform: string): string {
  if (platform === "win32") return `\\\\.\\pipe\\adelie-device-${installId ?? "default"}`;
  return `${root.replace(/[\\/]+$/, "")}/run/device-bridge.sock`;
}
