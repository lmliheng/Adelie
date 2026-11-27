/**
 * `adelie-device-bridge` — the standalone process form of the ADB bridge. The desktop app
 * spawns it (utilityProcess) and `penguin device-bridge` runs it by hand; both point it at the
 * endpoint the server listens on.
 *
 * No argument parser dependency on purpose: the surface is a dozen flags, and the package's
 * only runtime dependency is the protocol itself.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bridgeEndpoint } from "@adelie/device";
import { AdbClient } from "./adb-client.js";
import { defaultDiscoveryInput, findAdb } from "./adb-discovery.js";
import { AdbBridge, type AdbRuntime } from "./bridge.js";

interface Args {
  socket?: string;
  dataRoot?: string;
  adb?: string;
  bundledAdb?: string;
  bridgeId?: string;
  name?: string;
  kind?: "desktop" | "cli";
  log?: string;
  pollMs?: number;
  dynamicMs?: number;
}

const USAGE = `usage: adelie-device-bridge [options]

  --socket <path>       Endpoint the Adelie server listens on
                        (default: the data root's run/device-bridge.sock, or its named pipe)
  --data-root <path>    Data root (default: ADELIE_HOME, PENGUIN_HOME, ~/.adelie/data)
  --adb <path>          adb binary to use (overrides PATH and well-known installs)
  --bundled-adb <path>  platform-tools adb shipped with the app, used when nothing else is found
  --bridge-id <id>      Stable bridge id (default: adb-<install id>)
  --name <text>         Name shown in the device panel
  --kind <desktop|cli>  What hosts this bridge (default: desktop)
  --log <file>          Also append log lines to a file
  --poll-ms <n>         Device poll interval (default: 5000)
  --dynamic-ms <n>      Readings interval (default: 15000)
`;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value`);
      i += 1;
      return value;
    };
    switch (flag) {
      case "--socket":
        args.socket = next();
        break;
      case "--data-root":
        args.dataRoot = path.resolve(next());
        break;
      case "--adb":
        args.adb = next();
        break;
      case "--bundled-adb":
        args.bundledAdb = next();
        break;
      case "--bridge-id":
        args.bridgeId = next();
        break;
      case "--name":
        args.name = next();
        break;
      case "--kind": {
        const kind = next();
        if (kind !== "desktop" && kind !== "cli") throw new Error("--kind must be desktop or cli");
        args.kind = kind;
        break;
      }
      case "--log":
        args.log = path.resolve(next());
        break;
      case "--poll-ms":
        args.pollMs = Number.parseInt(next(), 10);
        break;
      case "--dynamic-ms":
        args.dynamicMs = Number.parseInt(next(), 10);
        break;
      case "--help":
      case "-h":
        process.stdout.write(USAGE);
        process.exit(0);
        break;
      default:
        throw new Error(`unknown option ${flag}`);
    }
  }
  return args;
}

/** Same resolution as the server's `resolveRoot`, kept local: this package stays dependency-free. */
function defaultRoot(): string {
  return (
    process.env.ADELIE_HOME ??
    process.env.PENGUIN_HOME ??
    path.join(os.homedir(), ".adelie", "data")
  );
}

/** `<root>/install-id`, without minting one: a bridge may not create the root's identity. */
function readInstallId(root: string): string | null {
  try {
    const id = (
      fs.readFileSync(path.join(root, "install-id"), "utf8").split("\n", 1)[0] ?? ""
    ).trim();
    return id === "" ? null : id;
  } catch {
    return null;
  }
}

function version(): string {
  try {
    const raw = fs.readFileSync(new URL("../package.json", import.meta.url), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function makeLogger(file: string | undefined): (level: string, line: string) => void {
  return (level, line) => {
    const stamp = new Date().toISOString();
    const text = `${stamp} ${level} device-adb: ${line}`;
    process.stderr.write(`${text}\n`);
    if (file === undefined) return;
    try {
      fs.appendFileSync(file, `${text}\n`);
    } catch {
      // A log file that cannot be written is not worth stopping the bridge for.
    }
  };
}

function resolver(args: Args, log: (level: string, line: string) => void) {
  return async (): Promise<AdbRuntime> => {
    const env = {
      ...process.env,
      ...(args.adb !== undefined ? { ADELIE_ADB_PATH: args.adb } : {}),
    };
    const location = findAdb(defaultDiscoveryInput(env), args.bundledAdb ?? null);
    const environment: AdbRuntime["environment"] = {
      adb: {
        found: location.found,
        path: location.path,
        version: null,
        source: location.source,
        ...(location.message !== undefined ? { message: location.message } : {}),
      },
      platform: `${process.platform}-${process.arch}`,
    };
    if (!location.found || location.path === null) {
      return { adb: null, environment };
    }
    const client = new AdbClient(location.path);
    const version = await client.version();
    environment.adb!.version = version;
    log("info", `adb: ${location.path} (${location.source}, version ${version ?? "unknown"})`);
    return { adb: client, environment };
  };
}

async function main(): Promise<void> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n\n${USAGE}`);
    process.exit(2);
  }

  const log = makeLogger(args.log);
  const root = args.dataRoot ?? defaultRoot();
  const installId = readInstallId(root);
  const endpoint = args.socket ?? bridgeEndpoint(root, installId, process.platform);
  const bridge = new AdbBridge({
    endpoint,
    bridgeId: args.bridgeId ?? `adb-${installId ?? "default"}`,
    bridgeName: args.name ?? "Adelie desktop · ADB",
    kind: args.kind ?? "desktop",
    version: version(),
    resolveAdb: resolver(args, log),
    log,
    pollMs: args.pollMs,
    dynamicMs: args.dynamicMs,
  });

  const shutdown = (signal: string): void => {
    log("info", `${signal}: stopping`);
    bridge.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  log("info", `data root ${root}`);
  log("info", `endpoint ${endpoint}`);
  await bridge.start();
}

void main();
