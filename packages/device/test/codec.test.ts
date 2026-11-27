import { describe, expect, it } from "vitest";
import {
  DEVICE_PROTOCOL_VERSION,
  DeviceProtocolError,
  FrameReader,
  defaultPermissions,
  encodeFrame,
  decodeFrame,
  parseFrame,
  type BridgeDescriptor,
  type AnyFrame,
  type BridgeFrame,
  type HostFrame,
} from "../src/index.js";

const bridge: BridgeDescriptor = {
  id: "bridge-1",
  name: "This computer",
  kind: "desktop",
  version: "0.8.7",
  protocol: DEVICE_PROTOCOL_VERSION,
  capabilities: ["info:read", "apps:read", "screen:view"],
  adapter: { id: "dev.adelie.adb", version: "0.8.7" },
};

describe("the frame codec", () => {
  it("round-trips every bridge frame", () => {
    const frames: BridgeFrame[] = [
      { t: "hello", bridge },
      {
        t: "devices",
        devices: [
          {
            id: "android:pixel-8",
            kind: "android",
            name: "Pixel 8",
            serial: "39081FDH2000AB",
            transport: "usb",
            platform: "Android 15",
            state: "online",
            capabilities: ["info:read", "apps:read"],
          },
        ],
      },
      { t: "pong" },
      { t: "log", level: "warn", line: "adb server restarted" },
      {
        t: "result",
        result: { id: "c1", ok: false, error: { code: "device_offline", message: "gone" } },
      },
    ];
    for (const frame of frames) {
      expect(decodeFrame(encodeFrame(frame).trimEnd())).toEqual(frame);
    }
  });

  it("round-trips every host frame", () => {
    const frames: HostFrame[] = [
      { t: "hello_ok", bridgeId: "bridge-1" },
      { t: "ping" },
      {
        t: "command",
        command: { id: "c1", deviceId: "android:pixel-8", op: "shell.exec", args: { cmd: "id" } },
      },
      {
        t: "permissions",
        deviceId: "android:pixel-8",
        permissions: { ...defaultPermissions(), "apps:read": false },
      },
    ];
    for (const frame of frames) {
      expect(decodeFrame(encodeFrame(frame).trimEnd())).toEqual(frame);
    }
  });

  it("refuses an unknown frame type instead of ignoring it", () => {
    expect(() => decodeFrame(JSON.stringify({ t: "surprise" }))).toThrow(DeviceProtocolError);
  });

  it("refuses a line that is not JSON", () => {
    expect(() => decodeFrame("{oops")).toThrow(/one line of JSON/);
  });

  it("refuses a device with an unknown transport or state", () => {
    const frame = {
      t: "device",
      device: {
        id: "d",
        kind: "android",
        name: "D",
        serial: null,
        transport: "lightning",
        platform: null,
        state: "online",
        capabilities: [],
      },
    };
    expect(() => parseFrame(frame)).toThrow(/transport/);
  });

  it("keeps only capabilities it knows, and refuses a snapshot with an unknown layer", () => {
    const device = parseFrame({
      t: "device",
      device: {
        id: "d",
        kind: "android",
        name: "D",
        serial: null,
        transport: "usb",
        platform: null,
        state: "online",
        capabilities: ["info:read", "teleport"],
      },
    });
    expect(device).toMatchObject({ device: { capabilities: ["info:read"] } });
    expect(() =>
      parseFrame({
        t: "snapshot",
        deviceId: "d",
        snapshot: { something: { at: new Date().toISOString(), data: {} } },
      }),
    ).toThrow(/wrong shape/);
  });

  it("refuses a permissions frame that names a non-capability", () => {
    expect(() =>
      parseFrame({ t: "permissions", deviceId: "d", permissions: { "root:all": true } }),
    ).toThrow(/not a capability/);
  });
});

describe("the stream reader", () => {
  it("splits frames across arbitrary chunk boundaries", () => {
    const a = encodeFrame({ t: "ping" });
    const b = encodeFrame({ t: "pong" });
    const reader = new FrameReader();
    const frames = [
      ...reader.push(a.slice(0, 5)),
      ...reader.push(a.slice(5) + b.slice(0, 3)),
      ...reader.push(b.slice(3)),
    ];
    expect(frames.map((f) => f.t)).toEqual(["ping", "pong"]);
    expect(reader.pending()).toBe("");
  });

  it("decodes a chunk delivered as bytes", () => {
    const reader = new FrameReader();
    const bytes = new TextEncoder().encode(encodeFrame({ t: "pong" }));
    expect(reader.push(bytes)).toEqual([{ t: "pong" }]);
  });

  it("ignores blank lines and tolerates CRLF", () => {
    const reader = new FrameReader();
    expect(reader.push("\r\n\n" + encodeFrame({ t: "ping" }).replace("\n", "\r\n"))).toEqual([
      { t: "ping" },
    ]);
  });

  it("refuses a line larger than the limit instead of buffering it forever", () => {
    const reader = new FrameReader(64);
    expect(() => reader.push("x".repeat(200))).toThrow(/larger than the protocol allows/);
    expect(reader.pending()).toBe("");
  });
});
