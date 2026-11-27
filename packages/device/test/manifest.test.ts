import { describe, expect, it } from "vitest";
import { ADAPTER_MANIFEST_SCHEMA, validateManifest } from "../src/index.js";

const good = {
  schema: ADAPTER_MANIFEST_SCHEMA,
  id: "dev.adelie.adb",
  name: "Android (ADB)",
  version: "0.8.7",
  protocol: 1,
  platforms: ["win32-x64", "linux-x64"],
  entry: {
    "win32-x64": "bin/win32/x64/adapter.exe",
    "linux-x64": "bin/linux/x64/adapter",
  },
  capabilities: [
    { id: "info:read", risk: "low" },
    { id: "shell:exec", risk: "high" },
  ],
  permissions: ["usb"],
  checksums: { "bin/linux/x64/adapter": `sha256-${"a".repeat(64)}` },
};

describe("the adapter manifest", () => {
  it("accepts the shipped shape", () => {
    expect(validateManifest(good)).toEqual({ ok: true, problems: [] });
  });

  it("refuses a wrong schema, id, version or protocol", () => {
    for (const patch of [
      { schema: "adelie.device-adapter/2" },
      { id: "Adb" },
      { version: "latest" },
      { protocol: 0 },
    ]) {
      const check = validateManifest({ ...good, ...patch });
      expect(check.ok).toBe(false);
      expect(check.problems.length).toBeGreaterThan(0);
    }
  });

  it("requires an entry path for every declared platform", () => {
    expect(validateManifest({ ...good, entry: { "win32-x64": "a.exe" } }).problems).toContain(
      "entry.linux-x64 must be a relative path inside the package",
    );
  });

  it("refuses a path that climbs out of the package, absolutely or with ..", () => {
    for (const path of ["/etc/passwd", "C:/Windows/x.exe", "bin/../../x.exe"]) {
      const check = validateManifest({
        ...good,
        entry: { "win32-x64": path, "linux-x64": "bin/linux/x64/adapter" },
      });
      expect(check.ok).toBe(false);
    }
  });

  it("reports every problem at once", () => {
    const check = validateManifest({
      schema: "x",
      id: "x",
      name: "",
      version: "1",
      protocol: 1,
      platforms: ["win32-x64"],
      entry: {},
      capabilities: [{ id: "root:all", risk: "low" }],
      permissions: ["camera"],
    });
    expect(check.problems.length).toBeGreaterThanOrEqual(5);
  });
});
