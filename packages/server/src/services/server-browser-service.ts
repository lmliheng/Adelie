/**
 * The server's own browser, as the rest of the server reaches it: one Chromium on a virtual
 * display, one page, and a frame stream a viewer can subscribe to.
 *
 * Where this sits: the built-in browser (builtin-browser/) belongs to the desktop app, because
 * its pages ARE `<webview>` elements of the app's window — a server started any other way has no
 * window and therefore no browser at all (`not_desktop`). This is the other half of that: a
 * browser the server itself renders, for exactly the deployments that cannot have the desktop
 * one — a Linux box reached over the network.
 *
 * Lifetime: nothing is spawned until somebody asks (a Start, or a viewer opening the page), the
 * profile lives in the data root so sign-ins survive a restart, and one browser serves every
 * viewer. A browser this process started is this process's to stop.
 *
 * Unavailable rather than broken where it cannot work: no Chromium on the machine, or
 * ADELIE_SERVER_BROWSER=off, means `available: false` with the reason, and no route ever starts
 * a process then.
 */
import path from "node:path";
import { Component, Interface, Use } from "@adelie/core/kernel";
import type { ClassCtx } from "@adelie/core/kernel";
import type { ServerBrowserInput, ServerBrowserStatus } from "../api/types.js";
import type { Config } from "../hmr/capabilities.js";
import { HttpError } from "../http/errors.js";
import { BrowserProcess, findBrowserBinary } from "../server-browser/process.js";
import { openSession } from "../server-browser/session.js";
import type { ServerBrowserOutput, ServerBrowserSession } from "../server-browser/session.js";

/** The page size a viewer gets before it asks for its own. */
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
/** The profile directory inside the data root: the person's sign-ins, kept across restarts. */
const PROFILE_DIRNAME = "browser-profile";

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** One viewer's subscription, from the moment it arrives to the session it ends up on. */
interface Viewer {
  readonly listener: (out: ServerBrowserOutput) => void;
  /** Set once the session is up; null while the browser is still starting. */
  off: (() => void) | null;
}

/** The mechanism the routes and the frame transport both use. */
@Interface()
export abstract class ServerBrowser {
  abstract status(): Promise<ServerBrowserStatus>;
  /** Starts (or restarts) the browser; a no-op when it is already up. */
  abstract start(): Promise<ServerBrowserStatus>;
  /** Stops it, taking the page and the display down with it. */
  abstract stop(): Promise<ServerBrowserStatus>;
  abstract navigate(url: string): Promise<ServerBrowserStatus>;
  abstract go(direction: "back" | "forward"): Promise<ServerBrowserStatus>;
  abstract reload(hard: boolean): Promise<ServerBrowserStatus>;
  abstract resize(width: number, height: number): Promise<ServerBrowserStatus>;
  abstract input(events: readonly ServerBrowserInput[]): Promise<ServerBrowserStatus>;
  /**
   * Everything a viewer needs to see and follow the page: frames, every state change, and one
   * `closed` when the browser goes away. Starts the browser when it is not up. The returned
   * unsubscribe takes this viewer off, and the screencast stops once the last one is gone.
   */
  abstract view(listener: (out: ServerBrowserOutput) => void): () => void;
}

@Component()
export class ServerBrowserService implements ServerBrowser {
  @Use() private readonly config!: Config;
  /** Environment to read ADELIE_SERVER_BROWSER from; a test wires its own. */
  private env: Record<string, string | undefined> = process.env;
  private process: BrowserProcess | null = null;
  private session: ServerBrowserSession | null = null;
  private starting: Promise<ServerBrowserSession> | null = null;
  private readonly viewers = new Set<Viewer>();

  /**
   * The browser is this process's child, so it goes down with the App: a hot swap hands the
   * profile to the next generation's browser instead of leaving two of them on one display, and a
   * stopped server leaves no Chromium behind.
   */
  setup({ effect }: ClassCtx): void {
    effect(() => {
      void this.shutdown("the server is going down");
    });
  }

  async status(): Promise<ServerBrowserStatus> {
    const why = this.unavailableReason();
    if (why !== null) return { available: false, reason: why, running: false, state: null };
    if (!this.running()) return { available: true, running: false, state: null };
    return { available: true, running: true, state: this.session?.state() ?? null };
  }

  async start(): Promise<ServerBrowserStatus> {
    await this.ensure();
    return this.status();
  }

  async stop(): Promise<ServerBrowserStatus> {
    await this.shutdown("stopped");
    return this.status();
  }

  async navigate(url: string): Promise<ServerBrowserStatus> {
    const session = await this.ensure();
    await session.navigate(url);
    return this.status();
  }

  async go(direction: "back" | "forward"): Promise<ServerBrowserStatus> {
    const session = await this.ensure();
    await session.go(direction);
    return this.status();
  }

  async reload(hard: boolean): Promise<ServerBrowserStatus> {
    const session = await this.ensure();
    await session.reload(hard);
    return this.status();
  }

  async resize(width: number, height: number): Promise<ServerBrowserStatus> {
    const session = await this.ensure();
    await session.resize(width, height);
    return this.status();
  }

  async input(events: readonly ServerBrowserInput[]): Promise<ServerBrowserStatus> {
    const session = await this.ensure();
    for (const event of events) await session.input(event);
    return this.status();
  }

  view(listener: (out: ServerBrowserOutput) => void): () => void {
    const viewer: Viewer = { listener, off: null };
    this.viewers.add(viewer);
    // Opening the page is the same act as pressing Start, so the browser is started behind the
    // viewer's back rather than asking for a second press.
    void this.ensure()
      .then((session) => {
        if (!this.viewers.has(viewer)) return;
        viewer.off = session.subscribe(listener);
      })
      .catch((err: unknown) => {
        this.viewers.delete(viewer);
        listener({ kind: "closed", reason: messageOf(err) });
      });
    return () => {
      this.viewers.delete(viewer);
      viewer.off?.();
      viewer.off = null;
    };
  }

  /** Whether a browser is up and its page still reachable. */
  private running(): boolean {
    return this.session !== null && this.session.alive && (this.process?.running ?? false);
  }

  private unavailableReason(): string | null {
    if (this.env["ADELIE_SERVER_BROWSER"] === "off") {
      return "switched off by ADELIE_SERVER_BROWSER=off";
    }
    if (findBrowserBinary(this.env) === null) {
      return "no Chromium or Chrome on this machine (name one with ADELIE_SERVER_BROWSER_BIN)";
    }
    return null;
  }

  /** The live session, starting the browser when it is not up. One start at a time. */
  private ensure(): Promise<ServerBrowserSession> {
    const reason = this.unavailableReason();
    // A 503 with the reason rather than a bare failure: "this machine has no Chromium" is a fact
    // about the deployment, and the panel shows it as one (see the routes and the web page).
    if (reason !== null) {
      return Promise.reject(new HttpError(503, "browser_unavailable", reason));
    }
    if (this.running()) return Promise.resolve(this.session as ServerBrowserSession);
    this.starting ??= this.boot().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async boot(): Promise<ServerBrowserSession> {
    await this.shutdown("restarting");
    const binary = findBrowserBinary(this.env) ?? undefined;
    const process0 = await BrowserProcess.start({
      profileDir: path.join(this.config.root, PROFILE_DIRNAME),
      width: DEFAULT_VIEWPORT.width,
      height: DEFAULT_VIEWPORT.height,
      ...(binary === undefined ? {} : { binary }),
      log: (line) => this.log(line),
    });
    let session: ServerBrowserSession;
    try {
      session = await openSession(process0, {
        width: DEFAULT_VIEWPORT.width,
        height: DEFAULT_VIEWPORT.height,
        log: (line) => this.log(line),
      });
    } catch (err) {
      await process0.stop();
      throw err;
    }
    this.process = process0;
    this.session = session;
    // Whoever was already watching gets moved onto the new page — a restart must not leave the
    // panel showing the last frame of a browser that no longer exists.
    for (const viewer of this.viewers) viewer.off = session.subscribe(viewer.listener);
    return session;
  }

  private async shutdown(reason: string): Promise<void> {
    const session = this.session;
    const process0 = this.process;
    this.session = null;
    this.process = null;
    // The viewers are told through the session's own subscribers, so a browser that died on its
    // own closes the streams too, not only a requested stop.
    if (session !== null) await session.close(new Error(reason));
    if (process0 !== null) await process0.stop();
    for (const viewer of this.viewers) viewer.off = null;
  }

  private log(line: string): void {
    console.warn(line);
  }
}
