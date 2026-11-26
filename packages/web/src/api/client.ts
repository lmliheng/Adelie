/**
 * fetch wrapper: JSON request/response, unified errors -> ApiError,
 * same-origin cookie auth (credentials: same-origin; CSRF relies on SameSite=Lax + JSON
 * Content-Type, see server README).
 *
 * When the session becomes invalid (server 401, e.g. database rebuilt, cookie expired),
 * notifies AuthProvider to clear the current user, letting the route guard redirect to the
 * login page — instead of each page popping its own "unauthorized" error.
 */
import { S } from "../lib/strings";
import { apiUrl } from "../lib/server-context";
import { machineForPath } from "../lib/session-machines";
import { finishNetRequest, startNetRequest } from "./net-log";
import { xhrUpload } from "./xhr-upload";

/** Unified API error: carries the HTTP status code and server error code (server error body {error:{code,message}}). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSeconds?: number;

  constructor(status: number, code: string, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Session-invalidation callback (registered by AuthProvider; not triggered by 401s from the login/register endpoints themselves). */
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

/** 401/409 from auth endpoints themselves are business failures (e.g. wrong password) and must not trigger a global logout. */
function isAuthEndpoint(path: string): boolean {
  return path.startsWith("/api/auth/");
}

export interface ApiFetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** JSON request body (auto-serialized with Content-Type: application/json). */
  body?: unknown;
  /**
   * A body sent as-is, for the one route that takes bytes rather than JSON (a Session's direct
   * attachment upload): the `Blob`/`File` becomes the request body, so the browser streams it
   * from disk instead of this layer reading it into a string. Mutually exclusive with `body`.
   */
  rawBody?: Blob;
  /** Query parameters (undefined values are skipped). */
  query?: Record<string, string | number | undefined>;
  /**
   * Reports how much of the request body has gone out, for the one call that can carry a
   * message's attachments inline (see api/xhr-upload.ts for why that needs XHR). Passing it is
   * what selects the XHR transport; without it nothing about the call changes.
   */
  onUploadProgress?: (sent: number, total: number) => void;
  /**
   * Which machine answers this call, when the caller knows and the path does not say.
   *
   * Omitted, a Session-scoped path routes itself to the machine that Session lives on (see
   * lib/session-machines.ts) and everything else stays here — the window never moves. Pass
   * `null` to force this server, or an id to send one request through that machine's
   * connection; browsing another machine's directories to pick a workspace on it, or asking
   * a machine for ITS Agents, are the calls that need it.
   */
  server?: string | null;
}

/** Response metadata a caller may need alongside the parsed body. */
export interface ApiFetchMeta {
  /**
   * The server's own clock at the moment it produced the response, read from the HTTP `Date`
   * header; null when absent or unparseable. Lets a caller measure a server-side interval
   * entirely in server time — differencing it against a server-supplied timestamp cancels any
   * client/server clock offset, which a local `Date.now()` cannot do. Whole-second precision
   * (RFC 9110 fixes the header's format), so treat it as ±1s. `Date` is CORS-safelisted, so it
   * is readable cross-origin too.
   */
  serverNowMs: number | null;
  /**
   * The response's `ETag`, or null when it carries none. A Workspace file write answers with the
   * version it wrote there — the precondition the editor's next save of that file carries.
   */
  etag: string | null;
}

/** The request half every call shares: the method, the session cookie, a JSON body when there is one. */
function requestInit(options: {
  method?: string;
  body?: unknown;
  rawBody?: Blob;
  signal?: AbortSignal;
}): RequestInit {
  return {
    method: options.method ?? "GET",
    credentials: "same-origin",
    ...(options.rawBody !== undefined
      ? { headers: { "Content-Type": "application/octet-stream" }, body: options.rawBody }
      : {}),
    ...(options.body !== undefined
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options.body),
        }
      : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  };
}

/**
 * The ApiError a non-2xx response stands for: the server's envelope code and message (or the
 * generic ones for a body that is not the envelope) and its Retry-After. A 401 from this server
 * outside the auth endpoints also signs the window out.
 */
async function failureOf(
  response: Response,
  path: string,
  target: string | null,
): Promise<ApiError> {
  let code = "http_error";
  let message: string = S.common.unknownError;
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    if (body.error?.code) code = body.error.code;
    if (body.error?.message) message = body.error.message;
  } catch {
    // Non-JSON error body: fall back to the default message.
  }
  // A 401 from ANOTHER machine is that machine's answer, not this server's: it means we
  // are not signed in over there, which says nothing about the session here. Treating it
  // as a local logout is how clicking a remote host in a picker bounced the window to the
  // login page of a server it was still perfectly signed in to.
  const fromThisServer = target === null;
  if (response.status === 401 && fromThisServer && !isAuthEndpoint(path)) onUnauthorized?.();
  const retryAfter = response.headers.get("retry-after");
  const retryAfterSeconds =
    retryAfter !== null && /^\d+$/.test(retryAfter) ? Number(retryAfter) : undefined;
  return new ApiError(response.status, code, message, retryAfterSeconds);
}

/** Makes an API request; non-2xx responses uniformly throw ApiError; 204/empty body returns undefined. */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  return (await apiFetchWithMeta<T>(path, options)).data;
}

/** {@link apiFetch} plus the response metadata in {@link ApiFetchMeta}; identical in every other respect. */
export async function apiFetchWithMeta<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<{ data: T } & ApiFetchMeta> {
  // Two routing rules, in order: an explicit `server` wins, otherwise a Session-scoped path
  // goes to the machine that Session lives on. Everything else stays here.
  const target = "server" in options ? (options.server ?? null) : machineForPath(path);
  let url = apiUrl(path, target);
  if (options.query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  // Recorded as it goes out, completed below on every path (the "网络" panel's source).
  const net = startNetRequest({
    // A call carrying an upload-progress callback goes out as XHR (api/xhr-upload.ts) — the
    // panel marks those apart, since a big inline body is its own thing to see.
    kind: options.onUploadProgress === undefined ? "http" : "upload",
    method: options.method ?? "GET",
    path,
    url,
    headers: options.body !== undefined ? [["content-type", "application/json"]] : [],
    body: options.body,
  });

  let response: Response;
  try {
    const init = requestInit(options);
    response =
      options.onUploadProgress === undefined
        ? await fetch(url, init)
        : await xhrUpload(url, init, options.onUploadProgress);
  } catch {
    finishNetRequest(net, { error: S.errors.networkError });
    throw new ApiError(0, "network_error", S.errors.networkError);
  }

  const responseHeaders = [...response.headers.entries()];
  if (!response.ok) {
    const failure = await failureOf(response, path, target);
    finishNetRequest(net, { status: response.status, error: failure.message });
    throw failure;
  }

  const headerDate = Date.parse(response.headers.get("date") ?? "");
  const serverNowMs = Number.isFinite(headerDate) ? headerDate : null;
  const etag = response.headers.get("etag");

  if (response.status === 204) {
    finishNetRequest(net, { status: response.status, responseHeaders, responseBody: "" });
    return { data: undefined as T, serverNowMs, etag };
  }
  const text = await response.text();
  finishNetRequest(net, { status: response.status, responseHeaders, responseBody: text });
  if (!text) return { data: undefined as T, serverNowMs, etag };
  return { data: JSON.parse(text) as T, serverNowMs, etag };
}

export interface ApiFetchStreamOptions {
  method?: "GET" | "POST";
  /** JSON request body (auto-serialized with Content-Type: application/json). */
  body?: unknown;
  /** Aborting it closes the connection; the call then rejects with the abort's reason. */
  signal?: AbortSignal;
}

/**
 * {@link apiFetch} for an answer read as it arrives (a `text/event-stream`): the same URL and
 * routing, cookie, JSON body and non-2xx → ApiError mapping, but a 2xx response is handed back
 * with its body unread. A failed connection is the `network_error` ApiError, except when
 * `signal` was aborted: that rejects as `fetch` raised it, so the caller can tell a stop from a
 * failure.
 */
export async function apiFetchStream(
  path: string,
  options: ApiFetchStreamOptions = {},
): Promise<Response> {
  const target = machineForPath(path);
  const url = apiUrl(path, target);
  const net = startNetRequest({
    kind: "stream",
    method: options.method ?? "GET",
    path,
    url,
    headers: options.body !== undefined ? [["content-type", "application/json"]] : [],
    body: options.body,
  });
  let response: Response;
  try {
    response = await fetch(url, requestInit(options));
  } catch (err) {
    // An abort is the caller's own stop, not a failure — the row records neither.
    finishNetRequest(net, {
      error: options.signal?.aborted ? "aborted" : S.errors.networkError,
    });
    if (options.signal?.aborted) throw err;
    throw new ApiError(0, "network_error", S.errors.networkError);
  }
  if (!response.ok) {
    const failure = await failureOf(response, path, target);
    finishNetRequest(net, { status: response.status, error: failure.message });
    throw failure;
  }
  // The body is unread here (the caller consumes it): the row records the connection, and the
  // frames it delivers show up in the panel's event stream, not on this row.
  finishNetRequest(net, {
    status: response.status,
    responseHeaders: [...response.headers.entries()],
  });
  return response;
}
