import { describe, expect, it } from "vitest";
import { deviceIdFor, sanitizeDeviceId } from "../src/index.js";

describe("device ids", () => {
  it("folds punctuation the URL and the file system refuse", () => {
    expect(sanitizeDeviceId("R58M12ABC:x/y")).toBe("R58M12ABC-x-y");
    expect(sanitizeDeviceId("  ..  ")).toBe("device");
  });

  it("names a device by kind and serial, and stays one id across transports", () => {
    expect(deviceIdFor("android", "39081FDH2000AB", "x")).toBe("android-39081FDH2000AB");
    expect(deviceIdFor("android", null, "192.168.1.5:5555")).toBe("android-192-168-1-5-5555");
  });
});
