/**
 * `@adelie/device-adb` — the Android leg of the device bridge: adb discovery, the `adb`
 * conversation, the layered collectors, the command implementations and `AdbBridge` (the
 * process that speaks `@adelie/device` over a local pipe). The standalone entry point is
 * `src/main.ts` (`adelie-device-bridge`), the desktop app's utilityProcess target.
 */
export * from "./adb-client.js";
export * from "./adb-discovery.js";
export * from "./bridge.js";
export * from "./collect.js";
export * from "./commands.js";
export * from "./pairing.js";
export * from "./parse.js";
