/**
 * The desktop pet's preference: the one boolean in userData/pet.json, and the two frames that
 * carry the Appearance switch between the shell and the page.
 *
 * Every ill-formed shape reads as OFF, the shell's own default: a file it cannot make sense of
 * must never be the reason a window appears over everything the user is doing.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PET_PREFS,
  PET_PREFS_FILE,
  parsePetCommand,
  petPrefsPath,
  petStatusMessage,
  readPetPrefs,
  updatePetPrefs,
  writePetPrefs,
} from "../src/pet-prefs.js";

describe("readPetPrefs", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "penguin-pet-prefs-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("defaults to no pet when there is no file", () => {
    expect(DEFAULT_PET_PREFS).toEqual({ showPet: false });
    expect(readPetPrefs(dir)).toEqual({ showPet: false });
  });

  it("defaults when the directory itself does not exist", () => {
    expect(readPetPrefs(path.join(dir, "never-created"))).toEqual({ showPet: false });
  });

  it("defaults on anything ill-typed rather than trusting it", () => {
    const cases: Array<[unknown, { showPet: boolean }]> = [
      [null, { showPet: false }],
      ["on", { showPet: false }],
      [42, { showPet: false }],
      [[], { showPet: false }],
      [{}, { showPet: false }],
      [{ showPet: "true" }, { showPet: false }],
      [{ showPet: 1 }, { showPet: false }],
      // A stray field is not a reason to distrust the one this build reads.
      [{ showPet: true, size: "big" }, { showPet: true }],
    ];
    for (const [value, expected] of cases) {
      fs.writeFileSync(path.join(dir, PET_PREFS_FILE), JSON.stringify(value));
      expect(readPetPrefs(dir), JSON.stringify(value)).toEqual(expected);
    }
  });

  it("defaults on a file that is not JSON at all", () => {
    fs.writeFileSync(path.join(dir, PET_PREFS_FILE), "{ not json");
    expect(readPetPrefs(dir)).toEqual({ showPet: false });
  });

  it("reads what was written", () => {
    writePetPrefs(dir, { showPet: true });
    expect(readPetPrefs(dir)).toEqual({ showPet: true });
    expect(petPrefsPath(dir)).toBe(path.join(dir, PET_PREFS_FILE));
  });
});

describe("updatePetPrefs", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "penguin-pet-prefs-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("patches one field without losing the others, and writes the file it reads", () => {
    const first = updatePetPrefs(dir, { showPet: true });
    expect(first).toEqual({ showPet: true });
    // The old value is irrelevant to the type today, and the read-modify-write still has to go
    // through the file: that is what makes two writers safe.
    fs.writeFileSync(
      petPrefsPath(dir),
      `${JSON.stringify({ showPet: true, size: 200 }, null, 2)}\n`,
    );
    expect(updatePetPrefs(dir, {})).toEqual({ showPet: true });
    expect(JSON.parse(fs.readFileSync(petPrefsPath(dir), "utf8"))).toEqual({ showPet: true });
  });

  it("creates the userData directory when it does not exist yet", () => {
    const nested = path.join(dir, "a", "b");
    writePetPrefs(nested, { showPet: true });
    expect(fs.existsSync(petPrefsPath(nested))).toBe(true);
  });
});

describe("the pet frame on the port", () => {
  it("wraps the state for the push", () => {
    expect(petStatusMessage(true)).toEqual({
      type: "desktop-pet-status",
      status: { showPet: true },
    });
  });

  it("parses only well-formed pet commands", () => {
    expect(parsePetCommand({ type: "desktop-pet-command", showPet: false })).toEqual({
      showPet: false,
    });
    // A frame of this build's own kind that carries nothing is an empty patch, not a non-frame:
    // the caller needs to tell those apart.
    expect(parsePetCommand({ type: "desktop-pet-command" })).toEqual({});
    expect(parsePetCommand({ type: "desktop-pet-command", showPet: "yes" })).toEqual({});
    for (const data of [
      null,
      "pet",
      {},
      { type: "desktop-tray-command", showTrayIcon: true },
      { type: "desktop-updater-command", action: "check" },
    ]) {
      expect(parsePetCommand(data)).toBeNull();
    }
  });
});
