/**
 * The server browser's routes: an admin's, because it spawns a process on the server and the
 * profile it fills in is shared by every Project on it — the same call as the plugin directory.
 *
 * GET    /api/server-browser            — what the browser is doing, and whether it can run here
 * POST   /api/server-browser/start      — start (or restart) it
 * POST   /api/server-browser/stop       — stop it
 * POST   /api/server-browser/navigate   — go to an address (a bare host is https)
 * POST   /api/server-browser/back|forward|reload
 * POST   /api/server-browser/resize     — draw the page at another size (a viewer's box)
 * POST   /api/server-browser/input      — a batch of input events
 * GET    /api/server-browser/frames     — the picture, as a live MJPEG stream
 *
 * The picture is `multipart/x-mixed-replace`, which is what an `<img>` renders natively: the
 * page needs no canvas, no frame decoder and no socket, and the browser's own image pipeline
 * does the rasterizing. Frames are dropped rather than buffered when the viewer falls behind —
 * a lagging viewer wants the newest picture, not a backlog of old ones.
 */
import { Hono, type Context } from "hono";
import type { ServerBrowserInput, ServerBrowserStatus } from "../../api/types.js";
import { HttpError } from "../errors.js";
import type { AppEnv } from "../../auth/middleware.js";
import { readJson, requireString } from "../validate.js";
import { Bind, Component, Use } from "@adelie/core/kernel";
import type { ServerBrowser } from "../../services/server-browser-service.js";
import { normalizeAddress } from "../../server-browser/session.js";

/** The MJPEG boundary. One constant: the client never sees it, the `<img>` parses it. */
const BOUNDARY = "adelie-browser-frame";
/** How long a wedged browser may keep a request open before the route gives up on it. */
const STATUS_TIMEOUT_MS = 45_000;
/**
 * How long a written frame waits for the next one before it is written again. Frames that come
 * closer together than this are a page in motion, and the viewer is following it anyway.
 */
const FRAME_COMMIT_MS = 150;

/**
 * The MJPEG stream's parts, as they are handed to the transport: the headers, the JPEG, and the
 * boundary line that CLOSES this part.
 *
 * The boundary goes out with the frame it closes, not in front of the next one. A multipart parser
 * (the browser's, for the `<img>` pointed here) cannot call a part finished until it sees the line
 * after it, so a boundary that only arrives with the following frame leaves the picture one frame
 * behind — and on a page that has just stopped changing, the frame that had arrived is the one
 * that never appears. A click that painted once then looks like it did nothing. The bytes are the
 * same as they would be either way; what changes is when each one is written.
 */
function frameParts(): (jpeg: Buffer) => Uint8Array {
  // The first part opens the stream with its own boundary; every later one continues after the
  // boundary this closes with, so nothing is repeated and nothing is left out.
  let opened = false;
  return (jpeg) => {
    const lead = opened ? "" : `--${BOUNDARY}\r\n`;
    opened = true;
    return Buffer.concat([
      Buffer.from(
        `${lead}Content-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`,
        "utf8",
      ),
      jpeg,
      Buffer.from(`\r\n--${BOUNDARY}\r\n`, "utf8"),
    ]);
  };
}

/** One input event off the wire, checked: the browser is given only well-formed events. */
function readInputEvent(raw: unknown): ServerBrowserInput {
  if (typeof raw !== "object" || raw === null)
    throw new HttpError(400, "bad_request", "not an input event");
  const e = raw as Record<string, unknown>;
  const type = e["type"];
  if (type === "mouse") {
    const action = e["action"];
    if (action !== "move" && action !== "down" && action !== "up") {
      throw new HttpError(400, "bad_request", "bad mouse action");
    }
    const button = e["button"];
    if (button !== undefined && button !== "left" && button !== "middle" && button !== "right") {
      throw new HttpError(400, "bad_request", "bad mouse button");
    }
    return {
      type: "mouse",
      action,
      x: coordinate(e["x"]),
      y: coordinate(e["y"]),
      ...(button === undefined ? {} : { button }),
      ...(e["buttons"] === undefined ? {} : { buttons: bitmask(e["buttons"]) }),
      ...(e["clickCount"] === undefined ? {} : { clickCount: coordinate(e["clickCount"]) }),
    };
  }
  if (type === "wheel") {
    return {
      type: "wheel",
      x: coordinate(e["x"]),
      y: coordinate(e["y"]),
      deltaY: amount(e["deltaY"]),
      ...(e["deltaX"] === undefined ? {} : { deltaX: amount(e["deltaX"]) }),
    };
  }
  if (type === "text") {
    return { type: "text", text: requireString(e, "text", { label: "text", maxLen: 10_000 }) };
  }
  if (type === "key") {
    const action = e["action"];
    if (action !== "down" && action !== "up")
      throw new HttpError(400, "bad_request", "bad key action");
    return {
      type: "key",
      action,
      key: requireString(e, "key", { label: "key", maxLen: 64 }),
      ...(typeof e["code"] === "string" ? { code: e["code"] } : {}),
      ...(e["keyCode"] === undefined ? {} : { keyCode: coordinate(e["keyCode"]) }),
      ...(typeof e["text"] === "string" ? { text: e["text"] } : {}),
    };
  }
  throw new HttpError(400, "bad_request", "unknown input event");
}

/** A coordinate or count: a finite, non-negative, half-pixel-precise number. */
function coordinate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new HttpError(400, "bad_request", "bad coordinate");
  }
  return Math.round(value * 100) / 100;
}

/** A wheel delta: finite, and allowed to be negative (that is scrolling up). */
function amount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpError(400, "bad_request", "bad wheel delta");
  }
  return value;
}

/** Which buttons are held: an integer bitmask (left 1, right 2, middle 4), so 0 to 7. */
function bitmask(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 7) {
    throw new HttpError(400, "bad_request", "bad mouse buttons");
  }
  return value;
}

/**
 * An OPTIONAL JSON body: a request that sends none, or an empty one, reads as `{}` — a plain
 * reload is the common case here and sending no body is not a mistake. Text that IS there but
 * does not parse is still a 400, so a caller with a typo is told rather than silently ignored.
 */
async function readOptionalJson(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  if ((await c.req.text()).trim() === "") return {};
  return readJson(c);
}

export function serverBrowserRoutes(browser: ServerBrowser): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    if (!c.var.user.isAdmin) {
      throw new HttpError(403, "admin_required", "Only an admin can use the server's browser.");
    }
    await next();
  });

  /** Every write answers with the same status the read does, so a client never guesses. */
  const answer = (
    c: Context<AppEnv>,
    work: () => Promise<ServerBrowserStatus>,
  ): Promise<Response> => work().then((status) => c.json(status));

  app.get("/", async (c) => {
    const status = await withTimeout(browser.status(), STATUS_TIMEOUT_MS);
    return c.json(status satisfies ServerBrowserStatus);
  });

  app.post("/start", (c) => answer(c, () => browser.start()));
  app.post("/stop", (c) => answer(c, () => browser.stop()));

  app.post("/navigate", async (c) => {
    const body = await readJson(c);
    const raw = requireString(body, "url", { label: "url", maxLen: 4_000 });
    const url = normalizeAddress(raw);
    if (url === null) {
      throw new HttpError(400, "invalid_url", "That is not a web address.");
    }
    return answer(c, () => browser.navigate(url));
  });

  app.post("/back", (c) => answer(c, () => browser.go("back")));
  app.post("/forward", (c) => answer(c, () => browser.go("forward")));
  app.post("/reload", async (c) => {
    // The body is optional here: a plain reload is the common case, and sending none is not an
    // error — an absent or empty body reads as `{}`, a malformed one still 400s.
    const body = await readOptionalJson(c);
    return answer(c, () => browser.reload(body["hard"] === true));
  });

  app.post("/resize", async (c) => {
    const body = await readJson(c);
    return answer(c, () => browser.resize(coordinate(body["width"]), coordinate(body["height"])));
  });

  app.post("/input", async (c) => {
    const body = await readJson(c);
    const raw = body["events"];
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 64) {
      throw new HttpError(400, "bad_request", "events must be one to 64 input events");
    }
    const events = raw.map(readInputEvent);
    return answer(c, () => browser.input(events));
  });

  app.get("/frames", (c) => {
    c.header("x-accel-buffering", "no");
    c.header("cache-control", "no-cache");
    let off: (() => void) | null = null;
    /** Stops writing, however this stream ends — the viewer leaving, or the browser going away. */
    let stop: () => void = () => {};
    /** This viewer's parts: one writer per stream, so the boundary of the first is its own. */
    const write = frameParts();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        let open = true;
        /** The newest frame not yet written out; an older one waiting here is simply replaced. */
        let newest: Buffer | null = null;
        /** Back-pressure: the retry that keeps a frame until the viewer has room for it. */
        let retry: ReturnType<typeof setTimeout> | null = null;
        /** The follow-up part for whatever was written last (see the commit below). */
        let commit: ReturnType<typeof setTimeout> | null = null;
        /** The frame the viewer would otherwise be left holding. */
        let held: Buffer | null = null;

        const send = (jpeg: Buffer): void => {
          controller.enqueue(write(jpeg));
          held = jpeg;
          // A multipart part reaches the viewer's image only once the part AFTER it begins —
          // which is fine while frames keep coming, and wrong the moment they stop: the last
          // repaint of a page (a click, a page that finished loading) would never be shown, and
          // the viewer would sit on a picture of something that is no longer there. So a written
          // frame that is not followed by another within a moment is written again; the copy is
          // what the viewer takes up, and it is the same picture. A page in motion never pays
          // for this: its frames arrive well inside that moment.
          if (commit !== null) clearTimeout(commit);
          commit = setTimeout(() => {
            commit = null;
            if (!open || newest !== null || held === null) return;
            try {
              controller.enqueue(write(held));
            } catch {
              open = false;
            }
          }, FRAME_COMMIT_MS);
        };

        /**
         * Writes the newest frame out, once there is room for it. While the viewer is behind,
         * the frame waits here rather than going away: dropping the NEWEST frame is how a viewer
         * ends up showing something that is no longer on the page. What gets dropped is the older
         * frame this one replaced, which is what makes a lagging viewer catch up on the present.
         */
        const pump = (): void => {
          retry = null;
          if (!open || newest === null) return;
          if ((controller.desiredSize ?? 1) <= 0) {
            retry = setTimeout(pump, 20);
            return;
          }
          const jpeg = newest;
          newest = null;
          try {
            send(jpeg);
          } catch {
            open = false;
          }
        };
        stop = () => {
          open = false;
          for (const timer of [retry, commit]) if (timer !== null) clearTimeout(timer);
          retry = null;
          commit = null;
        };
        off = browser.view((out) => {
          if (!open) return;
          if (out.kind === "frame") {
            newest = out.jpeg;
            if (retry === null) pump();
            return;
          }
          if (out.kind === "closed") {
            open = false;
            try {
              controller.close();
            } catch {
              // Already closed by the peer going away.
            }
          }
        });
      },
      cancel() {
        off?.();
        off = null;
        stop();
      },
    });
    return new Response(body, {
      headers: { "content-type": `multipart/x-mixed-replace; boundary=${BOUNDARY}` },
    });
  });

  return app;
}

/** A status read that cannot hang a request forever, whatever the browser is doing. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_resolve, reject) => {
      setTimeout(
        () => reject(new HttpError(504, "browser_timeout", "The browser did not answer.")),
        ms,
      );
    }),
  ]);
}

/**
 * The route group: the same prefix and auth level as every other user-authenticated surface,
 * with the admin check inside the group rather than in the middleware — this is a server-level
 * resource, and the 403 comes from the same place the rule is written.
 */
@Component({
  contributes: {
    "HttpModule.routes": [
      {
        id: "server-browser.routes",
        prefix: "/api/server-browser",
        auth: "user",
        order: 72,
      },
    ],
  },
})
export class ServerBrowserRoutes {
  @Use() private readonly browser!: ServerBrowser;
  @Bind("server-browser.routes") routes!: Hono<AppEnv>;
  setup() {
    this.routes = serverBrowserRoutes(this.browser);
  }
}
