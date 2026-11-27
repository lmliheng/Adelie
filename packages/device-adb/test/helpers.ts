import type { AdbBinaryRunner, AdbRunner, RunResult } from "../src/adb-discovery.js";

/** One scripted answer per full argument list (`"shell getprop"`, `"-s X shell wm size"`). */
export type Script = Record<string, string | ((args: string[]) => string)>;

/**
 * A stand-in for adb: the tests are about what this package does with an answer, and this
 * machine has no phone. Any `shell` call the script does not name answers empty successfully —
 * the same thing adb does when a device is too old to know the command.
 */
export function scriptedRunner(script: Script, calls: string[] = []): AdbRunner {
  return async (
    file: string,
    args: string[],
    options: { timeoutMs: number },
  ): Promise<RunResult> => {
    void file;
    void options;
    const key = args.join(" ");
    calls.push(key);
    const entry = script[key];
    if (entry === undefined) {
      if (args[0] === "shell") return { code: 0, stdout: "", stderr: "" };
      return { code: 1, stdout: "", stderr: `not scripted: ${key}` };
    }
    const stdout = typeof entry === "function" ? entry(args) : entry;
    return { code: 0, stdout, stderr: "" };
  };
}

/** Binary answers, keyed the same way (`"exec-out screencap -p"`). */
export function scriptedBinaryRunner(
  map: Record<string, Buffer>,
  calls: string[] = [],
): AdbBinaryRunner {
  return async (file: string, args: string[], options: { timeoutMs: number }) => {
    void file;
    void options;
    const key = args.join(" ");
    calls.push(key);
    const bytes = map[key];
    if (bytes === undefined)
      return { code: 1, stdout: Buffer.alloc(0), stderr: `not scripted: ${key}` };
    return { code: 0, stdout: bytes, stderr: "" };
  };
}

/** 1×1 transparent PNG, the smallest thing worth calling a screenshot. */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

export const DEVICES_L = `List of devices attached
R58M12ABC	device usb:1-1 product:shiba model:Pixel_8 device:shiba transport_id:1
`;

export const GETPROP = `[ro.product.brand]: [Google]
[ro.product.model]: [Pixel 8]
[ro.product.device]: [shiba]
[ro.serialno]: [R58M12ABC]
[ro.build.version.release]: [15]
[ro.build.version.sdk]: [35]
[ro.product.cpu.abi]: [arm64-v8a]
`;
