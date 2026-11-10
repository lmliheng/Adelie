/**
 * Discarding a response body nobody reads. `cancel()` rejects whenever the stream is already
 * errored — a connection that died mid-body, a probe the readiness timeout aborted — and the
 * CLI installs no unhandled-rejection handler, so Node's default ends the process for it: a
 * command that only meant to drop a body dies instead. These pin that the drop sites swallow
 * it, measured by counting what actually reaches the process.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServerClient, discardBody, resolveConnection } from "../src/client.js";
import { getMessages } from "../src/i18n.js";

const t = getMessages("en");

const ENV_KEYS = ["ADELIE_API_URL", "ADELIE_API_TOKEN", "PENGUIN_HOME", "ADELIE_PROJECT_ID"];
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/** A response whose body is already errored, as a dropped connection or an aborted probe leaves it. */
function erroredResponse(status = 200, headers: Record<string, string> = {}): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new Error("terminated"));
    },
  });
  return new Response(body, { status, headers });
}

/**
 * What reaches the process as an unhandled rejection while `run` is in flight. Node reports
 * one on a later turn than the one that rejected, so the guard waits two turns before reading.
 */
async function rejectionsDuring(run: () => void | Promise<unknown>): Promise<unknown[]> {
  const seen: unknown[] = [];
  const onRejection = (reason: unknown) => seen.push(reason);
  process.on("unhandledRejection", onRejection);
  try {
    await run();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    return seen;
  } finally {
    process.off("unhandledRejection", onRejection);
  }
}

describe("discardBody", () => {
  it("drops an errored body without letting its rejection escape", async () => {
    const seen = await rejectionsDuring(() => discardBody(erroredResponse()));
    expect(seen).toEqual([]);
  });

  it("drops a body that cancels cleanly too", async () => {
    const seen = await rejectionsDuring(() =>
      discardBody(new Response(new Blob(["x"]), { status: 200 })),
    );
    expect(seen).toEqual([]);
  });

  it("is a no-op for a bodyless response", async () => {
    const seen = await rejectionsDuring(() => discardBody(new Response(null, { status: 204 })));
    expect(seen).toEqual([]);
  });
});

describe("a dropped body on the request paths", () => {
  it("request() on an empty answer still resolves when the body errored", async () => {
    const client = new ServerClient(
      await resolveConnection({ server: "http://127.0.0.1:7002" }, t),
      t,
    );
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(erroredResponse(200, { "content-length": "0" }));

    const seen = await rejectionsDuring(async () => {
      await expect(client.request("POST", "/api/sessions/x/abort")).resolves.toBeUndefined();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([]);
  });
});
