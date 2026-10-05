/**
 * The boundary-variable table (core/src/state/boundary-env.ts) and its reader.
 *
 * These names have two spellings because their *writers* are outside this repository — the
 * desktop shell's launch environment, an existing deployment's unit file, an older installer's
 * launcher script. The tests here pin the two properties such a table can silently lose: that a
 * pair really is one name in two spellings, and that the new spelling wins while the old one
 * keeps being read.
 */
import { describe, expect, it } from "vitest";
import { BOUNDARY_ENV, boundaryEnv } from "../src/state/boundary-env.js";

describe("BOUNDARY_ENV", () => {
  it("names exactly the deployment variables whose writer is outside this repository", () => {
    // A literal list, not a count: a name added here is a decision (whose writer is it? can it
    // move in the same release?), and a name *removed* here breaks the installs it named.
    expect(Object.keys(BOUNDARY_ENV).sort()).toEqual([
      "bundledShell",
      "cliEntry",
      "desktopToken",
      "portFile",
      "profile",
      "webDb",
      "webDist",
    ]);
  });

  it("pairs one Adelie name with one pre-rename name, and nothing else", () => {
    const values = Object.values(BOUNDARY_ENV);
    const names = values.map((entry) => entry.name);
    const legacies = values.map((entry) => entry.legacy);
    expect(new Set([...names, ...legacies]).size).toBe(names.length + legacies.length);
    for (const { name, legacy } of values) {
      expect(name).toMatch(/^ADELIE_[A-Z0-9_]+$/);
      // The legacy spelling is the same setting, not a second knob: same suffix, old prefix.
      expect(legacy).toBe(`PENGUIN_${name.slice("ADELIE_".length)}`);
    }
  });
});

describe("boundaryEnv", () => {
  it("reads Adelie's own spelling", () => {
    expect(boundaryEnv({ ADELIE_WEB_DB: "/srv/adelie/web.db" }, "webDb")).toBe(
      "/srv/adelie/web.db",
    );
  });

  it("still reads the pre-rename spelling, so an existing deployment keeps working", () => {
    // The one thing this must not do is stop reading it: a PENGUIN_WEB_DB that is no longer
    // honored points the server at an empty `<root>/web.db` instead of the operator's file.
    expect(boundaryEnv({ PENGUIN_WEB_DB: "/opt/penguin/data/web.db" }, "webDb")).toBe(
      "/opt/penguin/data/web.db",
    );
  });

  it("prefers the new spelling when both are set", () => {
    expect(boundaryEnv({ ADELIE_WEB_DB: "/new.db", PENGUIN_WEB_DB: "/old.db" }, "webDb")).toBe(
      "/new.db",
    );
  });

  it("is undefined when neither is set, so the caller's own default takes over", () => {
    expect(boundaryEnv({}, "webDb")).toBeUndefined();
    expect(boundaryEnv({ PORT: "7364" }, "webDb")).toBeUndefined();
  });

  it("treats a set-but-empty new name as set — the rule the data root already follows", () => {
    // Consumers that care (the CLI entry, the port file) trim and treat blank as unset
    // themselves; the reader does not quietly fall back to the old name, which would make the
    // empty value mean the opposite of what it says.
    expect(boundaryEnv({ ADELIE_WEB_DB: "", PENGUIN_WEB_DB: "/old.db" }, "webDb")).toBe("");
  });

  it("reads every entry of the table, new spelling and old", () => {
    for (const [key, { name, legacy }] of Object.entries(BOUNDARY_ENV)) {
      expect(boundaryEnv({ [name]: `${key}-new` }, key as keyof typeof BOUNDARY_ENV)).toBe(
        `${key}-new`,
      );
      expect(boundaryEnv({ [legacy]: `${key}-old` }, key as keyof typeof BOUNDARY_ENV)).toBe(
        `${key}-old`,
      );
    }
  });
});
