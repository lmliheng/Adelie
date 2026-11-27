/**
 * `penguin device` — the phone as a device of this instance (design §8), a thin client over
 * `/api/projects/:projectId/devices`. The bridge does the adb work; this command only asks and
 * prints, which is what makes it usable by an agent through its ordinary shell approval.
 *
 *   penguin device list [--json]
 *   penguin device info <id> [--json]
 *   penguin device screenshot <id> [-o <file>] [--json]
 *   penguin device files ls <id> /sdcard/DCIM
 *   penguin device files pull <id> /sdcard/DCIM/a.jpg [<local>]
 *   penguin device files push <id> ./a.jpg /sdcard/DCIM/a.jpg
 *   penguin device apps list <id> [--all]
 *   penguin device apps install <id> ./x.apk
 *   penguin device apps uninstall <id> com.example.app
 *   penguin device shell <id> "getprop ro.product.model"
 *   penguin device input <id> tap 500 1200
 *   penguin device input <id> swipe 1 2 3 4 [durationMs]
 *   penguin device input <id> text "hello world"
 *   penguin device input <id> key HOME
 *   penguin device notify list <id> [--limit 20]
 *   penguin device pair --wifi [--bridge <id>]
 *   penguin device events <id> [--limit 50]
 *
 * Every command takes `--json` (the response DTO as one line) and `--server` / `--project-id`.
 * Write ops (install, uninstall, shell, input, file push) carry `approve: true`: a person or an
 * agent-in-a-session typed this command, which IS the per-command consent; the server still
 * refuses when the capability is not granted on that device.
 *
 * Screenshots and pulled files arrive inline as base64 (the local pipe has no file channel in
 * P0) and are written to disk here; one command carries at most 6 MB.
 *
 * Docs: /docs/cli § "penguin device".
 */
import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { renderUnicodeCompact } from "uqr";
import type { DeviceCommandOp } from "@adelie/device";
import type {
  DeviceCommandResponse,
  DeviceDetailResponse,
  DeviceEventListResponse,
  DeviceView,
  DevicesResponse,
} from "@adelie/server/api";
import { ApiError, resolveConnection, resolveProjectId, ServerClient } from "../client.js";
import { relativeTime, renderTable } from "../table.js";
import type { Messages } from "../i18n.js";

const enc = encodeURIComponent;

interface CommonOpts {
  json?: boolean;
  server?: string;
  projectId?: string;
}

/** The write ops whose consent is the invocation itself (see the module doc). */
const WRITE_OPS = new Set<DeviceCommandOp>([
  "files.push",
  "apps.install",
  "apps.uninstall",
  "shell.exec",
  "input.tap",
  "input.swipe",
  "input.text",
  "input.key",
]);

class DeviceCliError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function base(projectId: string): string {
  return `/api/projects/${enc(projectId)}/devices`;
}

async function connect(opts: CommonOpts, t: Messages): Promise<ServerClient> {
  return new ServerClient(await resolveConnection({ server: opts.server }, t), t);
}

/** Wraps a handler: one error line on stderr, exit code 1, like the browser commands. */
function action<A extends unknown[]>(
  t: Messages,
  run: (...args: A) => Promise<void>,
): (...args: A) => Promise<void> {
  return async (...args: A) => {
    try {
      await run(...args);
    } catch (err) {
      let code = "error";
      let message = err instanceof Error ? err.message : String(err);
      if (err instanceof DeviceCliError) code = err.code;
      else if (err instanceof ApiError) {
        code = err.code;
        const body = (err.body ?? {}) as { error?: { message?: unknown } };
        const own = body.error?.message;
        message = err.status !== 401 && typeof own === "string" && own !== "" ? own : err.message;
      }
      process.stderr.write(`${t.device.errorLine(code, message.replace(/\s+/g, " ").trim())}\n`);
      process.exitCode = 1;
    }
  };
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function humanBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return "?";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function batteryOf(device: DeviceView): string {
  const power = device.snapshot?.dynamic?.data.power;
  if (power?.level === undefined) return "—";
  return `${power.level}%${power.charging === true ? " ⚡" : ""}`;
}

/** One device's human description: only the groups the bridge actually measured. */
function describe(device: DeviceView): string {
  const snapshot = device.snapshot;
  const stat = snapshot?.static?.data;
  const dyn = snapshot?.dynamic?.data;
  const lines: string[] = [];
  lines.push(`${device.name}  (${device.id})`);
  lines.push(
    `state:      ${device.state} over ${device.transport}${device.bridgeOnline ? "" : " · bridge offline"}`,
  );
  if (device.platform !== null) lines.push(`system:     ${device.platform}`);
  if (stat?.serial !== undefined || device.serial !== null)
    lines.push(`serial:     ${stat?.serial ?? device.serial}`);
  if (stat?.buildId !== undefined) lines.push(`build:      ${stat.buildId}`);
  if (stat?.abi !== undefined)
    lines.push(`abi/cpu:    ${[stat.abi, stat.cpu].filter(Boolean).join(" · ")}`);
  const power = dyn?.power;
  if (power !== undefined) {
    const bits = [`${power.level ?? "?"}%`];
    if (power.charging === true) bits.push("charging");
    if (power.temperatureC !== undefined) bits.push(`${power.temperatureC.toFixed(1)}°C`);
    if (power.health !== undefined) bits.push(power.health);
    lines.push(`battery:    ${bits.join(" · ")}`);
  }
  const memory = dyn?.memory;
  if (memory !== undefined)
    lines.push(
      `memory:     ${humanBytes(memory.availableBytes)} free of ${humanBytes(memory.totalBytes)}`,
    );
  const storage = dyn?.storage;
  if (storage !== undefined)
    lines.push(
      `storage:    ${humanBytes(storage.usedBytes)} used of ${humanBytes(storage.totalBytes)} (${humanBytes(storage.availableBytes)} free)`,
    );
  const screen = dyn?.screen;
  if (screen !== undefined) {
    const bits: string[] = [];
    if (screen.widthPx !== undefined && screen.heightPx !== undefined)
      bits.push(`${screen.widthPx}x${screen.heightPx}`);
    if (screen.densityDpi !== undefined) bits.push(`${screen.densityDpi}dpi`);
    if (screen.refreshHz !== undefined) bits.push(`${Math.round(screen.refreshHz)}Hz`);
    if (screen.orientation !== undefined) bits.push(screen.orientation);
    if (screen.locked !== undefined) bits.push(screen.locked ? "locked" : "unlocked");
    if (screen.brightness !== undefined) bits.push(`brightness ${screen.brightness}`);
    lines.push(`screen:     ${bits.join(" · ")}`);
  }
  const network = dyn?.network;
  if (network !== undefined) {
    const wifi = network.wifi;
    const bits = [
      wifi?.ssid ?? (network.addresses?.length ? network.addresses.join(", ") : undefined),
      wifi?.rssi !== undefined ? `${wifi.rssi}dBm` : undefined,
      network.addresses?.[0],
    ].filter((bit): bit is string => typeof bit === "string" && bit !== "");
    if (bits.length > 0) lines.push(`network:    ${[...new Set(bits)].join(" · ")}`);
  }
  if (dyn?.foreground !== undefined) lines.push(`foreground: ${dyn.foreground}`);
  const allowed = Object.entries(device.permissions)
    .filter(([, ok]) => ok)
    .map(([capability]) => capability);
  lines.push(`allowed:    ${allowed.join(", ") || "nothing"}`);
  if (device.grants.length > 0) lines.push(`projects:   ${device.grants.join(", ")}`);
  if (device.lastSeenAt !== null) lines.push(`last seen:  ${relativeTime(device.lastSeenAt)}`);
  if (snapshot === null) lines.push("(no snapshot yet: the bridge has not measured this phone)");
  return `${lines.join("\n")}\n`;
}

/** Default file name for a screenshot: the id and the local time, so two do not collide. */
function screenshotName(deviceId: string): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..*$/, "")
    .replace("T", "-");
  return `device-${deviceId}-${stamp}.png`;
}

async function runCommand(
  client: ServerClient,
  projectId: string,
  deviceId: string,
  op: DeviceCommandOp,
  args?: Record<string, unknown>,
): Promise<unknown> {
  const body = { op, args, ...(WRITE_OPS.has(op) ? { approve: true } : {}) };
  const result = await client.request<DeviceCommandResponse>(
    "POST",
    `${base(projectId)}/${enc(deviceId)}/commands`,
    body,
  );
  if (!result.ok) {
    throw new DeviceCliError(
      result.error?.code ?? "command_failed",
      result.error?.message ?? "The command failed.",
    );
  }
  return result.data;
}

interface ScreenshotData {
  base64: string;
  mimeType: string;
  bytes: number;
}

interface PullData {
  base64: string;
  bytes: number;
  name: string;
}

export function registerDeviceCommand(program: Command, t: Messages): void {
  const device = program.command("device").description(t.device.desc);
  const common = (command: Command): Command =>
    command.option("--json", t.common.json).option("--server <url>", t.common.server);

  common(device.command("list").description(t.device.listDesc))
    .option("--project-id <id>", t.common.projectId)
    .action(
      action(t, async (opts: CommonOpts) => {
        const client = await connect(opts, t);
        const projectId = resolveProjectId(opts.projectId);
        const body = await client.request<DevicesResponse>("GET", base(projectId));
        if (opts.json === true) return printJson(body);
        if (body.adb !== null && !body.adb.found && body.adb.message !== undefined) {
          process.stderr.write(`${t.device.adbHint(body.adb.message)}\n`);
        }
        if (body.devices.length === 0) {
          process.stdout.write(`${t.device.empty(projectId)}\n`);
          return;
        }
        const rows = body.devices.map((view) => [
          view.name,
          view.id,
          `${view.state}${view.bridgeOnline ? "" : " (bridge off)"}`,
          view.transport,
          view.platform ?? "",
          batteryOf(view),
          view.lastSeenAt === null ? "—" : relativeTime(view.lastSeenAt),
        ]);
        process.stdout.write(
          renderTable(
            [
              t.device.colName(),
              "ID",
              t.device.colState(),
              t.device.colTransport(),
              t.device.colPlatform(),
              t.device.colBattery(),
              t.device.colLastSeen(),
            ],
            rows,
          ),
        );
      }),
    );

  common(device.command("info <id>").description(t.device.infoDesc))
    .option("--project-id <id>", t.common.projectId)
    .action(
      action(t, async (id: string, opts: CommonOpts) => {
        const client = await connect(opts, t);
        const projectId = resolveProjectId(opts.projectId);
        const detail = await client.request<DeviceDetailResponse>(
          "GET",
          `${base(projectId)}/${enc(id)}`,
        );
        if (opts.json === true) return printJson(detail);
        process.stdout.write(describe(detail.device));
        const events = detail.events.slice(-10).reverse();
        if (events.length > 0) {
          process.stdout.write(
            renderTable(
              ["AT", "KIND", "ACTION", "ACTOR"],
              events.map((event) => [
                event.at,
                event.kind,
                event.action ?? "",
                event.actor ?? "system",
              ]),
            ),
          );
        }
      }),
    );

  common(device.command("screenshot <id>").description(t.device.screenshotDesc))
    .option("-o, --output <file>", t.device.outputOpt)
    .option("--project-id <id>", t.common.projectId)
    .action(
      action(t, async (id: string, opts: CommonOpts & { output?: string }) => {
        const client = await connect(opts, t);
        const projectId = resolveProjectId(opts.projectId);
        const data = (await runCommand(client, projectId, id, "screenshot")) as ScreenshotData;
        const output = opts.output ?? screenshotName(id);
        fs.writeFileSync(output, Buffer.from(data.base64, "base64"));
        if (opts.json === true)
          return printJson({ path: path.resolve(output), bytes: data.bytes, deviceId: id });
        process.stdout.write(`${t.device.saved(path.resolve(output), data.bytes)}\n`);
      }),
    );

  const files = device.command("files").description(t.device.filesDesc);
  common(files.command("ls <id> <path>").description(t.device.filesLsDesc))
    .option("--project-id <id>", t.common.projectId)
    .action(
      action(t, async (id: string, remotePath: string, opts: CommonOpts) => {
        const client = await connect(opts, t);
        const projectId = resolveProjectId(opts.projectId);
        const data = (await runCommand(client, projectId, id, "files.list", {
          path: remotePath,
        })) as {
          path: string;
          entries: Array<{ name: string; dir: boolean; sizeBytes?: number; modifiedAt?: string }>;
        };
        if (opts.json === true) return printJson(data);
        if (data.entries.length === 0) {
          process.stdout.write(`${data.path}: empty\n`);
          return;
        }
        process.stdout.write(
          renderTable(
            ["NAME", "KIND", "SIZE", "MODIFIED"],
            data.entries.map((entry) => [
              entry.name,
              entry.dir ? "dir" : "file",
              entry.dir ? "" : humanBytes(entry.sizeBytes),
              entry.modifiedAt ?? "",
            ]),
          ),
        );
      }),
    );
  common(files.command("pull <id> <remote> [local]").description(t.device.filesPullDesc))
    .option("--project-id <id>", t.common.projectId)
    .action(
      action(t, async (id: string, remote: string, local: string | undefined, opts: CommonOpts) => {
        const client = await connect(opts, t);
        const projectId = resolveProjectId(opts.projectId);
        const data = (await runCommand(client, projectId, id, "files.pull", {
          path: remote,
        })) as PullData;
        const output = local ?? data.name;
        fs.writeFileSync(output, Buffer.from(data.base64, "base64"));
        if (opts.json === true)
          return printJson({ path: path.resolve(output), bytes: data.bytes, deviceId: id });
        process.stdout.write(`${t.device.saved(path.resolve(output), data.bytes)}\n`);
      }),
    );
  common(files.command("push <id> <local> <remote>").description(t.device.filesPushDesc))
    .option("--project-id <id>", t.common.projectId)
    .action(
      action(t, async (id: string, local: string, remote: string, opts: CommonOpts) => {
        const bytes = fs.readFileSync(local);
        const client = await connect(opts, t);
        const projectId = resolveProjectId(opts.projectId);
        const data = await runCommand(client, projectId, id, "files.push", {
          path: remote,
          data: bytes.toString("base64"),
        });
        if (opts.json === true) return printJson(data);
        process.stdout.write(`${remote}: ${bytes.byteLength} bytes\n`);
      }),
    );

  const apps = device.command("apps").description(t.device.appsDesc);
  common(apps.command("list <id>").description(t.device.appsListDesc))
    .option("--all", t.device.allOpt)
    .option("--project-id <id>", t.common.projectId)
    .action(
      action(t, async (id: string, opts: CommonOpts & { all?: boolean }) => {
        const client = await connect(opts, t);
        const projectId = resolveProjectId(opts.projectId);
        const data = (await runCommand(client, projectId, id, "apps.list", {
          all: opts.all === true,
        })) as {
          apps: Array<{ packageName: string; thirdParty?: boolean }>;
        };
        if (opts.json === true) return printJson(data);
        for (const app of data.apps) process.stdout.write(`${app.packageName}\n`);
      }),
    );
  common(apps.command("install <id> <apk>").description(t.device.appsInstallDesc))
    .option("--project-id <id>", t.common.projectId)
    .action(
      action(t, async (id: string, apk: string, opts: CommonOpts) => {
        const bytes = fs.readFileSync(apk);
        const client = await connect(opts, t);
        const projectId = resolveProjectId(opts.projectId);
        const data = await runCommand(client, projectId, id, "apps.install", {
          apk: bytes.toString("base64"),
        });
        if (opts.json === true) return printJson(data);
        process.stdout.write(`${(data as { output?: string }).output ?? "installed"}\n`);
      }),
    );
  common(apps.command("uninstall <id> <packageName>").description(t.device.appsUninstallDesc))
    .option("--project-id <id>", t.common.projectId)
    .action(
      action(t, async (id: string, packageName: string, opts: CommonOpts) => {
        const client = await connect(opts, t);
        const projectId = resolveProjectId(opts.projectId);
        const data = await runCommand(client, projectId, id, "apps.uninstall", { packageName });
        if (opts.json === true) return printJson(data);
        process.stdout.write(
          `${packageName}: ${(data as { output?: string }).output ?? "uninstalled"}\n`,
        );
      }),
    );

  common(device.command("shell <id> <command>").description(t.device.shellDesc))
    .option("--project-id <id>", t.common.projectId)
    .action(
      action(t, async (id: string, command: string, opts: CommonOpts) => {
        const client = await connect(opts, t);
        const projectId = resolveProjectId(opts.projectId);
        const data = (await runCommand(client, projectId, id, "shell.exec", { command })) as {
          code: number;
          stdout: string;
          stderr: string;
        };
        if (opts.json === true) return printJson(data);
        process.stdout.write(data.stdout);
        if (data.stderr !== "") process.stderr.write(data.stderr);
        if (data.code !== 0) process.exitCode = data.code;
      }),
    );

  common(device.command("input <id> <action> [rest...]").description(t.device.inputDesc))
    .option("--project-id <id>", t.common.projectId)
    .action(
      action(t, async (id: string, inputAction: string, rest: string[], opts: CommonOpts) => {
        const nums = rest.map((value) => Number.parseInt(value, 10));
        const need = (count: number): number[] => {
          if (nums.length < count || nums.slice(0, count).some((n) => !Number.isFinite(n))) {
            throw new DeviceCliError("bad_request", `input ${inputAction} needs ${count} numbers.`);
          }
          return nums;
        };
        const [op, args]: [DeviceCommandOp, Record<string, unknown>] = (() => {
          switch (inputAction) {
            case "tap": {
              const [x, y] = need(2);
              return ["input.tap", { x, y }];
            }
            case "swipe": {
              const [x1, y1, x2, y2] = need(4);
              const durationMs = Number.isFinite(nums[4]) ? nums[4] : undefined;
              return [
                "input.swipe",
                { x1, y1, x2, y2, ...(durationMs !== undefined ? { durationMs } : {}) },
              ];
            }
            case "text":
              if (rest.length === 0)
                throw new DeviceCliError("bad_request", "input text needs a string.");
              return ["input.text", { text: rest.join(" ") }];
            case "key":
              if (rest.length !== 1 || rest[0] === undefined)
                throw new DeviceCliError("bad_request", "input key needs one key name or code.");
              return ["input.key", { key: rest[0] }];
            default:
              throw new DeviceCliError("bad_request", `unknown input action ${inputAction}`);
          }
        })();
        const client = await connect(opts, t);
        const projectId = resolveProjectId(opts.projectId);
        const data = await runCommand(client, projectId, id, op, args);
        if (opts.json === true) return printJson(data);
        process.stdout.write(`ok: ${op}\n`);
      }),
    );

  const notify = device.command("notify").description(t.device.notifyDesc);
  common(notify.command("list <id>").description(t.device.notifyListDesc))
    .option("--limit <n>", t.device.limitOpt)
    .option("--project-id <id>", t.common.projectId)
    .action(
      action(t, async (id: string, opts: CommonOpts & { limit?: string }) => {
        const limit = opts.limit === undefined ? undefined : Number.parseInt(opts.limit, 10);
        const client = await connect(opts, t);
        const projectId = resolveProjectId(opts.projectId);
        const data = (await runCommand(client, projectId, id, "notify.list", { limit })) as {
          notifications: Array<{ packageName: string; title?: string; postedAt?: string }>;
        };
        if (opts.json === true) return printJson(data);
        if (data.notifications.length === 0) {
          process.stdout.write("(no readable notifications; Android 12+ restricts this dump)\n");
          return;
        }
        for (const item of data.notifications) {
          process.stdout.write(
            `${item.packageName}\t${item.title ?? ""}\t${item.postedAt ?? ""}\n`,
          );
        }
      }),
    );

  common(device.command("pair").description(t.device.pairDesc))
    .option("--wifi", t.device.wifiOpt)
    .option("--bridge <id>", t.device.bridgeOpt)
    .option("--project-id <id>", t.common.projectId)
    .action(
      action(t, async (opts: CommonOpts & { wifi?: boolean; bridge?: string }) => {
        if (opts.wifi !== true) throw new DeviceCliError("bad_request", t.device.pairWifiOnly);
        const client = await connect(opts, t);
        const projectId = resolveProjectId(opts.projectId);
        const result = await client.request<DeviceCommandResponse>(
          "POST",
          `${base(projectId)}/pair`,
          {
            ...(opts.bridge !== undefined ? { bridgeId: opts.bridge } : {}),
          },
        );
        if (!result.ok) {
          throw new DeviceCliError(
            result.error?.code ?? "command_failed",
            result.error?.message ?? "Pairing failed.",
          );
        }
        const pairing = (
          result.data as {
            pairing?: { qr: string; serviceName: string; code: string; expiresAt: string };
          }
        ).pairing;
        if (pairing === undefined)
          throw new DeviceCliError("command_failed", "The bridge returned no pairing data.");
        if (opts.json === true) return printJson(pairing);
        process.stdout.write(`${renderUnicodeCompact(pairing.qr, { ecc: "M", border: 2 })}\n`);
        process.stdout.write(
          `${t.device.pairHint(pairing.serviceName, pairing.code, pairing.expiresAt)}\n`,
        );
      }),
    );

  common(device.command("events <id>").description(t.device.eventsDesc))
    .option("--limit <n>", t.device.limitOpt)
    .option("--project-id <id>", t.common.projectId)
    .action(
      action(t, async (id: string, opts: CommonOpts & { limit?: string }) => {
        const client = await connect(opts, t);
        const projectId = resolveProjectId(opts.projectId);
        const query = opts.limit !== undefined ? `?limit=${enc(opts.limit)}` : "";
        const body = await client.request<DeviceEventListResponse>(
          "GET",
          `${base(projectId)}/${enc(id)}/events${query}`,
        );
        if (opts.json === true) return printJson(body);
        process.stdout.write(
          renderTable(
            ["AT", "KIND", "ACTION", "ACTOR", "DETAIL"],
            body.events.map((event) => [
              event.at,
              event.kind,
              event.action ?? "",
              event.actor ?? "system",
              event.detail === null || event.detail === undefined
                ? ""
                : JSON.stringify(event.detail),
            ]),
          ),
        );
      }),
    );
}
