/**
 * The browser end of a call: one WebSocket to this app's own server, which relays it to the
 * provider and holds the key (see the server's realtime/ws.ts).
 *
 * Nothing about the session is set from here. The server sends the `session.update` that names the
 * voice, the formats and the instructions the moment its upstream connection opens, so this client
 * only ever adds audio, asks for a response, or cancels one — and it waits for `session.updated`
 * before adding any, because audio that arrived first would be interpreted in the wrong format.
 *
 * A thin transport on purpose: it parses frames, hands them over and says when the socket closes.
 * What those frames mean is the call's, not the socket's (see use-pet-call.ts).
 */
import type { RealtimeEvent } from "./types";

/** The path this app's server upgrades for a call. */
const REALTIME_PATH = "/api/realtime";

/**
 * Why a call never got its handshake: the socket could not be opened at all (a refused upgrade —
 * no key configured, a session that is gone — or a network that is not there), or the other end
 * closed it first. The two read differently to a person, and the sentence is the page's to choose
 * (see call-failure.ts): this transport runs in a window whose language it does not know.
 */
export type RealtimeConnectFailure = "connect_failed" | "closed";

/** A handshake that did not happen, named by the reason rather than by a sentence. */
export class RealtimeConnectError extends Error {
  constructor(readonly reason: RealtimeConnectFailure) {
    // The message is for a log or a fallback that has no dictionary: English, and no guess at why.
    super(`realtime: the call did not connect (${reason})`);
    this.name = "RealtimeConnectError";
  }
}

export interface RealtimeClientOptions {
  /** Every frame the provider sent, already parsed. */
  onEvent: (event: RealtimeEvent) => void;
  /** The socket is gone. `reason` is empty for an ordinary hang-up. */
  onClose: (reason: string) => void;
}

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private _opened = false;

  constructor(private readonly options: RealtimeClientOptions) {}

  /** Whether the handshake completed, which is what makes the client worth sending to. */
  get opened(): boolean {
    return this._opened;
  }

  /** Opens the call. Resolves on the handshake, rejects with what went wrong before one. */
  connect(): Promise<void> {
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${scheme}//${window.location.host}${REALTIME_PATH}`);
    this.ws = ws;
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (reason: RealtimeConnectFailure): void => {
        if (settled) return;
        settled = true;
        reject(new RealtimeConnectError(reason));
      };
      ws.onopen = () => {
        settled = true;
        this._opened = true;
        resolve();
      };
      ws.onmessage = (event: MessageEvent) => {
        let frame: unknown;
        try {
          frame = JSON.parse(String(event.data));
        } catch {
          return; // not this protocol's frame; the provider may add carriers we do not read
        }
        if (
          typeof frame === "object" &&
          frame !== null &&
          typeof (frame as RealtimeEvent).type === "string"
        ) {
          this.options.onEvent(frame as RealtimeEvent);
        }
      };
      ws.onerror = () => fail("connect_failed");
      ws.onclose = (event: CloseEvent) => {
        this._opened = false;
        // Before the handshake this is how a refusal arrives (no key configured, a lost session);
        // after it, it is a call that ended, which the caller hears about through onClose alone.
        if (!settled) fail("closed");
        this.options.onClose(event.reason ?? "");
      };
    });
  }

  /** One 100 ms chunk of the microphone, base64 PCM16. */
  appendAudio(base64: string): void {
    this.send({ type: "input_audio_buffer.append", audio: base64 });
  }

  /** Stop the reply that is playing: what pressing the microphone's own "stop talking" means. */
  cancelResponse(): void {
    this.send({ type: "response.cancel" });
  }

  close(): void {
    this._opened = false;
    try {
      this.ws?.close(1000, "bye");
    } catch {
      // already gone
    }
    this.ws = null;
  }

  private send(event: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(event));
  }
}
