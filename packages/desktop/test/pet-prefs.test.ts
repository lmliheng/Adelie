/**
 * The desktop pet's preference: the switch and the size in userData/pet.json, and the two frames
 * that carry them between the shell and the page.
 *
 * Every ill-formed shape reads as the default: a file it cannot make sense of must never be the
 * reason a window appears over everything the user is doing.
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
import type { PetPrefs } from "../src/pet-prefs.js";

describe("readPetPrefs", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "penguin-pet-prefs-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("defaults to no pet, at the size it shipped, when there is no file", () => {
    expect(DEFAULT_PET_PREFS).toEqual({ showPet: false, size: "medium" });
    expect(readPetPrefs(dir)).toEqual({ showPet: false, size: "medium" });
  });

  it("defaults when the directory itself does not exist", () => {
    expect(readPetPrefs(path.join(dir, "never-created"))).toEqual({
      showPet: false,
      size: "medium",
    });
  });

  it("defaults on anything ill-typed rather than trusting it", () => {
    const off = { showPet: false, size: "medium" } satisfies PetPrefs;
    const cases: Array<[unknown, PetPrefs]> = [
      [null, off],
      ["on", off],
      [42, off],
      [[], off],
      [{}, off],
      [{ showPet: "true" }, off],
      [{ showPet: 1 }, off],
      // Each field falls back on its own: a size this build does not know is not a reason to
      // distrust the switch beside it, and a bad switch leaves the size that is there.
      [
        { showPet: true, size: "big" },
        { showPet: true, size: "medium" },
      ],
      [
        { showPet: "yes", size: "large" },
        { showPet: false, size: "large" },
      ],
      // A stray field is not a reason to distrust the ones this build reads.
      [
        { showPet: true, size: "small", figure: "penguin" },
        { showPet: true, size: "small" },
      ],
    ];
    for (const [value, expected] of cases) {
      fs.writeFileSync(path.join(dir, PET_PREFS_FILE), JSON.stringify(value));
      expect(readPetPrefs(dir), JSON.stringify(value)).toEqual(expected);
    }
  });

  it("defaults on a file that is not JSON at all", () => {
    fs.writeFileSync(path.join(dir, PET_PREFS_FILE), "{ not json");
    expect(readPetPrefs(dir)).toEqual({ showPet: false, size: "medium" });
  });

  it("reads what was written", () => {
    writePetPrefs(dir, { showPet: true, size: "large" });
    expect(readPetPrefs(dir)).toEqual({ showPet: true, size: "large" });
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
    expect(first).toEqual({ showPet: true, size: "medium" });
    // The read-modify-write still has to go through the file: that is what makes two writers safe.
    // An ill-typed size on disk falls back on its own, leaving the switch this build does read.
    fs.writeFileSync(
      petPrefsPath(dir),
      `${JSON.stringify({ showPet: true, size: 200 }, null, 2)}\n`,
    );
    expect(updatePetPrefs(dir, {})).toEqual({ showPet: true, size: "medium" });
    expect(JSON.parse(fs.readFileSync(petPrefsPath(dir), "utf8"))).toEqual({
      showPet: true,
      size: "medium",
    });
  });

  it("patches the size alone, keeping the switch", () => {
    updatePetPrefs(dir, { showPet: true });
    expect(updatePetPrefs(dir, { size: "large" })).toEqual({ showPet: true, size: "large" });
    expect(readPetPrefs(dir)).toEqual({ showPet: true, size: "large" });
  });

  it("creates the userData directory when it does not exist yet", () => {
    const nested = path.join(dir, "a", "b");
    writePetPrefs(nested, { showPet: true, size: "small" });
    expect(fs.existsSync(petPrefsPath(nested))).toBe(true);
  });
});

describe("the pet frame on the port", () => {
  it("wraps the state for the push", () => {
    expect(petStatusMessage(true, false, "medium")).toEqual({
      type: "desktop-pet-status",
      status: { showPet: true, call: false, size: "medium" },
    });
    expect(petStatusMessage(true, true, "large")).toEqual({
      type: "desktop-pet-status",
      status: { showPet: true, call: true, size: "large" },
    });
  });

  it("parses only well-formed pet commands", () => {
    expect(parsePetCommand({ type: "desktop-pet-command", showPet: false })).toEqual({
      showPet: false,
    });
    // The call flag is transient — the page reports it, the shell never persists it — but it rides
    // the same frame as the switch and the size.
    expect(parsePetCommand({ type: "desktop-pet-command", call: true })).toEqual({ call: true });
    expect(parsePetCommand({ type: "desktop-pet-command", size: "large" })).toEqual({
      size: "large",
    });
    expect(
      parsePetCommand({ type: "desktop-pet-command", showPet: true, call: true, size: "small" }),
    ).toEqual({ showPet: true, call: true, size: "small" });
    // A frame of this build's own kind that carries nothing is an empty patch, not a non-frame:
    // the caller needs to tell those apart.
    expect(parsePetCommand({ type: "desktop-pet-command" })).toEqual({});
    expect(parsePetCommand({ type: "desktop-pet-command", showPet: "yes" })).toEqual({});
    expect(parsePetCommand({ type: "desktop-pet-command", call: "yes" })).toEqual({});
    // A size this build does not know is dropped, not read.
    expect(parsePetCommand({ type: "desktop-pet-command", size: "big" })).toEqual({});
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
