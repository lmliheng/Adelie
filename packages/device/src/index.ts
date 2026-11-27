/**
 * `@adelie/device` — the protocol shared by the host (server), any bridge (the desktop app's
 * embedded one, `penguin device-bridge`, a phone companion) and every adapter: message types,
 * the JSON-line codec, the snapshot merge rules, the capability table and the `.adev` package
 * manifest. No runtime dependency; Node and browsers both read it.
 */
export * from "./capabilities.js";
export * from "./codec.js";
export * from "./manifest.js";
export * from "./protocol.js";
export * from "./snapshot.js";
export * from "./types.js";
