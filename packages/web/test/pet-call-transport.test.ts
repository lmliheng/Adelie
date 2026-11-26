/**
 * The transport says why a call did not open, in a code: the sentence is the page's to choose.
 *
 * No socket here — a stand-in global `WebSocket` is handed the three beginnings the transport has
 * to tell apart: it opens, it errors, or the other end closes it before the handshake.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RealtimeClient, RealtimeConnectError } from "../src/features/pet/voice/realtime-client";

/** The parts of the browser's socket this transport touches, driven by the test. */
class FakeSocket {
  static readonly OPEN = 1;
  static last: FakeSocket | null = null;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { reason: string }) => void) | null = null;
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.last = this;
  }
  send(): void {}
  close(): void {}
  /** The page's socket opened. */
  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  fail(): void {
    this.onerror?.();
  }
  shut(reason: string): void {
    this.readyState = 3;
    this.onclose?.({ reason });
  }
}

const realWebSocket = globalThis.WebSocket;
const realWindow = globalThis.window;

beforeEach(() => {
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeSocket;
  (globalThis as unknown as { window: unknown }).window = {
    location: { protocol: "http:", host: "app.test" },
  };
});

afterEach(() => {
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = realWebSocket;
  if (realWindow === undefined) delete (globalThis as unknown as { window?: unknown }).window;
  else (globalThis as unknown as { window: unknown }).window = realWindow;
});

const client = () => new RealtimeClient({ onEvent: () => {}, onClose: () => {} });

describe("the call's transport", () => {
  it("resolves once the handshake is done", async () => {
    const call = client();
    const opening = call.connect();
    FakeSocket.last?.open();
    await expect(opening).resolves.toBeUndefined();
    expect(call.opened).toBe(true);
    expect(FakeSocket.last?.url).toBe("ws://app.test/api/realtime");
  });

  it("names a socket that never opened", async () => {
    const opening = client().connect();
    FakeSocket.last?.fail();
    const err = await opening.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RealtimeConnectError);
    expect((err as RealtimeConnectError).reason).toBe("connect_failed");
  });

  it("names a handshake the other end closed first, whatever it said", async () => {
    const opening = client().connect();
    FakeSocket.last?.shut("upstream");
    const err = await opening.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RealtimeConnectError);
    expect((err as RealtimeConnectError).reason).toBe("closed");
    // The close reason is the provider's or the relay's word, not a sentence to show a reader.
    expect((err as Error).message).not.toBe("upstream");
    expect((err as Error).message).not.toContain("连接");
  });

  it("does not reject a socket that closed after it opened", async () => {
    const call = client();
    const opening = call.connect();
    FakeSocket.last?.open();
    await expect(opening).resolves.toBeUndefined();
    FakeSocket.last?.shut("bye");
    expect(call.opened).toBe(false);
  });
});
