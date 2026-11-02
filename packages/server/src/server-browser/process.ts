/**
 * The server's own browser process: a real Chromium (or Chrome) on a virtual display, driven
 * over CDP. This is the piece the desktop app replaces with Electron guests — a `<webview>`
 * lives in a window, and a server has none, so the picture is produced here instead and handed
 * out as frames (see session.ts).
 *
 * Why a display at all: a windowed Chromium under Xvfb is a browser in the ordinary sense.
 * `--headless` is cheaper but the sites this exists for see it, and headless Chromium on a
 * Debian box also carries no proprietary codecs or a real GPU path, so video that plays in the
 * picture a person is watching does not play at all. Xvfb is X11-only and optional: where a
 * DISPLAY is already set (a desktop machine running the server, a container with its own X) it
 * is used as it is.
 *
 * The profile is a directory the caller owns and this class only fills in: it carries the
 * sign-ins, so a browser restarted after an upgrade is still signed in where the person left
 * it. Chromium's own singleton files are cleared first — a process killed hard leaves them
 * behind and the next start would silently hand its URL to a browser that is not running.
 */
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { access, constants, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/** How long the DevTools endpoint may take to appear, and how long a stop waits before killing. */
const ENDPOINT_TIMEOUT_MS = 30_000;
const STOP_GRACE_MS = 4_000;
/** How long Xvfb may take to be ready to accept clients. */
const DISPLAY_SETTLE_MS = 1_200;

/**
 * The browsers this will run, in the order they are preferred: whatever the distribution or the
 * person installed, Chromium first because that is what a server image tends to carry. Env
 * override wins over all of them (ADELIE_SERVER_BROWSER_BIN) for a machine whose browser is
 * somewhere else, or is a different build entirely.
 */
const LINUX_CANDIDATES = [
  "chromium",
  "chromium-browser",
  "google-chrome-stable",
  "google-chrome",
  "chrome",
];
const MAC_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter((p) => existsSync(p));

/** The binary to run, or null when this machine has none this knows about. */
export function findBrowserBinary(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const named = env["ADELIE_SERVER_BROWSER_BIN"];
  if (named !== undefined && named.trim() !== "") return named.trim();
  const search = env["PATH"] ?? process.env["PATH"] ?? "";
  for (const candidate of process.platform === "darwin" ? MAC_CANDIDATES : LINUX_CANDIDATES) {
    const found = which(candidate, search);
    if (found !== null) return found;
  }
  return null;
}

/** PATH lookup, without shelling out: a candidate that is a path is used as it is. */
function which(name: string, search: string): string | null {
  if (name.includes("/")) return existsSync(name) ? name : null;
  for (const dir of search.split(path.delimiter)) {
    if (dir === "") continue;
    const full = path.join(dir, name);
    if (existsSync(full)) return full;
  }
  return null;
}

/** An X server for the browser to draw on, started by us so it can be stopped by us. */
interface Display {
  value: string;
  stop(): void;
}

/**
 * The display to use: the one already in the environment, or a fresh Xvfb. Null when neither
 * exists, which is the one case where the server cannot render a browser at all — a headless
 * container image with no Xvfb installed.
 *
 * The number picked is the first free one from 99 up: a fixed 99 would collide with a second
 * Adelie (or anything else) already holding it, and the socket is what decides.
 */
async function ensureDisplay(
  width: number,
  height: number,
  log: (line: string) => void,
): Promise<Display | null> {
  const existing = process.env["DISPLAY"];
  if (existing !== undefined && existing.trim() !== "") {
    return { value: existing, stop: () => {} };
  }
  if (process.platform !== "linux") return null;
  const xvfb = which("Xvfb", process.env["PATH"] ?? "");
  if (xvfb === null) return null;
  for (let n = 99; n < 130; n += 1) {
    if (existsSync(`/tmp/.X11-unix/X${n}`)) continue;
    const proc = spawn(
      xvfb,
      [`:${n}`, "-screen", "0", `${width}x${height}x24`, "-nolisten", "tcp"],
      {
        stdio: "ignore",
        detached: false,
      },
    );
    let died = false;
    proc.once("exit", () => {
      died = true;
    });
    await new Promise((r) => setTimeout(r, DISPLAY_SETTLE_MS));
    if (died) continue;
    log(`[browser] Xvfb :${n} (${width}x${height})`);
    return {
      value: `:${n}`,
      stop: () => {
        try {
          proc.kill("SIGTERM");
        } catch {
          // Already gone: nothing to stop.
        }
      },
    };
  }
  return null;
}

export interface BrowserProcessOptions {
  /** The profile directory, created when missing. */
  profileDir: string;
  width: number;
  height: number;
  /** The binary; discovered when omitted. */
  binary?: string;
  log?: (line: string) => void;
}

/**
 * A running browser, from the process side: where it draws (Xvfb when this machine has no
 * display of its own), where its DevTools endpoint is, and how to put it down again.
 */
export class BrowserProcess {
  private constructor(
    readonly binary: string,
    readonly endpoint: string,
    private readonly child: ChildProcess,
    private readonly display: Display,
    readonly profileDir: string,
    private readonly log: (line: string) => void,
  ) {}

  /** Starts one browser: display, profile, process, and waits for the DevTools endpoint. */
  static async start(options: BrowserProcessOptions): Promise<BrowserProcess> {
    const log = options.log ?? (() => {});
    const binary = options.binary ?? findBrowserBinary();
    if (binary === null) throw new Error("no Chromium or Chrome on this machine");

    const display = await ensureDisplay(options.width, options.height, log);
    if (display === null) {
      throw new Error("no display and no Xvfb: this machine cannot render a browser");
    }

    await mkdir(options.profileDir, { recursive: true });
    await clearSingletonFiles(options.profileDir);

    const child = spawn(
      binary,
      [
        // 0 asks the OS for a free port; the endpoint it prints is what we connect to, so two
        // servers on one machine can never fight over 9222.
        "--remote-debugging-port=0",
        `--user-data-dir=${options.profileDir}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-dev-shm-usage",
        // Chromium refuses to run as root without this, and a server commonly is root. It
        // removes Chromium's own process sandbox; the browser here only ever visits pages the
        // person asked for, in a profile of its own.
        "--no-sandbox",
        `--window-size=${options.width},${options.height}`,
        "--window-position=0,0",
        "about:blank",
      ],
      {
        env: { ...process.env, DISPLAY: display.value },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );

    try {
      const endpoint = await endpointOf(child);
      log(`[browser] ${binary} on ${display.value}`);
      return new BrowserProcess(binary, endpoint, child, display, options.profileDir, log);
    } catch (err) {
      child.kill("SIGKILL");
      display.stop();
      throw err;
    }
  }

  /** Whether this process is still up. */
  get running(): boolean {
    return this.child.exitCode === null && !this.child.killed;
  }

  /** Takes the browser down, then the display. Never throws: a stop that failed is a stop. */
  async stop(): Promise<void> {
    await endProcess(this.child);
    this.display.stop();
  }
}

/** Chromium prints `DevTools listening on ws://127.0.0.1:<port>/devtools/browser/<id>` on stderr. */
function endpointOf(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let seen = "";
    const timer = setTimeout(() => {
      reject(new Error(`the browser printed no DevTools endpoint within ${ENDPOINT_TIMEOUT_MS}ms`));
    }, ENDPOINT_TIMEOUT_MS);
    const finish = (err: Error | null, endpoint?: string): void => {
      clearTimeout(timer);
      child.stderr?.off("data", onData);
      child.off("exit", onExit);
      if (err !== null) reject(err);
      else resolve(endpoint as string);
    };
    const onData = (chunk: Buffer): void => {
      seen += chunk.toString();
      const match = /ws:\/\/[^\s]+/.exec(seen);
      if (match !== null) finish(null, match[0]);
    };
    const onExit = (code: number | null): void => {
      finish(new Error(`the browser exited with code ${code ?? "null"} before answering`));
    };
    child.stderr?.on("data", onData);
    child.once("exit", onExit);
  });
}

/** SIGTERM, wait, SIGKILL: a browser that ignores the first does not get to keep the profile. */
async function endProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const gone = new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    setTimeout(resolve, STOP_GRACE_MS);
  });
  try {
    child.kill("SIGTERM");
  } catch {
    return;
  }
  await gone;
  try {
    child.kill("SIGKILL");
  } catch {
    // Already gone.
  }
}

/**
 * Chromium's profile singletons, removed before every start: they are a lock and a socket, and
 * one left behind by a process that was killed makes the next browser hand its arguments to a
 * browser that no longer exists and exit. Only these three files: everything else in the
 * directory is the person's profile.
 */
async function clearSingletonFiles(profileDir: string): Promise<void> {
  for (const name of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    const file = path.join(profileDir, name);
    try {
      await access(file, constants.F_OK);
    } catch {
      continue;
    }
    await rm(file, { force: true, recursive: true });
  }
}
