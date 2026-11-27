import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  capabilityInfo,
  defaultPermissions,
  isCapability,
  isWriteCapability,
  normalizePermissions,
} from "../src/index.js";

describe("capabilities", () => {
  it("opens reads of identity and apps, and nothing else, on first sight", () => {
    const permissions = defaultPermissions();
    expect(permissions["info:read"]).toBe(true);
    expect(permissions["apps:read"]).toBe(true);
    for (const capability of CAPABILITIES) {
      if (capability === "info:read" || capability === "apps:read") continue;
      expect(permissions[capability]).toBe(false);
    }
  });

  it("marks exactly the mutating capabilities as writes", () => {
    const writes = CAPABILITIES.filter(isWriteCapability);
    expect(writes.sort()).toEqual(
      ["apps:write", "files:write", "input:control", "shell:exec", "clipboard:write"].sort(),
    );
  });

  it("rates shell, install and input as high risk", () => {
    expect(capabilityInfo("shell:exec").risk).toBe("high");
    expect(capabilityInfo("apps:write").risk).toBe("high");
    expect(capabilityInfo("info:read").risk).toBe("low");
  });
});

describe("stored permissions", () => {
  it("fills in what a record leaves out", () => {
    const permissions = normalizePermissions({ "screen:view": true });
    expect(permissions["screen:view"]).toBe(true);
    expect(permissions["shell:exec"]).toBe(false);
    expect(permissions["info:read"]).toBe(true);
  });

  it("ignores unknown keys and non-boolean values instead of widening a grant", () => {
    const permissions = normalizePermissions({ "shell:exec": "yes", "root:all": true });
    expect(permissions["shell:exec"]).toBe(false);
    expect(Object.keys(permissions).sort()).toEqual([...CAPABILITIES].sort());
    expect(isCapability("root:all")).toBe(false);
  });

  it("treats junk as the defaults", () => {
    expect(normalizePermissions(null)).toEqual(defaultPermissions());
    expect(normalizePermissions("all")).toEqual(defaultPermissions());
  });
});
