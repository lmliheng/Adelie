/**
 * Device ids are minted by a bridge and then become part of a URL path, a data-root file name
 * and a SQL key. The rule that keeps all three safe is one: `[A-Za-z0-9_-]`, like every id in
 * this codebase (the server refuses anything else with a 404). A serial number is the natural
 * source — it survives a reconnect, which is what makes a phone rejoin its record — but a
 * serial can carry punctuation (`R58M12ABC:x`), so it is folded rather than trusted.
 */
import type { DeviceKind } from "./types.js";

/** Folds anything into the id alphabet; never returns an empty string. */
export function sanitizeDeviceId(raw: string): string {
  const folded = raw
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return folded === "" ? "device" : folded;
}

/**
 * `<kind>-<serial>` when there is a serial, `<kind>-<fallback>` otherwise. The transport is
 * deliberately not part of it: the same phone moves between USB and Wi-Fi and must stay one
 * record.
 */
export function deviceIdFor(kind: DeviceKind, serial: string | null, fallback: string): string {
  const tail = serial !== null && serial.trim() !== "" ? serial : fallback;
  return sanitizeDeviceId(`${kind}-${tail}`);
}
