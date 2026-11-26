/**
 * Browser-side record of the requests THIS page sent — what the conversation's "网络" panel
 * reads. Chrome's own DevTools sees the whole page and every site in it; this answers the one
 * question a conversation raises: which HTTP calls (and model calls, and stream frames) belong
 * to the turn I just typed.
 *
 * Recorded here, never sent anywhere and never written to storage: entries live in this page's
 * memory alone, so a reload, a sign-out or an account switch clears them. The ring keeps the
 * recent past (NET_LOG_CAP entries, newest last), a body is kept up to NET_BODY_CAP bytes and
 * flagged when it was cut, and the whole recorder can be paused for the length of one
 * investigation.
 *
 * Instrumented at the API layer's own doors (api/client.ts's three exits and api/sse.ts's two
 * streams), deliberately NOT by wrapping `window.fetch`: the built-in browser's other sites
 * share that global, and their traffic is not this conversation's.
 *
 * Every request carries `sessionId` (parsed from the path), `turn` (this Session's current
 * turn — see beginTurn) and its own `requestId`; the panel groups by turn.
 *
 * Masking is the reader's, not the recorder's: raw values are kept (an eye can reveal one after
 * a confirmation), and the display helpers here — headers, URL query, body fields — mask by
 * name. Export masks again before it writes anything out.
 */
import type { OmniMessage } from "@adelie/core/omnimessage";

/** How many entries the ring keeps; the newest win, the oldest fall out. */
export const NET_LOG_CAP = 300;
/** How much of a request or response body the ring keeps. */
export const NET_BODY_CAP = 64 * 1024;
/** A request slower than this wears the "慢" tag in the panel. */
export const NET_SLOW_MS = 2000;
/** A request slower than this draws its duration bold. */
export const NET_VERY_SLOW_MS = 10_000;

/** What a row is: a page request, an upload (XHR, with progress), a stream connection, or a model call. */
export type NetKind = "http" | "upload" | "stream" | "model";

export interface NetRequest {
  id: number;
  kind: NetKind;
  method: string;
  /** The logical path (no host, machine prefix stripped), what the list shows and groups on. */
  path: string;
  /** The full URL as sent (query included) — the cURL copy target. */
  url: string;
  sessionId: string | null;
  /** This Session's current turn when the request went out; 0 = no turn opened on this page yet. */
  turn: number;
  /** `<id>-<seq>`, unique per page — the panel's own handle for the row. */
  requestId: string;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  status: number | null;
  /**
   * A model call's terminal state (`request_end.status`), or null; page requests leave this null
   * and carry `status` instead.
   */
  resolution: string | null;
  error: string | null;
  /** How many attempts a retried request took (1 = first try). */
  attempts: number;
  headers: ReadonlyArray<readonly [string, string]>;
  requestBody: string | null;
  requestTruncated: boolean;
  responseHeaders: ReadonlyArray<readonly [string, string]>;
  responseBody: string | null;
  responseTruncated: boolean;
  /** Bytes of the response body actually received. */
  responseBytes: number;
  /** Frames received on a stream connection; null for a request. */
  frameCount: number | null;
}

export interface NetRequestStart {
  kind: NetKind;
  method: string;
  path: string;
  url: string;
  headers?: ReadonlyArray<readonly [string, string]>;
  body?: unknown;
  /** Overrides the session parsed from the path (the stream subscriptions pass theirs). */
  sessionId?: string | null;
}

export interface NetRequestFinish {
  status?: number | null;
  resolution?: string | null;
  error?: string | null;
  attempts?: number;
  responseHeaders?: ReadonlyArray<readonly [string, string]>;
  responseBody?: string | null;
  frameCount?: number | null;
}

// ----------------------------------------------------------------------------- preferences

export interface NetLogPrefs {
  /** Ring size the panel and the recorder honour (the design's default is 300). */
  capacity: number;
  /** Show the "N 个请求" line under an assistant reply. */
  inlineRow: boolean;
  /** Tag requests over NET_SLOW_MS. */
  slowHighlight: boolean;
  /** Keep request / response bodies (names still masked on display). */
  recordBody: boolean;
}

const PREFS_KEY = "penguin.netLog";

const DEFAULT_PREFS: NetLogPrefs = {
  capacity: NET_LOG_CAP,
  inlineRow: true,
  slowHighlight: true,
  recordBody: true,
};

function readPrefs(): NetLogPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw === null) return { ...DEFAULT_PREFS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_PREFS };
    const p = parsed as Partial<Record<keyof NetLogPrefs, unknown>>;
    const cap =
      typeof p.capacity === "number" && Number.isFinite(p.capacity) ? p.capacity : NET_LOG_CAP;
    return {
      capacity: Math.max(20, Math.min(2000, Math.round(cap))),
      inlineRow: typeof p.inlineRow === "boolean" ? p.inlineRow : true,
      slowHighlight: typeof p.slowHighlight === "boolean" ? p.slowHighlight : true,
      recordBody: typeof p.recordBody === "boolean" ? p.recordBody : true,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

let prefs: NetLogPrefs = readPrefs();

export function netLogPrefs(): NetLogPrefs {
  return prefs;
}

export function setNetLogPrefs(patch: Partial<NetLogPrefs>): void {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private-mode storage failures only cost persistence.
  }
  for (const listener of [...listeners]) listener();
}

// ---------------------------------------------------------------------------------- state

let entries: NetRequest[] = [];
let nextId = 1;
let paused = false;
let version = 0;
/** The turn each Session is currently on (set by beginTurn). */
const turnBySession = new Map<string, number>();
/** Model calls opened by a stream's `request_begin` and not yet closed by its `request_end`, in arrival order. */
const openModelCalls: NetRequest[] = [];
const listeners = new Set<() => void>();

/** Fires on every change to the ring (a request started or finished, a clear, a preference). */
export function subscribeNetLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  version += 1;
  for (const listener of [...listeners]) listener();
}

/** Monotonic change counter — the `useSyncExternalStore` snapshot (entries mutate in place). */
export function netLogVersion(): number {
  return version;
}

/** The recorded entries, oldest first. */
export function netLogEntries(): readonly NetRequest[] {
  return entries;
}

export function netLogPaused(): boolean {
  return paused;
}

/**
 * Pauses or resumes recording. A temporary measure for one investigation, not a mode: its
 * state is this page's memory alone and starts off on every load.
 */
export function setNetLogPaused(on: boolean): void {
  if (paused === on) return;
  paused = on;
  notify();
}

export function clearNetLog(): void {
  if (entries.length === 0 && openModelCalls.length === 0) return;
  entries = [];
  openModelCalls.length = 0;
  notify();
}

/** Sets the turn new requests on `sessionId` belong to (the chat page computes it on send). */
export function beginTurn(sessionId: string, turn: number): void {
  if (turnBySession.get(sessionId) === turn) return;
  turnBySession.set(sessionId, turn);
  notify();
}

/** The turn `sessionId` is currently on (0 when none was opened on this page). */
export function sessionTurn(sessionId: string | null): number {
  if (sessionId === null) return 0;
  return turnBySession.get(sessionId) ?? 0;
}

// ------------------------------------------------------------------------------ recording

function capBody(text: string | null): { body: string | null; truncated: boolean } {
  if (text === null) return { body: null, truncated: false };
  if (text.length <= NET_BODY_CAP) return { body: text, truncated: false };
  return { body: text.slice(0, NET_BODY_CAP), truncated: true };
}

function serializeBody(body: unknown): string | null {
  if (body === undefined) return null;
  try {
    return typeof body === "string" ? body : JSON.stringify(body);
  } catch {
    return null; // circular / unserializable: the request itself will fail the same way
  }
}

/**
 * Records a request as it goes out and hands back the entry the caller completes with
 * {@link finishNetRequest}. Returns null while recording is paused (the caller then skips the
 * finish, so no half-row is left behind).
 */
export function startNetRequest(input: NetRequestStart): NetRequest | null {
  if (paused) return null;
  const sessionId = input.sessionId !== undefined ? input.sessionId : sessionIdForPath(input.path);
  const body = prefs.recordBody ? serializeBody(input.body) : null;
  const capped = capBody(body);
  const entry: NetRequest = {
    id: nextId,
    kind: input.kind,
    method: input.method,
    path: input.path,
    url: input.url,
    sessionId,
    turn: sessionTurn(sessionId),
    requestId: `${nextId}-${Date.now().toString(36)}`,
    startedAt: Date.now(),
    endedAt: null,
    durationMs: null,
    status: null,
    resolution: null,
    error: null,
    attempts: 1,
    headers: input.headers ?? [],
    requestBody: capped.body,
    requestTruncated: capped.truncated,
    responseHeaders: [],
    responseBody: null,
    responseTruncated: false,
    responseBytes: 0,
    frameCount: null,
  };
  nextId += 1;
  push(entry);
  notify();
  return entry;
}

/** Completes the entry a request started with (mutates it in place; a dropped entry is a no-op). */
export function finishNetRequest(entry: NetRequest | null, patch: NetRequestFinish): void {
  if (entry === null) return;
  if (!entries.includes(entry)) return; // the ring already evicted it
  const now = Date.now();
  entry.endedAt = now;
  entry.durationMs = now - entry.startedAt;
  if (patch.status !== undefined) entry.status = patch.status;
  if (patch.resolution !== undefined) entry.resolution = patch.resolution;
  if (patch.error !== undefined) entry.error = patch.error;
  if (patch.attempts !== undefined) entry.attempts = patch.attempts;
  if (patch.responseHeaders !== undefined) entry.responseHeaders = patch.responseHeaders;
  if (patch.frameCount !== undefined) entry.frameCount = patch.frameCount;
  if (patch.responseBody !== undefined) {
    const keep = prefs.recordBody ? patch.responseBody : null;
    const capped = capBody(keep);
    entry.responseBody = capped.body;
    entry.responseTruncated = capped.truncated;
    entry.responseBytes = keep === null ? 0 : new TextEncoder().encode(keep).length;
  }
  notify();
}

/**
 * A model call, from a stream's own `request_begin` / `request_end` events. Model calls happen
 * server-side, so the stream is the only place the page can see them; each pair becomes one row
 * under the turn it belongs to. Requests are sequential per Session, so a `request_end` closes
 * the oldest open call.
 */
export function noteNetModelEvent(sessionId: string | null, msg: OmniMessage): void {
  if (paused) return;
  if (msg.type !== "event_msg") return;
  const type = (msg.payload as { type?: string }).type;
  if (type === "request_begin") {
    const entry = startNetRequest({
      kind: "model",
      method: "◆",
      path: modelPath(sessionId),
      url: modelPath(sessionId),
      sessionId,
    });
    if (entry !== null) openModelCalls.push(entry);
    return;
  }
  if (type === "request_end") {
    const payload = msg.payload as { status?: string; attempt?: number; error_message?: string };
    const entry = openModelCalls.shift();
    if (entry === undefined) return;
    finishNetRequest(entry, {
      status: 200,
      resolution: payload.status ?? null,
      attempts: typeof payload.attempt === "number" ? payload.attempt : 1,
      error: payload.status === "fatal" ? (payload.error_message ?? null) : null,
    });
  }
}

function modelPath(sessionId: string | null): string {
  return sessionId === null ? "模型调用" : `/api/sessions/${sessionId}/model`;
}

function push(entry: NetRequest): void {
  entries.push(entry);
  const cap = prefs.capacity;
  if (entries.length > cap) entries = entries.slice(-cap);
}

// ------------------------------------------------------------------------------- sessions

const SESSION_PATH = /^(?:\/server\/[^/]+)?\/api\/sessions\/([^/?#]+)/;

/** The Session a path addresses, or null — the machine-routing prefix is skipped. */
export function sessionIdForPath(path: string): string | null {
  const m = SESSION_PATH.exec(path);
  return m ? decodeURIComponent(m[1]!) : null;
}

// -------------------------------------------------------------------------------- masking

const SENSITIVE_QUERY_KEYS = ["key", "token", "api_key", "access_token"];

/** Whether a header or field name names a secret (matched case-insensitively). */
export function isSensitiveName(name: string): boolean {
  const n = name.toLowerCase();
  if (n === "authorization" || n === "cookie" || n === "set-cookie" || n === "x-api-key")
    return true;
  return n.includes("token") || n.includes("secret") || n.includes("password");
}

/** Masks a secret as `••••` plus its last four characters (the design's "保留后四位"). */
export function maskSecret(value: string, keepLast = 4): string {
  const tail = value.length > keepLast ? value.slice(-keepLast) : "";
  return `${"•".repeat(4)}${tail}`;
}

/** Header pairs with the sensitive values masked — what the panel shows until one is revealed. */
export function maskHeaders(
  headers: ReadonlyArray<readonly [string, string]>,
): ReadonlyArray<readonly [string, string]> {
  return headers.map(([name, value]) => [name, isSensitiveName(name) ? maskSecret(value) : value]);
}

/** A URL with its sensitive query parameters masked. */
export function maskUrlQuery(url: string): string {
  const q = url.indexOf("?");
  if (q === -1) return url;
  const base = url.slice(0, q);
  const params = new URLSearchParams(url.slice(q + 1));
  for (const name of SENSITIVE_QUERY_KEYS) {
    if (params.has(name)) params.set(name, maskSecret(params.get(name) ?? ""));
  }
  // Any parameter whose name otherwise reads like a secret is masked too.
  for (const [name, value] of [...params.entries()]) {
    if (!SENSITIVE_QUERY_KEYS.includes(name) && isSensitiveName(name)) {
      params.set(name, maskSecret(value));
    }
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** A JSON body with the values of secret-named fields masked; a non-JSON body is returned as-is. */
export function maskBody(text: string | null): string | null {
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }
  return JSON.stringify(maskValue(parsed), null, 2);
}

function maskValue(value: unknown, key?: string): unknown {
  if (key !== undefined && isSensitiveName(key)) {
    return typeof value === "string" ? maskSecret(value) : maskSecret(String(value));
  }
  if (Array.isArray(value)) return value.map((v) => maskValue(v));
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = maskValue(v, k);
    return out;
  }
  return value;
}

/** A cURL command for a request (headers and body included); masked, like everything exported. */
export function toCurl(entry: NetRequest): string {
  const parts = [`curl -X ${entry.method}`, `'${maskUrlQuery(entry.url)}'`];
  for (const [name, value] of maskHeaders(entry.headers)) {
    parts.push(`-H '${name}: ${value}'`);
  }
  if (entry.requestBody !== null) parts.push(`--data-raw '${maskBody(entry.requestBody) ?? ""}'`);
  return parts.join(" \\\n  ");
}
