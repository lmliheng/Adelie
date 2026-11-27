/**
 * Android 11's pair-with-a-QR-code flow (design §4.3), from the computer's side.
 *
 * The phone scans the QR, which carries a service name and a one-time code, and starts
 * advertising `_adb-tls-pairing._tcp`. We already know the code (we put it in the QR), so all
 * that is left is to find the phone's address with `adb mdns services` and finish with
 * `adb pair <address> <code>`. After that the phone advertises `_adb-tls-connect._tcp`, and a
 * `connect` to that address makes it appear in `adb devices` like any other phone.
 *
 * The watching happens in the background: the command that asks for a QR answers immediately
 * with the QR, and success or failure arrives as a log line. Five minutes, then it gives up —
 * a code that was never scanned must not stay usable.
 */
import { randomInt } from "node:crypto";
import type { PairingQr } from "@adelie/device";
import type { AdbClient } from "./adb-client.js";
import { buildPairingQr, parseMdnsServices, type MdnsService } from "./parse.js";

export interface WifiPairing {
  /** What to draw and hand to the phone. */
  pairing: PairingQr;
  /** Resolves when the background watch ends; the bridge does not wait for it. */
  done: Promise<{ paired: boolean; address?: string; message?: string }>;
}

export interface PairingOptions {
  log: (level: "info" | "warn", line: string) => void;
  now?: () => Date;
  /** 5 minutes, like the design's one-time code. */
  timeoutMs?: number;
  intervalMs?: number;
  /** Tests shorten the wait instead of mocking timers. */
  sleep?: (ms: number) => Promise<void>;
  randomCode?: () => string;
  serviceNonce?: () => string;
}

const PAIRING_TYPE = "_adb-tls-pairing._tcp";
const CONNECT_TYPE = "_adb-tls-connect._tcp";

function sixDigits(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function nonce(): string {
  return randomInt(0, 0xffffff).toString(16).padStart(6, "0");
}

/** The pairing service the phone will announce, matched by name (some ROMs append a suffix). */
export function findPairingAddress(services: MdnsService[], serviceName: string): string | null {
  const pairing = services.filter((s) => s.type === PAIRING_TYPE);
  const exact = pairing.find((s) => s.name === serviceName || s.name.startsWith(`${serviceName}.`));
  return (exact ?? pairing[0])?.address ?? null;
}

/** The debug-bridge address the phone advertises once pairing succeeded. */
export function findConnectAddress(services: MdnsService[]): string | null {
  return services.find((s) => s.type === CONNECT_TYPE)?.address ?? null;
}

/**
 * Starts a pairing and returns the QR plus the background result. `client` must be the
 * unpinned client: pairing happens before any device exists.
 */
export function startWifiPairing(client: AdbClient, options: PairingOptions): WifiPairing {
  const now = options.now ?? (() => new Date());
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms).unref?.()));
  const code = (options.randomCode ?? sixDigits)();
  const serviceName = `adb-${(options.serviceNonce ?? nonce)()}`;
  const timeoutMs = options.timeoutMs ?? 5 * 60_000;
  const intervalMs = options.intervalMs ?? 2_000;
  const expiresAt = new Date(now().getTime() + timeoutMs).toISOString();
  const pairing: PairingQr = {
    qr: buildPairingQr(serviceName, code),
    serviceName,
    code,
    expiresAt,
  };

  const done = (async (): Promise<{ paired: boolean; address?: string; message?: string }> => {
    const deadline = Date.now() + timeoutMs;
    options.log("info", `pairing: waiting for the phone to announce ${serviceName}`);
    while (Date.now() < deadline) {
      await sleep(intervalMs);
      let services: MdnsService[];
      try {
        services = parseMdnsServices(await client.mdnsServices());
      } catch {
        continue;
      }
      const address = findPairingAddress(services, serviceName);
      if (address === null) continue;
      const result = await client.pair(address, code);
      if (!/successfully paired|Successfully paired/i.test(result.stdout)) {
        const message = `pairing with ${address} failed: ${(result.stdout || result.stderr).trim()}`;
        options.log("warn", message);
        return { paired: false, address, message };
      }
      options.log("info", `pairing: paired with ${address}; connecting`);
      // The connect announcement follows the pairing by a second or two on most ROMs.
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await sleep(1_500);
        try {
          const connect = findConnectAddress(parseMdnsServices(await client.mdnsServices()));
          if (connect !== null) {
            const connected = await client.connect(connect);
            options.log("info", `pairing: ${connect} — ${connected.stdout.trim() || "connected"}`);
            return { paired: true, address: connect };
          }
        } catch {
          // Keep looking until the deadline of this loop.
        }
      }
      return { paired: true, address };
    }
    const message = "pairing: the QR code expired before the phone scanned it";
    options.log("warn", message);
    return { paired: false, message };
  })();

  return { pairing, done };
}
