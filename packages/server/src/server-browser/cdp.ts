/**
 * The smallest CDP client this needs: one WebSocket to a browser's DevTools endpoint, requests
 * matched by id, events handed to listeners. Flattened sessions (Target.attachToTarget) ride in
 * the same socket, which is why every call takes an optional session id.
 *
 * The transport is an interface rather than `ws` itself so the routing can be tested without a
 * browser — the terminal's own reason for splitting its stream from its socket. Nothing here
 * reaches the network.
 */
import { WebSocket } from "ws";

/** One socket, as this client uses it: text frames both ways, and a close to hear about. */
export interface CdpSocket {
  send(data: string): void;
  close(): void;
  /** Returns the unsubscribe. */
  onMessage(listener: (data: string) => void): () => void;
  onClose(listener: (err?: Error) => void): () => void;
}

/** One CDP event, as it arrives: the method, its params, and the session that sent it. */
export interface CdpEvent {
  method: string;
  params: Record<string, unknown>;
  sessionId?: string;
}

/** How long one CDP call may take. Bounded: a wedged browser must not hold a request open. */
export const CDP_CALL_TIMEOUT_MS = 30_000;

/** A CDP call that failed: the browser answered with an error, or it did not answer in time. */
export class CdpError extends Error {
  constructor(
    readonly kind: "refused" | "timeout" | "closed",
    message: string,
  ) {
    super(message);
    this.name = "CdpError";
  }
}

interface Pending {
  resolve(result: Record<string, unknown>): void;
  reject(err: CdpError): void;
  timer: NodeJS.Timeout;
}

/** Raises the `data` of a frame to a listener, tolerating anything that is not a CDP frame. */
function asFrame(raw: string): {
  id?: number;
  method?: string;
  params?: unknown;
  sessionId?: string;
  result?: unknown;
  error?: { message?: string };
} | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return typeof parsed === "object" && parsed !== null ? (parsed as never) : null;
}

export class CdpConnection {
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<(event: CdpEvent) => void>();
  private readonly closeListeners = new Set<(err?: Error) => void>();
  private nextId = 0;
  private closed: Error | null = null;

  constructor(
    private readonly socket: CdpSocket,
    private readonly callTimeoutMs: number = CDP_CALL_TIMEOUT_MS,
  ) {
    socket.onMessage((data) => this.receive(data));
    socket.onClose((err) => this.fail(err ?? new Error("the browser closed the connection")));
  }

  /** Sends one CDP call and resolves with its result. `sessionId` targets an attached tab. */
  call(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<Record<string, unknown>> {
    if (this.closed !== null) return Promise.reject(new CdpError("closed", this.closed.message));
    this.nextId += 1;
    const id = this.nextId;
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new CdpError(
            "timeout",
            `the browser did not answer ${method} within ${this.callTimeoutMs}ms`,
          ),
        );
      }, this.callTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.socket.send(
          JSON.stringify({ id, method, params, ...(sessionId === undefined ? {} : { sessionId }) }),
        );
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new CdpError("closed", err instanceof Error ? err.message : String(err)));
      }
    });
  }

  /** Every CDP event. Returns the unsubscribe. */
  onEvent(listener: (event: CdpEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Called once when the socket goes away, for whatever reason. */
  onClose(listener: (err?: Error) => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  close(): void {
    this.socket.close();
    this.fail(new Error("closed by this server"));
  }

  /** Whether the socket is still usable. */
  get alive(): boolean {
    return this.closed === null;
  }

  private receive(raw: string): void {
    const frame = asFrame(raw);
    if (frame === null) return;
    if (typeof frame.id === "number") {
      const pending = this.pending.get(frame.id);
      if (pending === undefined) return;
      this.pending.delete(frame.id);
      clearTimeout(pending.timer);
      if (frame.error !== undefined) {
        pending.reject(
          new CdpError("refused", frame.error.message ?? "the browser refused the call"),
        );
      } else {
        pending.resolve((frame.result ?? {}) as Record<string, unknown>);
      }
      return;
    }
    if (typeof frame.method !== "string") return;
    const event: CdpEvent = {
      method: frame.method,
      params:
        typeof frame.params === "object" && frame.params !== null
          ? (frame.params as Record<string, unknown>)
          : {},
      ...(typeof frame.sessionId === "string" ? { sessionId: frame.sessionId } : {}),
    };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A listener's failure must not take the socket's reader down with it: this runs inside
        // the ws message handler, where a throw is an uncaught exception.
      }
    }
  }

  private fail(err: Error): void {
    if (this.closed !== null) return;
    this.closed = err;
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new CdpError("closed", err.message));
      this.pending.delete(id);
    }
    for (const listener of this.closeListeners) {
      try {
        listener(err);
      } catch {
        // Same as above: a close listener that throws is not worth the process.
      }
    }
    this.closeListeners.clear();
    this.listeners.clear();
  }
}

/** Opens a CDP connection to a `ws://…/devtools/browser/<id>` endpoint. */
export function connectCdp(
  endpoint: string,
  timeoutMs = CDP_CALL_TIMEOUT_MS,
): Promise<CdpConnection> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(endpoint, {
      // Screencast frames and screenshots are the largest things crossing this socket.
      maxPayload: 256 * 1024 * 1024,
      handshakeTimeout: 15_000,
    });
    const connection = new CdpConnection(
      {
        send: (data) => ws.send(data),
        close: () => ws.close(),
        onMessage: (listener) => {
          const handler = (data: unknown): void => listener(String(data));
          ws.on("message", handler);
          return () => ws.off("message", handler);
        },
        onClose: (listener) => {
          const onClose = (): void => listener();
          const onError = (err: Error): void => listener(err);
          ws.once("close", onClose);
          ws.once("error", onError);
          return () => {
            ws.off("close", onClose);
            ws.off("error", onError);
          };
        },
      },
      timeoutMs,
    );
    ws.once("open", () => resolve(connection));
    ws.once("error", (err: Error) => reject(err));
  });
}
