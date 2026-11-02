/**
 * The server's browser: the address and viewport rules on their own, the routes over a fake
 * browser, and the two facts about the real thing that only an app boot can show — that the
 * platform actually wires it up, and that a server told not to run one says so instead of
 * failing.
 *
 * No Chromium is started here. What the routes do to a live browser is covered by the end-to-end
 * pass in this file's last suite, which is skipped when the machine has none.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { ServerBrowserInput, ServerBrowserStatus } from "../src/api/types.js";
import type { AppEnv } from "../src/auth/middleware.js";
import { handleError, normalizeError } from "../src/http/errors.js";
import { serverBrowserRoutes } from "../src/http/routes/server-browser.js";
import { ServerBrowser } from "../src/services/server-browser-service.js";
import type { ServerBrowserOutput } from "../src/server-browser/session.js";
import {
  clampViewport,
  normalizeAddress,
  MAX_VIEWPORT,
  MIN_VIEWPORT,
} from "../src/server-browser/session.js";
import { findBrowserBinary } from "../src/server-browser/process.js";
import { apiClient, createTestApp, loginAdmin } from "./helpers.js";
import type { TestApp } from "./helpers.js";

const IDLE: ServerBrowserStatus = { available: true, running: false, state: null };

/** A browser the routes can talk to without one existing: it records and answers. */
class FakeBrowser implements ServerBrowser {
  readonly calls: string[] = [];
  readonly inputs: ServerBrowserInput[][] = [];
  readonly navigations: string[] = [];
  readonly reloads: boolean[] = [];
  statusValue: ServerBrowserStatus = IDLE;
  private readonly viewers = new Set<(out: ServerBrowserOutput) => void>();

  status(): Promise<ServerBrowserStatus> {
    this.calls.push("status");
    return Promise.resolve(this.statusValue);
  }
  start(): Promise<ServerBrowserStatus> {
    this.calls.push("start");
    return Promise.resolve(this.statusValue);
  }
  stop(): Promise<ServerBrowserStatus> {
    this.calls.push("stop");
    return Promise.resolve(this.statusValue);
  }
  navigate(url: string): Promise<ServerBrowserStatus> {
    this.calls.push("navigate");
    this.navigations.push(url);
    return Promise.resolve(this.statusValue);
  }
  go(direction: "back" | "forward"): Promise<ServerBrowserStatus> {
    this.calls.push(`go:${direction}`);
    return Promise.resolve(this.statusValue);
  }
  reload(hard: boolean): Promise<ServerBrowserStatus> {
    this.calls.push("reload");
    this.reloads.push(hard);
    return Promise.resolve(this.statusValue);
  }
  resize(width: number, height: number): Promise<ServerBrowserStatus> {
    this.calls.push(`resize:${width}x${height}`);
    return Promise.resolve(this.statusValue);
  }
  input(events: readonly ServerBrowserInput[]): Promise<ServerBrowserStatus> {
    this.calls.push("input");
    this.inputs.push([...events]);
    return Promise.resolve(this.statusValue);
  }
  view(listener: (out: ServerBrowserOutput) => void): () => void {
    this.viewers.add(listener);
    return () => this.viewers.delete(listener);
  }
  /** Pushes one output to everyone watching, as a live session would. */
  emit(out: ServerBrowserOutput): void {
    for (const viewer of this.viewers) viewer(out);
  }
  get watchers(): number {
    return this.viewers.size;
  }
}

const ADMIN = { isAdmin: true } as never;

/** The route group alone, behind a middleware that injects the caller. */
function routeApp(browser: ServerBrowser, user: unknown = ADMIN) {
  const app = new Hono<AppEnv>();
  app.onError((err, c) => handleError(normalizeError(err), c));
  app.use("*", async (c, next) => {
    c.set("user", user as never);
    await next();
  });
  app.route("/api/server-browser", serverBrowserRoutes(browser));
  return app;
}

const errorOf = (body: unknown): { code: string; message: string } =>
  (body as { error: { code: string; message: string } }).error;

describe("normalizeAddress", () => {
  it("takes a bare host as https and keeps an explicit scheme", () => {
    expect(normalizeAddress("example.com")).toBe("https://example.com/");
    expect(normalizeAddress("example.com:8080/a?b=c")).toBe("https://example.com:8080/a?b=c");
    expect(normalizeAddress(" http://example.com/x ")).toBe("http://example.com/x");
  });

  it("refuses what is not a web address, and an empty one", () => {
    expect(normalizeAddress("")).toBeNull();
    expect(normalizeAddress("   ")).toBeNull();
    expect(normalizeAddress("file:///etc/passwd")).toBeNull();
    expect(normalizeAddress("javascript:alert(1)")).toBeNull();
    expect(normalizeAddress("about:blank")).toBeNull();
    // A colon in the host is read as a scheme, so this is not silently rescued into https.
    expect(normalizeAddress("http://")).toBeNull();
  });
});

describe("clampViewport", () => {
  it("holds a request between the smallest and largest page this will draw", () => {
    expect(clampViewport(1280, 800)).toEqual({ width: 1280, height: 800 });
    expect(clampViewport(1, 1)).toEqual(MIN_VIEWPORT);
    expect(clampViewport(99_999, 99_999)).toEqual(MAX_VIEWPORT);
    expect(clampViewport(640.6, 480.4)).toEqual({ width: 641, height: 480 });
  });
});

describe("findBrowserBinary", () => {
  it("prefers the environment's own binary", () => {
    expect(findBrowserBinary({ ADELIE_SERVER_BROWSER_BIN: "/opt/odd/chrome" })).toBe(
      "/opt/odd/chrome",
    );
    // A blank name is not a choice, it is an unset one.
    expect(findBrowserBinary({ ADELIE_SERVER_BROWSER_BIN: "  ", PATH: "" })).toBeNull();
  });

  it("finds nothing on a machine whose PATH has no browser", () => {
    expect(findBrowserBinary({ PATH: "/nonexistent-and-empty" })).toBeNull();
  });
});

describe("the server browser's routes", () => {
  let browser: FakeBrowser;
  let app: Hono<AppEnv>;

  beforeEach(() => {
    browser = new FakeBrowser();
    app = routeApp(browser);
  });

  const post = async (apiPath: string, body?: unknown): Promise<Response> =>
    app.request(apiPath, {
      method: "POST",
      headers: body === undefined ? {} : { "content-type": "application/json" },
      ...(body === undefined
        ? {}
        : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    });

  it("is an admin's tool: anyone else is refused before anything is started", async () => {
    const res = await routeApp(browser, { isAdmin: false } as never).request("/api/server-browser");
    expect(res.status).toBe(403);
    expect(errorOf(await res.json()).code).toBe("admin_required");
    expect(browser.calls).toEqual([]);
  });

  it("answers a read with what the browser is doing", async () => {
    browser.statusValue = {
      available: true,
      running: true,
      state: {
        url: "https://example.com/",
        title: "Example",
        loading: false,
        width: 1280,
        height: 800,
      },
    };
    const res = await app.request("/api/server-browser");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(browser.statusValue);
  });

  it("normalizes a navigation and refuses a non-web address", async () => {
    await post("/api/server-browser/navigate", { url: "example.com/x" });
    expect(browser.navigations).toEqual(["https://example.com/x"]);
    const bad = await post("/api/server-browser/navigate", { url: "file:///etc/passwd" });
    expect(bad.status).toBe(400);
    expect(errorOf(await bad.json()).code).toBe("invalid_url");
    expect((await post("/api/server-browser/navigate", {})).status).toBe(400);
    expect(browser.navigations).toHaveLength(1);
  });

  it("reloads without a body, and still refuses a malformed one", async () => {
    await expect(post("/api/server-browser/reload")).resolves.toMatchObject({ status: 200 });
    await post("/api/server-browser/reload", {});
    await post("/api/server-browser/reload", { hard: true });
    expect(browser.reloads).toEqual([false, false, true]);
    const malformed = await post("/api/server-browser/reload", "{not json");
    expect(malformed.status).toBe(400);
    expect(browser.reloads).toHaveLength(3);
  });

  it("takes a batch of input events, and refuses one that is not one", async () => {
    const events: ServerBrowserInput[] = [
      { type: "mouse", action: "down", x: 10, y: 20, button: "left" },
      { type: "wheel", x: 10, y: 20, deltaY: -120 },
      { type: "text", text: "你好" },
      { type: "key", action: "down", key: "Enter", keyCode: 13, text: "\r" },
    ];
    const ok = await post("/api/server-browser/input", { events });
    expect(ok.status).toBe(200);
    expect(browser.inputs).toEqual([events]);

    for (const bad of [
      { events: [] },
      { events: "nope" },
      { events: [{ type: "mouse", action: "wiggle", x: 1, y: 2 }] },
      { events: [{ type: "mouse", action: "move", x: -1, y: 0 }] },
      { events: [{ type: "wheel", x: 0, y: 0, deltaY: "lots" }] },
      { events: [{ type: "text" }] },
      { events: [{ type: "telepathy" }] },
      { events: [{ type: "key", action: "down" }] },
    ]) {
      const res = await post("/api/server-browser/input", bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect(browser.inputs).toHaveLength(1);
  });

  it("resizes to what the viewer's box measured", async () => {
    await post("/api/server-browser/resize", { width: 1024, height: 768 });
    expect(browser.calls).toContain("resize:1024x768");
    expect((await post("/api/server-browser/resize", { width: "wide", height: 768 })).status).toBe(
      400,
    );
  });

  it("streams frames as MJPEG, dropping the stream when the browser goes away", async () => {
    const res = await app.request("/api/server-browser/frames");
    expect(res.headers.get("content-type")).toBe(
      "multipart/x-mixed-replace; boundary=adelie-browser-frame",
    );
    expect(browser.watchers).toBe(1);

    const reader = res.body!.getReader();
    browser.emit({ kind: "frame", jpeg: Buffer.from([1, 2, 3, 4]) });
    const first = await reader.read();
    const text = Buffer.from(first.value!).toString("latin1");
    expect(text).toContain("--adelie-browser-frame");
    expect(text).toContain("Content-Type: image/jpeg");
    expect(text).toContain("Content-Length: 4");

    browser.emit({ kind: "closed", reason: "stopped" });
    await expect(reader.read()).resolves.toMatchObject({ done: true });
  });

  it("forgets a viewer whose request is cancelled", async () => {
    const res = await app.request("/api/server-browser/frames");
    expect(browser.watchers).toBe(1);
    await res.body!.cancel();
    expect(browser.watchers).toBe(0);
  });

  it("writes a frame again when nothing follows it, so the viewer is not left one behind", async () => {
    const res = await app.request("/api/server-browser/frames");
    const reader = res.body!.getReader();
    browser.emit({ kind: "frame", jpeg: Buffer.from([7, 7, 7]) });

    const first = Buffer.from((await reader.read()).value!).toString("latin1");
    expect(first).toContain("Content-Length: 3");
    // The viewer's image only takes up a part once the next one begins, so a frame that was the
    // last of its burst has to be sent twice or it is never shown at all.
    const again = Buffer.from((await reader.read()).value!).toString("latin1");
    expect(again).toContain("Content-Length: 3");
    expect(again.endsWith("--adelie-browser-frame\r\n")).toBe(true);
  });

  it("holds the newest frame for a viewer that is behind instead of losing it", async () => {
    const res = await app.request("/api/server-browser/frames");
    const reader = res.body!.getReader();
    // Three frames nobody has read yet: the viewer is behind by more than the one it can hold.
    browser.emit({ kind: "frame", jpeg: Buffer.from([1]) });
    browser.emit({ kind: "frame", jpeg: Buffer.from([2, 2]) });
    browser.emit({ kind: "frame", jpeg: Buffer.from([3, 3, 3]) });

    const first = Buffer.from((await reader.read()).value!).toString("latin1");
    expect(first).toContain("Content-Length: 1");
    // The middle frame is the one a lagging viewer loses; the newest is the one it must not:
    // a picture left one repaint behind is how a click looks like nothing happened.
    await new Promise((resolve) => setTimeout(resolve, 60));
    const second = Buffer.from((await reader.read()).value!).toString("latin1");
    expect(second).toContain("Content-Length: 3");
  });
});

describe("the server browser in a real app", () => {
  let app: TestApp;

  afterEach(async () => {
    await app.cleanup();
  });

  it("is wired into the platform, and says why it is off when it is", async () => {
    const previous = process.env["ADELIE_SERVER_BROWSER"];
    process.env["ADELIE_SERVER_BROWSER"] = "off";
    try {
      app = await createTestApp();
      const api = apiClient(app.app, (await loginAdmin(app.app)).cookie);
      const res = await api.get("/api/server-browser");
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        available: false,
        reason: "switched off by ADELIE_SERVER_BROWSER=off",
        running: false,
        state: null,
      });
      // Nothing may be started while it is unavailable — a hand-made POST says why, and starts
      // nothing.
      const started = await api.post("/api/server-browser/start");
      expect(started.status).toBe(503);
      expect(errorOf(await started.json())).toEqual({
        code: "browser_unavailable",
        message: "switched off by ADELIE_SERVER_BROWSER=off",
      });
    } finally {
      if (previous === undefined) delete process.env["ADELIE_SERVER_BROWSER"];
      else process.env["ADELIE_SERVER_BROWSER"] = previous;
    }
  });
});

/**
 * The real thing, end to end: a browser this process starts on a virtual display, a page served
 * from a socket in this test, the picture a viewer reads off the MJPEG stream, and a click that
 * reaches the page. Skipped where the machine has no browser to run — what is under test here is
 * the wiring, not the machine.
 */
const binary = findBrowserBinary();
const maybe = binary === null ? describe.skip : describe;

maybe("a browser the server really renders", () => {
  let app: TestApp | null = null;
  let server: Server | null = null;
  let origin = "";
  let clicked = "";

  beforeEach(async () => {
    clicked = "";
    // A page of our own over a socket in this process: the test never needs the network, and the
    // address it navigates to is an ordinary http one, which is all the route accepts.
    server = createServer((req, res) => {
      if (req.url === "/clicked") {
        clicked = "yes";
        res.writeHead(204).end();
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(
        [
          "<title>hello from the server browser</title>",
          '<h1 id="hello">你好</h1>',
          // Pinned to the corner at a size of its own, so the click below lands on it whatever the
          // text metrics on this machine turn out to be.
          '<a id="hit" href="/clicked" style="position:fixed;left:0;top:0;width:300px;height:120px">press me</a>',
        ].join(""),
      );
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    origin = `http://127.0.0.1:${address.port}`;
    app = await createTestApp();
  });

  afterEach(async () => {
    // Stopped through the route, not left to the App's teardown: the profile directory is about to
    // be removed and Chromium holding files in it is how cleanup starts failing.
    if (app !== null) {
      const api = apiClient(app.app, (await loginAdmin(app.app)).cookie);
      await Promise.resolve(api.post("/api/server-browser/stop")).catch(() => {});
      await app.cleanup();
    }
    if (server !== null) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    app = null;
    server = null;
  });

  it("starts, loads an address, and hands a viewer its picture", async () => {
    const api = apiClient(app!.app, (await loginAdmin(app!.app)).cookie);
    const started = await api.post("/api/server-browser/start");
    expect(started.status).toBe(200);
    await expect(started.json()).resolves.toMatchObject({ available: true, running: true });

    // Subscribe before navigating: a viewer is what the screencast is started for.
    const frames = await api.get("/api/server-browser/frames");
    expect(frames.headers.get("content-type")).toContain("multipart/x-mixed-replace");

    await api.post("/api/server-browser/navigate", { url: origin });
    await waitFor(
      async () => (await statusOf(api)).state?.title === "hello from the server browser",
    );

    const jpeg = await firstFrame(frames, 30_000);
    // A real JPEG: the browser rendered the page, and this is its pixels.
    expect(jpeg.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));

    // A click at the link, in the page's own coordinates. The picture is 1280x800 by default, and
    // the link sits at the top left of it.
    await api.post("/api/server-browser/input", {
      events: [
        { type: "mouse", action: "down", x: 30, y: 45, button: "left" },
        { type: "mouse", action: "up", x: 30, y: 45, button: "left" },
      ],
    });
    await waitFor(async () => clicked === "yes");
  }, 120_000);
});

/** The browser's own view of itself, as the route reports it. */
async function statusOf(api: ReturnType<typeof apiClient>): Promise<ServerBrowserStatus> {
  return (await (await api.get("/api/server-browser")).json()) as ServerBrowserStatus;
}

/** Polls until `done`, or fails: everything here is another process's timing, not an assertion. */
async function waitFor(done: () => Promise<boolean>, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await done()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`nothing happened within ${timeoutMs}ms`);
}

/** The first whole JPEG in the MJPEG stream — one part's header, then its bytes. */
async function firstFrame(res: Response, timeoutMs: number): Promise<Buffer> {
  const reader = res.body!.getReader();
  const timer = setTimeout(() => void reader.cancel(), timeoutMs);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error("the frame stream ended before a picture arrived");
      const found = Buffer.from(value!).indexOf(Buffer.from([0xff, 0xd8]));
      if (found !== -1) return Buffer.from(value!).subarray(found);
    }
  } finally {
    clearTimeout(timer);
  }
}
