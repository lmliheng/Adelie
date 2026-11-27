import { describe, expect, it } from "vitest";
import { AdbClient } from "../src/adb-client.js";
import { findConnectAddress, findPairingAddress, startWifiPairing } from "../src/pairing.js";

const SERVICES = [
  { name: "adb-R58M12ABC-abc", type: "_adb-tls-connect._tcp", address: "192.168.1.23:5555" },
  { name: "adb-0f1e2d3c", type: "_adb-tls-pairing._tcp", address: "192.168.1.23:37201" },
  { name: "adb-other", type: "_adb-tls-pairing._tcp", address: "192.168.1.23:37202" },
];

describe("mdns matching", () => {
  it("finds the pairing service by the name it advertised", () => {
    expect(findPairingAddress(SERVICES, "adb-0f1e2d3c")).toBe("192.168.1.23:37201");
    expect(findPairingAddress(SERVICES, "adb-0f1e2d3c.suffix")).toBe("192.168.1.23:37201");
  });

  it("falls back to the only pairing service and ignores non-pairing rows", () => {
    expect(findPairingAddress([SERVICES[1]!], "adb-nope")).toBe("192.168.1.23:37201");
    expect(findPairingAddress([SERVICES[0]!], "adb-nope")).toBeNull();
  });

  it("finds the debug bridge address", () => {
    expect(findConnectAddress(SERVICES)).toBe("192.168.1.23:5555");
    expect(findConnectAddress([])).toBeNull();
  });
});

describe("startWifiPairing", () => {
  it("draws the QR, pairs when the phone shows up, then connects", async () => {
    const calls: string[] = [];
    let mdnsCalls = 0;
    const client = new AdbClient("adb", async (_file, args) => {
      calls.push(args.join(" "));
      if (args[0] === "mdns") {
        mdnsCalls += 1;
        // Nothing before pairing; the pairing row next, the connect row after.
        if (mdnsCalls <= 2) return { code: 0, stdout: "", stderr: "" };
        const rows =
          mdnsCalls === 3
            ? "adb-0f1e2d3c\t_adb-tls-pairing._tcp\t192.168.1.23:37201\n"
            : "adb-R58M12ABC\t_adb-tls-connect._tcp\t192.168.1.23:5555\n";
        return { code: 0, stdout: `List of discovered mdns services\n${rows}`, stderr: "" };
      }
      if (args[0] === "pair")
        return {
          code: 0,
          stdout: `Successfully paired to ${args[1]} [guid=adb-R58M12ABC]\n`,
          stderr: "",
        };
      if (args[0] === "connect")
        return { code: 0, stdout: `connected to ${args[1]}\n`, stderr: "" };
      return { code: 1, stdout: "", stderr: "unexpected" };
    });

    const logs: string[] = [];
    const { pairing, done } = startWifiPairing(client, {
      log: (_level, line) => logs.push(line),
      intervalMs: 1,
      timeoutMs: 5_000,
      randomCode: () => "123456",
      serviceNonce: () => "0f1e2d3c",
    });

    expect(pairing.qr).toBe("WIFI:T:ADB;S:adb-0f1e2d3c;P:123456;;");
    expect(pairing).toMatchObject({ serviceName: "adb-0f1e2d3c", code: "123456" });
    expect(Date.parse(pairing.expiresAt)).toBeGreaterThan(Date.now());

    const outcome = await done;
    expect(outcome.paired).toBe(true);
    expect(outcome.address).toBe("192.168.1.23:5555");
    expect(calls).toContain("pair 192.168.1.23:37201 123456");
    expect(calls).toContain("connect 192.168.1.23:5555");
    expect(logs.join("\n")).toMatch(/paired with 192\.168\.1\.23:37201/);
  });

  it("gives up when the QR is never scanned", async () => {
    const client = new AdbClient("adb", async () => ({ code: 0, stdout: "", stderr: "" }));
    const logs: string[] = [];
    const { done } = startWifiPairing(client, {
      log: (_level, line) => logs.push(line),
      intervalMs: 1,
      timeoutMs: 30,
    });
    const outcome = await done;
    expect(outcome.paired).toBe(false);
    expect(logs.join("\n")).toMatch(/expired/);
  });

  it("reports a wrong code once instead of retrying it", async () => {
    let mdnsCalls = 0;
    const client = new AdbClient("adb", async (_file, args) => {
      if (args[0] === "mdns") {
        mdnsCalls += 1;
        return {
          code: 0,
          stdout: mdnsCalls === 1 ? "" : "adb-p\t_adb-tls-pairing._tcp\t192.168.1.23:37201\n",
          stderr: "",
        };
      }
      if (args[0] === "pair")
        return {
          code: 1,
          stdout: "Failed: Wrong password or connection was dropped.\n",
          stderr: "",
        };
      return { code: 1, stdout: "", stderr: "unexpected" };
    });
    const logs: string[] = [];
    const { done } = startWifiPairing(client, {
      log: (_level, line) => logs.push(line),
      intervalMs: 1,
      timeoutMs: 2_000,
    });
    const outcome = await done;
    expect(outcome.paired).toBe(false);
    expect(outcome.message).toMatch(/Wrong password/);
    expect(logs.join("\n")).toMatch(/pairing with 192\.168\.1\.23:37201 failed/);
  });
});
