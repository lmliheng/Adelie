import { describe, expect, it } from "vitest";
import { bridgeEndpoint } from "../src/index.js";

describe("the bridge endpoint", () => {
  it("names a Windows pipe after the data root's install id", () => {
    expect(bridgeEndpoint("C:\\data", "abc-123", "win32")).toBe(
      "\\\\.\\pipe\\adelie-device-abc-123",
    );
    expect(bridgeEndpoint("C:\\data", null, "win32")).toBe("\\\\.\\pipe\\adelie-device-default");
  });

  it("puts a Unix socket under the root, without duplicating a trailing slash", () => {
    expect(bridgeEndpoint("/root/.adelie/data", "x", "linux")).toBe(
      "/root/.adelie/data/run/device-bridge.sock",
    );
    expect(bridgeEndpoint("/root/.adelie/data/", "x", "darwin")).toBe(
      "/root/.adelie/data/run/device-bridge.sock",
    );
  });
});
