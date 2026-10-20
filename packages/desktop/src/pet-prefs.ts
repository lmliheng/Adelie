/**
 * The desktop pet's preference — on disk, and on the wire. Pure path, file and frame logic, no
 * Electron imports (unit-tested).
 *
 * One boolean lives in `userData/pet.json`:
 *
 * - `showPet` — whether the shell keeps its small companion window on screen. It is the Web
 *   App's Settings › Appearance switch, relayed to the shell over the utilityProcess message
 *   channel the client updater and the tray icon already use (see main.ts and the server's
 *   services/desktop-update-port.ts). The pet window's own "hide me" row writes the same field
 *   through the same route, so the two ways of turning it off cannot disagree.
 *
 * Unlike the tray's two booleans, this one defaults to OFF: the tray icon is chrome inside a
 * window the user already opened, while the pet is a window of its own that floats over
 * everything else. It appears when it is asked for and not before.
 *
 * The preference is a convenience, never a reason for the shell to fail to start — a missing or
 * malformed file reads as the default, and a failed write is the caller's line in the log.
 */
import fs from "node:fs";
import path from "node:path";
import type { DesktopPetCommandMessage, DesktopPetStatusMessage } from "@adelie/server/api";

/** Preference file name, inside the app's userData directory. */
export const PET_PREFS_FILE = "pet.json";

export interface PetPrefs {
  /** The pet window is on screen for as long as the app runs and the preference stays on. */
  showPet: boolean;
}

export const DEFAULT_PET_PREFS: PetPrefs = {
  showPet: false,
};

/** Location of the preference file for a userData directory. */
export function petPrefsPath(userDataDir: string): string {
  return path.join(userDataDir, PET_PREFS_FILE);
}

/** Reads the preference; anything unreadable, unparsable or ill-typed reads as the default. */
export function readPetPrefs(userDataDir: string): PetPrefs {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(petPrefsPath(userDataDir), "utf8"));
  } catch {
    return { ...DEFAULT_PET_PREFS };
  }
  if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_PET_PREFS };
  const value = (parsed as Partial<Record<keyof PetPrefs, unknown>>).showPet;
  return { showPet: typeof value === "boolean" ? value : DEFAULT_PET_PREFS.showPet };
}

/** Writes the preference. Throws on failure: the caller decides how to report it. */
export function writePetPrefs(userDataDir: string, prefs: PetPrefs): void {
  fs.mkdirSync(userDataDir, { recursive: true });
  const file = petPrefsPath(userDataDir);
  // Write-then-rename: a crash mid-write leaves the previous file, not a truncated one that
  // would read as the default and silently forget the preference.
  const staging = `${file}.tmp`;
  fs.writeFileSync(staging, `${JSON.stringify(prefs, null, 2)}\n`);
  fs.renameSync(staging, file);
}

/**
 * Read-modify-write of one field. Both writers (the Appearance switch and the pet's own row)
 * go through this, so neither can clobber the other's value with a snapshot it read before the
 * other wrote.
 */
export function updatePetPrefs(userDataDir: string, patch: Partial<PetPrefs>): PetPrefs {
  const next = { ...readPetPrefs(userDataDir), ...patch };
  writePetPrefs(userDataDir, next);
  return next;
}

// --- the wire, to and from the Web App's Appearance settings -----------------

/** Wraps what the pet window is currently doing for the port push. */
export function petStatusMessage(showPet: boolean): DesktopPetStatusMessage {
  return { type: "desktop-pet-status", status: { showPet } };
}

/**
 * Validates one server-relayed pet command off the port. Null when the frame is not one, and an
 * empty patch when it is one carrying nothing this build understands — a distinction the caller
 * needs, because a frame it cannot read is not a frame it should treat as a pet push.
 */
export function parsePetCommand(data: unknown): PetCommand | null {
  if (typeof data !== "object" || data === null) return null;
  const msg = data as Partial<DesktopPetCommandMessage>;
  if (msg.type !== "desktop-pet-command") return null;
  const patch: PetCommand = {};
  if (typeof msg.showPet === "boolean") patch.showPet = msg.showPet;
  return patch;
}

/** What one relayed command asks the shell to change; every field optional, as the route's patch is. */
export interface PetCommand {
  showPet?: boolean;
}
