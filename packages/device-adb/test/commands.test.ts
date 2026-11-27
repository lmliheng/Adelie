import { describe, expect, it } from "vitest";
import { DeviceProtocolError, type DeviceCommand, type DeviceCommandOp } from "@adelie/device";
import type { AdbRunner } from "../src/adb-discovery.js";
import { AdbClient } from "../src/adb-client.js";
import { executeCommand, MAX_PAYLOAD_BYTES, MAX_SHELL_OUTPUT } from "../src/commands.js";
import { scriptedBinaryRunner, scriptedRunner, TINY_PNG } from "./helpers.js";

const ctx = { refresh: async () => "2026-11-27T00:00:00.000Z" };

function command(op: DeviceCommandOp, args?: Record<string, unknown>): DeviceCommand {
  return { id: `cmd-${op}`, deviceId: "android-R58M12ABC", op, args };
}

async function refusal(promise: Promise<unknown>): Promise<DeviceProtocolError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof DeviceProtocolError) return err;
    throw err;
  }
  throw new Error("expected a refusal");
}

describe("screenshot and files", () => {
  it("returns the PNG inline with its mime type", async () => {
    const client = new AdbClient(
      "adb",
      scriptedRunner({}),
      scriptedBinaryRunner({ "exec-out screencap -p": TINY_PNG }),
    );
    const data = (await executeCommand(client, command("screenshot"), ctx)) as Record<
      string,
      unknown
    >;
    expect(data.mimeType).toBe("image/png");
    expect(data.bytes).toBe(TINY_PNG.byteLength);
    expect(Buffer.from(String(data.base64), "base64")).toEqual(TINY_PNG);
  });

  it("lists a directory with the phone's own ls", async () => {
    const calls: string[] = [];
    const client = new AdbClient(
      "adb",
      scriptedRunner(
        {
          "shell ls -la /sdcard/DCIM":
            "total 4\ndrwxrwx--x 4 root sdcard_rw 4096 2026-11-27 10:11 Camera\n-rw-rw---- 1 u0_a1 media_rw 2048 2026-11-27 10:12 a.jpg\n",
        },
        calls,
      ),
    );
    const data = (await executeCommand(
      client,
      command("files.list", { path: "/sdcard/DCIM" }),
      ctx,
    )) as {
      path: string;
      entries: unknown[];
    };
    expect(data.path).toBe("/sdcard/DCIM");
    expect(data.entries).toHaveLength(2);
    expect(calls).toEqual(["shell ls -la /sdcard/DCIM"]);
  });

  it("pulls bytes through exec-out cat and names the file", async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const client = new AdbClient(
      "adb",
      scriptedRunner({}),
      scriptedBinaryRunner({ "exec-out cat /sdcard/DCIM/a.jpg": bytes }),
    );
    const data = (await executeCommand(
      client,
      command("files.pull", { path: "/sdcard/DCIM/a.jpg" }),
      ctx,
    )) as Record<string, unknown>;
    expect(data).toMatchObject({
      name: "a.jpg",
      path: "/sdcard/DCIM/a.jpg",
      mimeType: "image/jpeg",
      bytes: 7,
    });
    expect(Buffer.from(String(data.base64), "base64")).toEqual(bytes);
  });

  it("refuses a file over the inline ceiling instead of killing the channel", async () => {
    const big = Buffer.alloc(MAX_PAYLOAD_BYTES + 1);
    const client = new AdbClient(
      "adb",
      scriptedRunner({}),
      scriptedBinaryRunner({ "exec-out cat /big.bin": big }),
    );
    const err = await refusal(
      executeCommand(client, command("files.pull", { path: "/big.bin" }), ctx),
    );
    expect(err.code).toBe("unsupported");
    expect(err.message).toMatch(/at most 6 MB/);
  });

  it("pushes base64 bytes to the phone", async () => {
    const seen: string[][] = [];
    const runner: AdbRunner = async (_file, args) => {
      seen.push(args);
      if (args[0] === "push") return { code: 0, stdout: "1 file pushed, 0 skipped.\n", stderr: "" };
      return { code: 1, stdout: "", stderr: "unexpected" };
    };
    const client = new AdbClient("adb", runner);
    const data = await executeCommand(
      client,
      command("files.push", {
        path: "/sdcard/Download/x.txt",
        data: Buffer.from("hi").toString("base64"),
      }),
      ctx,
    );
    expect(data).toEqual({ path: "/sdcard/Download/x.txt", bytes: 2 });
    expect(seen[0]?.[0]).toBe("push");
    expect(seen[0]?.[2]).toBe("/sdcard/Download/x.txt");
  });

  it("needs a path for pull", async () => {
    const client = new AdbClient("adb", scriptedRunner({}));
    expect((await refusal(executeCommand(client, command("files.pull"), ctx))).code).toBe(
      "bad_request",
    );
  });
});

describe("apps", () => {
  it("lists and installs", async () => {
    const runner: AdbRunner = async (_file, args) => {
      if (args[0] === "install") return { code: 0, stdout: "Success\n", stderr: "" };
      if (args[0] === "shell" && args[1] === "pm list packages -3") {
        return { code: 0, stdout: "package:com.a.app\n", stderr: "" };
      }
      return { code: 1, stdout: "", stderr: "unexpected" };
    };
    const client = new AdbClient("adb", runner);
    expect(await executeCommand(client, command("apps.list"), ctx)).toMatchObject({
      apps: [{ packageName: "com.a.app" }],
      all: false,
    });
    const installed = await executeCommand(
      client,
      command("apps.install", { apk: Buffer.from("apk!").toString("base64") }),
      ctx,
    );
    expect(installed).toMatchObject({ output: "Success" });
  });

  it("reports a failed install as command_failed", async () => {
    const runner: AdbRunner = async () => ({
      code: 1,
      stdout: "Failure [INSTALL_FAILED_INVALID_APK]\n",
      stderr: "",
    });
    const client = new AdbClient("adb", runner);
    const err = await refusal(
      executeCommand(
        client,
        command("apps.install", { apk: Buffer.from("x").toString("base64") }),
        ctx,
      ),
    );
    expect(err.code).toBe("command_failed");
    expect(err.message).toMatch(/INSTALL_FAILED_INVALID_APK/);
  });
});

describe("shell and input", () => {
  it("runs a shell command and truncates huge output", async () => {
    const huge = "x".repeat(MAX_SHELL_OUTPUT + 100);
    const client = new AdbClient("adb", scriptedRunner({ "shell cat /big": huge }));
    const data = (await executeCommand(
      client,
      command("shell.exec", { command: "cat /big" }),
      ctx,
    )) as Record<string, unknown>;
    expect(String(data.stdout)).toHaveLength(MAX_SHELL_OUTPUT + "\n…(truncated)".length);
    expect(String(data.stdout).endsWith("…(truncated)")).toBe(true);
    expect(data.code).toBe(0);
  });

  it("maps tap, swipe and keyevents to `input`", async () => {
    const calls: string[] = [];
    const client = new AdbClient("adb", scriptedRunner({}, calls));
    await executeCommand(client, command("input.tap", { x: 500, y: 1200 }), ctx);
    await executeCommand(
      client,
      command("input.swipe", { x1: 1, y1: 2, x2: 3, y2: 4, durationMs: 300 }),
      ctx,
    );
    await executeCommand(client, command("input.key", { key: "HOME" }), ctx);
    expect(calls).toEqual([
      "shell input tap 500 1200",
      "shell input swipe 1 2 3 4 300",
      "shell input keyevent HOME",
    ]);
  });

  it("types ASCII, turning spaces into %s", async () => {
    const calls: string[] = [];
    const client = new AdbClient("adb", scriptedRunner({}, calls));
    expect(
      await executeCommand(client, command("input.text", { text: "hello world" }), ctx),
    ).toEqual({
      length: 11,
    });
    expect(calls).toEqual(["shell input text hello%sworld"]);
  });

  it("refuses non-ASCII text with the ADBKeyboard explanation", async () => {
    const calls: string[] = [];
    const client = new AdbClient("adb", scriptedRunner({}, calls));
    const err = await refusal(executeCommand(client, command("input.text", { text: "你好" }), ctx));
    expect(err.code).toBe("unsupported");
    expect(err.message).toMatch(/ADBKeyboard/);
    expect(calls).toEqual([]);
  });

  it("refuses an unsafe key", async () => {
    const client = new AdbClient("adb", scriptedRunner({}));
    expect(
      (await refusal(executeCommand(client, command("input.key", { key: "HOME;rm -rf /" }), ctx)))
        .code,
    ).toBe("bad_request");
  });
});

describe("notifications and refresh", () => {
  it("lists titles up to the limit", async () => {
    const dump = [
      "NotificationRecord(0x1: pkg=com.a user=0)\n  android.title=String (one)",
      "NotificationRecord(0x2: pkg=com.b user=0)\n  android.title=String (two)",
      "NotificationRecord(0x3: pkg=com.c user=0)\n  android.title=String (three)",
    ].join("\n");
    const client = new AdbClient(
      "adb",
      scriptedRunner({ "shell dumpsys notification --noredact": dump }),
    );
    const data = (await executeCommand(client, command("notify.list", { limit: 2 }), ctx)) as {
      notifications: unknown[];
      count: number;
    };
    expect(data.count).toBe(2);
    expect(data.notifications).toHaveLength(2);
  });

  it("refreshes through the caller's collector", async () => {
    const client = new AdbClient("adb", scriptedRunner({}));
    expect(await executeCommand(client, command("snapshot.refresh"), ctx)).toEqual({
      at: "2026-11-27T00:00:00.000Z",
    });
  });

  it("says pairing is the bridge's job, not a device command", async () => {
    const client = new AdbClient("adb", scriptedRunner({}));
    expect((await refusal(executeCommand(client, command("pair.wifi.start"), ctx))).code).toBe(
      "unsupported",
    );
  });
});
