/**
 * The CDP client on its own: calls matched by id, events fanned out, and the four ways a call
 * can end. The transport is a fake socket, so nothing here starts a browser — the real one is
 * exercised by the end-to-end pass in server-browser.test.ts.
 */
import { describe, expect, it, vi } from "vitest";
import { CdpConnection, CdpError } from "../src/server-browser/cdp.js";
import type { CdpEvent, CdpSocket } from "../src/server-browser/cdp.js";

interface FakeSocket extends CdpSocket {
  /** Every frame this client sent, parsed. */
  readonly sent: Array<Record<string, unknown>>;
  /** Hands `frame` to the client as if the browser had sent it. */
  deliver(frame: unknown): void;
  /** The browser's socket dropping, with or without an error. */
  drop(err?: Error): void;
  readonly closed: boolean;
}

function fakeSocket(): FakeSocket {
  const sent: Array<Record<string, unknown>> = [];
  const messageListeners = new Set<(data: string) => void>();
  const closeListeners = new Set<(err?: Error) => void>();
  let closed = false;
  return {
    sent,
    get closed() {
      return closed;
    },
    send(data: string) {
      sent.push(JSON.parse(data) as Record<string, unknown>);
    },
    close() {
      if (closed) return;
      closed = true;
      for (const listener of closeListeners) listener();
    },
    onMessage(listener) {
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
    onClose(listener) {
      closeListeners.add(listener);
      return () => closeListeners.delete(listener);
    },
    deliver(frame) {
      const text = typeof frame === "string" ? frame : JSON.stringify(frame);
      for (const listener of messageListeners) listener(text);
    },
    drop(err) {
      if (closed) return;
      closed = true;
      for (const listener of closeListeners) listener(err);
    },
  };
}

/** The call a connection has just sent, as the browser would answer it. */
const answer = (socket: FakeSocket, index: number, result: unknown): void => {
  socket.deliver({ id: socket.sent[index]!["id"], result });
};

describe("the CDP connection", () => {
  it("matches an answer to the call that asked for it, in order", async () => {
    const socket = fakeSocket();
    const cdp = new CdpConnection(socket);
    const first = cdp.call("Page.navigate", { url: "https://example.test" });
    const second = cdp.call("Page.enable");
    expect(socket.sent[0]).toMatchObject({
      method: "Page.navigate",
      params: { url: "https://example.test" },
    });
    // Answered out of order: the id, not the arrival sequence, is what pairs them.
    answer(socket, 1, { enabled: true });
    answer(socket, 0, { frameId: "F1" });
    expect(await second).toEqual({ enabled: true });
    expect(await first).toEqual({ frameId: "F1" });
  });

  it("targets an attached page's session on every call made through it", async () => {
    const socket = fakeSocket();
    const cdp = new CdpConnection(socket);
    const call = cdp.call("Runtime.evaluate", { expression: "1" }, "TAB-1");
    expect(socket.sent[0]).toMatchObject({ sessionId: "TAB-1" });
    answer(socket, 0, { result: { value: 1 } });
    await expect(call).resolves.toEqual({ result: { value: 1 } });
  });

  it("rejects with the browser's own refusal, and keeps the connection usable", async () => {
    const socket = fakeSocket();
    const cdp = new CdpConnection(socket);
    const refused = cdp.call("Page.navigate", { url: "not-a-url" });
    socket.deliver({
      id: socket.sent[0]!["id"],
      error: { message: "Cannot navigate to invalid URL" },
    });
    await expect(refused).rejects.toThrowError("Cannot navigate to invalid URL");
    await expect(refused).rejects.toBeInstanceOf(CdpError);
    expect(cdp.alive).toBe(true);
    const next = cdp.call("Page.enable");
    answer(socket, 1, {});
    await expect(next).resolves.toEqual({});
  });

  it("gives up on a call the browser never answers", async () => {
    vi.useFakeTimers();
    try {
      const socket = fakeSocket();
      const cdp = new CdpConnection(socket, 500);
      const call = cdp.call("Browser.crash");
      const failure = call.catch((err: unknown) => err);
      await vi.advanceTimersByTimeAsync(500);
      const err = await failure;
      expect(err).toBeInstanceOf(CdpError);
      expect((err as CdpError).kind).toBe("timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails everything in flight when the socket goes away, once", async () => {
    const socket = fakeSocket();
    const cdp = new CdpConnection(socket);
    const closes: Array<Error | undefined> = [];
    cdp.onClose((err) => closes.push(err));
    const inflight = cdp.call("Page.enable");
    socket.drop(new Error("ECONNRESET"));
    await expect(inflight).rejects.toThrowError("ECONNRESET");
    expect(closes).toHaveLength(1);
    expect(cdp.alive).toBe(false);
    // A later call is refused rather than queued behind a socket that is gone.
    await expect(cdp.call("Page.enable")).rejects.toMatchObject({ kind: "closed" });
  });

  it("hands every event to every listener, and a listener that throws does not stop the next", () => {
    const socket = fakeSocket();
    const cdp = new CdpConnection(socket);
    const seen: CdpEvent[] = [];
    cdp.onEvent((event) => {
      throw new Error("this viewer is broken");
    });
    cdp.onEvent((event) => seen.push(event));
    socket.deliver({ method: "Page.loadEventFired", params: {}, sessionId: "TAB-1" });
    expect(seen).toEqual([{ method: "Page.loadEventFired", params: {}, sessionId: "TAB-1" }]);
  });

  it("ignores anything that is not a CDP frame", () => {
    const socket = fakeSocket();
    const cdp = new CdpConnection(socket);
    const seen: CdpEvent[] = [];
    cdp.onEvent((event) => seen.push(event));
    socket.deliver("this is not JSON");
    socket.deliver("42");
    socket.deliver({ nope: true });
    expect(seen).toEqual([]);
    expect(cdp.alive).toBe(true);
  });

  it("turns a socket that refuses to send into a closed failure", async () => {
    const socket = fakeSocket();
    const cdp = new CdpConnection(socket);
    socket.send = () => {
      throw new Error("WebSocket is not open");
    };
    await expect(cdp.call("Page.enable")).rejects.toMatchObject({ kind: "closed" });
  });

  it("closing it closes the socket and tells the close listeners", () => {
    const socket = fakeSocket();
    const cdp = new CdpConnection(socket);
    const closes: Array<Error | undefined> = [];
    cdp.onClose((err) => closes.push(err));
    cdp.close();
    expect(socket.closed).toBe(true);
    expect(closes).toHaveLength(1);
    expect(cdp.alive).toBe(false);
  });
});
