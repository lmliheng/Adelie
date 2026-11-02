/**
 * One page, driven over CDP: where it is, how big it is drawn, what it looks like right now, and
 * the four things a viewer can do to it (navigate, go back/forward, reload, and input).
 *
 * One page and not a tab strip: what this exists for is watching a page the person cannot reach
 * from their own machine, and a second tab is the first thing that turns into a window manager.
 * The several tabs the desktop app's built-in browser has stay there.
 *
 * The picture is `Page.startScreencast`: the browser sends a JPEG whenever the page changes, so a
 * page standing still costs nothing and a playing video costs what it is worth watching. Frames
 * go out only while somebody is subscribed — a session with no viewer runs no screencast at all.
 *
 * Everything the viewer needs to know besides the pixels is the state: address, title, whether it
 * is still loading. That comes from the browser's own events (target info changes, load events),
 * never from polling or from injecting scripts into the page.
 */
import type { ServerBrowserInput, ServerBrowserState } from "../api/types.js";
import { CdpConnection, connectCdp } from "./cdp.js";
import type { CdpEvent } from "./cdp.js";
import type { BrowserProcess } from "./process.js";

/** The viewport a viewer asks for is clamped to this, so one page cannot eat a server. */
export const MIN_VIEWPORT = { width: 320, height: 240 };
export const MAX_VIEWPORT = { width: 1920, height: 1200 };
/** JPEG quality and per-frame cap for the screencast: a picture to watch, not a screenshot. */
const FRAME_QUALITY = 55;

export type ServerBrowserOutput =
  | { kind: "frame"; jpeg: Buffer }
  | { kind: "state"; state: ServerBrowserState }
  /**
   * The session is over: the browser went away, or somebody stopped it. The viewer's stream ends
   * with this rather than going quiet, so a page that was watching reconnects and learns where
   * the browser went instead of holding its last frame forever.
   */
  | { kind: "closed"; reason: string };

export interface ServerBrowserSessionDeps {
  width: number;
  height: number;
  log?: (line: string) => void;
}

/** The address to actually load: a bare host is https, and anything else must be a web address. */
export function normalizeAddress(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  // A scheme is one only when `//` follows it: `example.com:8080` is a host and a port, and
  // reading that colon as a scheme is how a bare address carrying a port gets silently lost.
  const addressed = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(addressed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Clamps a requested viewport into what this will render. */
export function clampViewport(width: number, height: number): { width: number; height: number } {
  const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, Math.round(value)));
  return {
    width: clamp(width, MIN_VIEWPORT.width, MAX_VIEWPORT.width),
    height: clamp(height, MIN_VIEWPORT.height, MAX_VIEWPORT.height),
  };
}

export class ServerBrowserSession {
  private listeners = new Set<(out: ServerBrowserOutput) => void>();
  private targetId = "";
  private sessionId = "";
  private unsubscribes: Array<() => void> = [];
  private table: ServerBrowserState;
  private closed = false;
  private streaming = false;
  private crashReason: string | null = null;

  private constructor(
    private readonly cdp: CdpConnection,
    private readonly log: (line: string) => void,
    initial: ServerBrowserState,
  ) {
    this.table = initial;
  }

  /** Attaches to the browser's page target and starts following its state. */
  static async attach(
    cdp: CdpConnection,
    deps: ServerBrowserSessionDeps,
  ): Promise<ServerBrowserSession> {
    const log = deps.log ?? (() => {});
    const { targetInfos } = (await cdp.call("Target.getTargets")) as {
      targetInfos?: Array<{ targetId?: string; type?: string; url?: string; title?: string }>;
    };
    const page = (targetInfos ?? []).find(
      (t) => t.type === "page" && typeof t.targetId === "string",
    );
    if (page?.targetId === undefined) throw new Error("the browser has no page to show");

    const { sessionId } = (await cdp.call("Target.attachToTarget", {
      targetId: page.targetId,
      flatten: true,
    })) as { sessionId?: string };
    if (typeof sessionId !== "string") throw new Error("the browser refused to attach to its page");

    const viewport = clampViewport(deps.width, deps.height);
    const session = new ServerBrowserSession(cdp, log, {
      url: page.url ?? "",
      title: page.title ?? "",
      loading: false,
      width: viewport.width,
      height: viewport.height,
    });
    session.targetId = page.targetId;
    session.sessionId = sessionId;

    await cdp.call("Page.enable", {}, sessionId);
    await cdp.call("Target.setDiscoverTargets", { discover: true });
    await session.applyViewport(viewport.width, viewport.height);

    session.unsubscribes.push(cdp.onEvent((event) => session.receive(event)));
    cdp.onClose((err) => session.close(err ?? new Error("the browser went away")));
    return session;
  }

  state(): ServerBrowserState {
    return { ...this.table };
  }

  /** Loads an address; `url` is normalized first and a non-web one is refused by the caller. */
  async navigate(url: string): Promise<void> {
    this.table = { ...this.table, url, loading: true };
    this.publishState();
    await this.cdp.call("Page.navigate", { url }, this.sessionId);
  }

  /** Whether there is anywhere to go back to, as far as the page's own history knows. */
  async go(direction: "back" | "forward"): Promise<void> {
    const history = (await this.cdp.call("Page.getNavigationHistory", {}, this.sessionId)) as {
      currentIndex?: number;
      entries?: Array<{ id?: number }>;
    };
    const index = history.currentIndex ?? 0;
    const entry = (history.entries ?? [])[direction === "back" ? index - 1 : index + 1];
    if (entry?.id === undefined) return;
    await this.cdp.call("Page.navigateToHistoryEntry", { entryId: entry.id }, this.sessionId);
  }

  async reload(hard: boolean): Promise<void> {
    this.table = { ...this.table, loading: true };
    this.publishState();
    await this.cdp.call("Page.reload", { ignoreCache: hard }, this.sessionId);
  }

  /** Draws the page at another size, which is what a viewer's box just became. */
  async resize(width: number, height: number): Promise<void> {
    const viewport = clampViewport(width, height);
    if (viewport.width === this.table.width && viewport.height === this.table.height) return;
    await this.applyViewport(viewport.width, viewport.height);
  }

  /** One input event, from the viewer's pointer or keyboard. */
  async input(event: ServerBrowserInput): Promise<void> {
    if (this.crashReason !== null) throw new Error(`the page crashed (${this.crashReason})`);
    if (event.type === "mouse") {
      await this.cdp.call(
        "Input.dispatchMouseEvent",
        {
          type:
            event.action === "move"
              ? "mouseMoved"
              : event.action === "down"
                ? "mousePressed"
                : "mouseReleased",
          x: event.x,
          y: event.y,
          button: event.button ?? "left",
          buttons: event.buttons ?? (event.action === "down" ? 1 : 0),
          clickCount: event.action === "move" ? 0 : (event.clickCount ?? 1),
        },
        this.sessionId,
      );
      return;
    }
    if (event.type === "wheel") {
      await this.cdp.call(
        "Input.dispatchMouseEvent",
        {
          type: "mouseWheel",
          x: event.x,
          y: event.y,
          button: "none",
          deltaX: event.deltaX ?? 0,
          deltaY: event.deltaY,
        },
        this.sessionId,
      );
      return;
    }
    if (event.type === "text") {
      await this.cdp.call("Input.insertText", { text: event.text }, this.sessionId);
      return;
    }
    await this.cdp.call(
      "Input.dispatchKeyEvent",
      {
        type: event.action === "down" ? "keyDown" : "keyUp",
        key: event.key,
        ...(event.code === undefined ? {} : { code: event.code }),
        ...(event.keyCode === undefined ? {} : { windowsVirtualKeyCode: event.keyCode }),
        ...(event.action === "down" && event.text !== undefined ? { text: event.text } : {}),
      },
      this.sessionId,
    );
  }

  /** Frames and state changes, for as long as the returned unsubscribe is not called. */
  subscribe(listener: (out: ServerBrowserOutput) => void): () => void {
    this.listeners.add(listener);
    listener({ kind: "state", state: this.state() });
    void this.startStreaming();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) void this.stopStreaming();
    };
  }

  /** Whether this session is still usable (the browser it drives is reachable). */
  get alive(): boolean {
    return !this.closed && this.cdp.alive;
  }

  async close(reason?: Error): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (reason !== undefined) this.log(`[browser] session closed: ${reason.message}`);
    this.emit({ kind: "closed", reason: reason?.message ?? "closed" });
    for (const off of this.unsubscribes) off();
    this.unsubscribes = [];
    this.listeners.clear();
    this.cdp.close();
  }

  private async applyViewport(width: number, height: number): Promise<void> {
    await this.cdp.call(
      "Emulation.setDeviceMetricsOverride",
      { width, height, deviceScaleFactor: 1, mobile: false },
      this.sessionId,
    );
    this.table = { ...this.table, width, height };
    this.publishState();
  }

  private async startStreaming(): Promise<void> {
    if (this.streaming || this.closed) return;
    this.streaming = true;
    try {
      await this.cdp.call(
        "Page.startScreencast",
        {
          format: "jpeg",
          quality: FRAME_QUALITY,
          maxWidth: this.table.width,
          maxHeight: this.table.height,
          everyNthFrame: 1,
        },
        this.sessionId,
      );
    } catch (err) {
      this.streaming = false;
      this.log(`[browser] screencast refused: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async stopStreaming(): Promise<void> {
    if (!this.streaming) return;
    this.streaming = false;
    try {
      await this.cdp.call("Page.stopScreencast", {}, this.sessionId);
    } catch {
      // The browser is busy or gone; the next subscriber starts it again.
    }
  }

  private receive(event: CdpEvent): void {
    if (this.closed) return;
    switch (event.method) {
      case "Page.screencastFrame": {
        const frameSession = event.params["sessionId"];
        void this.cdp
          .call("Page.screencastFrameAck", { sessionId: frameSession }, this.sessionId)
          .catch(() => {});
        const data = event.params["data"];
        if (typeof data === "string") {
          this.emit({ kind: "frame", jpeg: Buffer.from(data, "base64") });
        }
        return;
      }
      case "Target.targetInfoChanged": {
        const info = event.params["targetInfo"] as { targetId?: string; url?: string } | undefined;
        if (info?.targetId !== this.targetId || typeof info.url !== "string") return;
        // The address only: the target's own title lags the document's (it keeps the host name a
        // page commits under), so the title comes from the history entry instead — see
        // refreshTitle().
        if (info.url === this.table.url) return;
        this.table = { ...this.table, url: info.url };
        this.publishState();
        return;
      }
      case "Page.frameNavigated": {
        const frame = event.params["frame"] as
          { id?: string; url?: string; parentId?: string } | undefined;
        if (frame === undefined || frame.parentId !== undefined || typeof frame.url !== "string")
          return;
        // The main frame's id is what the two loading events below are filtered by: a page full
        // of iframes would otherwise keep resetting the state line as they come and go.
        if (typeof frame.id === "string") this.frameId = frame.id;
        this.crashReason = null;
        this.table = { ...this.table, url: frame.url, loading: true };
        this.publishState();
        void this.refreshTitle();
        return;
      }
      case "Page.frameStoppedLoading": {
        if (event.params["frameId"] !== this.frameId) return;
        this.setLoading(false);
        void this.refreshTitle();
        return;
      }
      case "Page.frameStartedLoading": {
        if (event.params["frameId"] !== this.frameId) return;
        this.setLoading(true);
        return;
      }
      case "Page.loadEventFired": {
        this.setLoading(false);
        void this.refreshTitle();
        return;
      }
      case "Inspector.targetCrashed": {
        this.crashReason = "crashed";
        this.table = { ...this.table, loading: false };
        this.publishState();
        return;
      }
      default:
        return;
    }
  }

  /** The main frame's id, as the browser reports it; "" until the first navigation. */
  private frameId = "";

  /**
   * The page's own title, read from the history entry it is on. The target's own title is not
   * it: a page that commits with a `<title>` still reports its host name there until something
   * else moves it, and the history entry is what the browser's own window title comes from. No
   * script is run in the page for this — the title is asked of the browser, not of the document.
   */
  private async refreshTitle(): Promise<void> {
    try {
      const history = (await this.cdp.call("Page.getNavigationHistory", {}, this.sessionId)) as {
        currentIndex?: number;
        entries?: Array<{ title?: string }>;
      };
      const title = (history.entries ?? [])[history.currentIndex ?? -1]?.title ?? "";
      if (title === this.table.title) return;
      this.table = { ...this.table, title };
      this.publishState();
    } catch {
      // The page is mid-navigation or the browser is gone; the title it already shows stands.
    }
  }

  /** Loading only means something the first time it changes: a state line per event would flood. */
  private setLoading(loading: boolean): void {
    if (this.table.loading === loading) return;
    this.table = { ...this.table, loading };
    this.publishState();
  }

  private publishState(): void {
    this.emit({ kind: "state", state: this.state() });
  }

  private emit(out: ServerBrowserOutput): void {
    for (const listener of this.listeners) {
      try {
        listener(out);
      } catch {
        // A viewer that threw while being written to is dropped by its own transport, not here.
      }
    }
  }
}

/** Starts the browser and attaches a session to it. */
export async function openSession(
  process: BrowserProcess,
  deps: ServerBrowserSessionDeps,
): Promise<ServerBrowserSession> {
  const cdp = await connectCdp(process.endpoint);
  return ServerBrowserSession.attach(cdp, deps);
}
