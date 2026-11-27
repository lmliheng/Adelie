import { describe, expect, it } from "vitest";
import { isDeviceSnapshot, mergeSnapshot, snapshotAt, snapshotStale } from "../src/index.js";

const at = (iso: string) => iso;

describe("merging a layered snapshot", () => {
  it("keeps a group the newest dynamic reading did not touch", () => {
    const first = {
      dynamic: {
        at: at("2026-11-27T10:00:00.000Z"),
        data: {
          power: { level: 78, charging: true },
          storage: { totalBytes: 256_000_000_000, availableBytes: 90_000_000_000 },
        },
      },
    };
    const second = {
      dynamic: { at: at("2026-11-27T10:00:15.000Z"), data: { power: { level: 77 } } },
    };
    const merged = mergeSnapshot(first, second);
    expect(merged.dynamic).toEqual({
      at: "2026-11-27T10:00:15.000Z",
      data: {
        power: { level: 77, charging: true },
        storage: { totalBytes: 256_000_000_000, availableBytes: 90_000_000_000 },
      },
    });
  });

  it("replaces a whole list rather than appending to it", () => {
    const merged = mergeSnapshot(
      { apps: { at: at("2026-11-27T10:00:00.000Z"), data: [{ packageName: "a" }] } },
      { apps: { at: at("2026-11-27T10:01:00.000Z"), data: [{ packageName: "b" }] } },
    );
    expect(merged.apps?.data.map((a) => a.packageName)).toEqual(["b"]);
  });

  it("leaves everything else alone when the incoming snapshot is one layer", () => {
    const staticLayer = {
      static: { at: at("2026-11-27T09:00:00.000Z"), data: { model: "Pixel 8" } },
    };
    const merged = mergeSnapshot(staticLayer, {
      dynamic: { at: at("2026-11-27T10:00:00.000Z"), data: { power: { level: 50 } } },
    });
    expect(merged.static?.data.model).toBe("Pixel 8");
  });

  it("does not let an undefined field overwrite a known one", () => {
    const merged = mergeSnapshot(
      {
        static: { at: at("2026-11-27T09:00:00.000Z"), data: { model: "Pixel 8", brand: "Google" } },
      },
      { static: { at: at("2026-11-27T09:05:00.000Z"), data: { model: undefined } } },
    );
    expect(merged.static?.data).toEqual({ model: "Pixel 8", brand: "Google" });
  });
});

describe("snapshot timestamps", () => {
  const snapshot = {
    static: { at: at("2026-11-27T09:00:00.000Z"), data: {} },
    dynamic: { at: at("2026-11-27T10:00:00.000Z"), data: {} },
  };

  it("reports the newest section as the snapshot's age", () => {
    expect(snapshotAt(snapshot)).toBe("2026-11-27T10:00:00.000Z");
    expect(snapshotAt(undefined)).toBeNull();
  });

  it("calls a snapshot stale once its newest reading is older than the budget", () => {
    const now = new Date("2026-11-27T10:00:20.000Z");
    expect(snapshotStale(snapshot, now, 30_000)).toBe(false);
    expect(snapshotStale(snapshot, now, 5_000)).toBe(true);
    expect(snapshotStale(undefined, now, 30_000)).toBe(true);
  });
});

describe("snapshot validation", () => {
  it("accepts the layers it knows", () => {
    expect(
      isDeviceSnapshot({ dynamic: { at: "2026-11-27T10:00:00.000Z", data: { power: {} } } }),
    ).toBe(true);
  });

  it("refuses an unknown layer, a section without a stamp, and a bad stamp", () => {
    expect(isDeviceSnapshot({ screenshot: { at: "2026-11-27T10:00:00.000Z", data: {} } })).toBe(
      false,
    );
    expect(isDeviceSnapshot({ dynamic: { data: {} } })).toBe(false);
    expect(isDeviceSnapshot({ dynamic: { at: "yesterday", data: {} } })).toBe(false);
  });
});
