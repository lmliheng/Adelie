/**
 * The XHR fake for the node suite: what stands where the browser's `XMLHttpRequest` does, for the
 * one transport that needs it (src/api/xhr-upload.ts — see it for why a request whose upload has to
 * be watched cannot be a `fetch`).
 *
 * There is no DOM here, so this records what the app asked for and lets the test drive the events
 * the browser would fire: an upload reading, an answer, a network-level failure. `stubXhr` installs
 * it as the global for the current test (the suite's `unstubGlobals` takes it away again); a test
 * that exercises `xhrUpload` directly can pass `FakeXhr` to its own factory parameter instead.
 */
import { vi } from "vitest";

/** One upload reading, as the fake was driven to report it. */
export interface UploadReading {
  loaded: number;
  total: number;
}

/** Everything the app asked of the request, plus the switches the test throws. */
export class FakeXhr {
  /** Every request object created since {@link stubXhr} installed the fake, oldest first. */
  static readonly instances: FakeXhr[] = [];

  /** The most recently created one — the request the app just made. */
  static last(): FakeXhr {
    const instance = FakeXhr.instances.at(-1);
    if (!instance) throw new Error("no XMLHttpRequest was created");
    return instance;
  }

  // What the app set.
  method = "";
  url = "";
  async = false;
  withCredentials = false;
  readonly headers: Record<string, string> = {};
  body: string | null = null;
  aborted = false;

  // The event handlers the app registered.
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private readonly listeners = new Map<string, (() => void)[]>();

  // What the answer will be.
  status = 200;
  statusText = "OK";
  responseText = "";
  private responseHeaders = "";
  /** Every upload reading the app has been handed. */
  readonly readings: UploadReading[] = [];

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(method: string, url: string, async: boolean): void {
    this.method = method;
    this.url = url;
    this.async = async;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  send(body: string | null = null): void {
    this.body = body;
  }

  abort(): void {
    this.aborted = true;
    this.onabort?.();
  }

  getAllResponseHeaders(): string {
    return this.responseHeaders;
  }

  addEventListener(type: string, handler: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler]);
  }

  removeEventListener(type: string, handler: () => void): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((h) => h !== handler),
    );
  }

  // ---- The switches a test throws ----

  /** Fires one upload reading, as the browser reports one mid-body. */
  progress(loaded: number, total: number, lengthComputable = true): void {
    this.readings.push({ loaded, total });
    this.upload.onprogress?.({ loaded, total, lengthComputable } as ProgressEvent);
  }

  /** Answers the request: the status, the body and the raw header block `getAllResponseHeaders` returns. */
  respond(status: number, responseText = "", headers: Record<string, string> = {}): void {
    this.status = status;
    this.responseText = responseText;
    this.responseHeaders = Object.entries(headers)
      .map(([name, value]) => `${name}: ${value}\r\n`)
      .join("");
    this.onload?.();
  }

  /** The connection failed (`onerror`, not a status). */
  fail(): void {
    this.onerror?.();
  }

  /** Fires one event of a type the app registered with `addEventListener`. */
  emit(type: string): void {
    for (const handler of this.listeners.get(type) ?? []) handler();
  }
}

/** Installs the fake as the global `XMLHttpRequest` for the current test. */
export function stubXhr(): void {
  FakeXhr.instances.length = 0;
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
}

/**
 * The factory a test hands to `xhrUpload` directly, as its `makeXhr` parameter. The cast is the
 * point: production passes the browser's own class, which the fake stands in for by implementing
 * the handful of members the transport uses.
 */
export function fakeXhrFactory(): XMLHttpRequest {
  return new FakeXhr() as unknown as XMLHttpRequest;
}
