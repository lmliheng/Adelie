/**
 * The server's bounded record of model exchanges — what the "网络" panel's model rows read.
 *
 * Core reports every request through a process-level sink (llm/model-exchange.ts in @adelie/core);
 * this module is the sink the server installs. Records live in memory only, newest win, and a body
 * is stored as JSON already capped: a request may carry a whole replayed conversation and a
 * response may be a long reasoning stream, and the panel shows a reading, not an archive. Nothing
 * here is written to disk — a Trace is the conversation's durable history and must not grow with
 * every request's full prompt.
 */
import type { ModelExchangeRecord } from "@adelie/core";
import { setModelExchangeSink } from "@adelie/core";

/** How many exchanges the ring keeps across the whole process; the newest win. */
export const MODEL_EXCHANGE_CAP = 100;

/** How much of a request's or response's JSON the ring keeps. */
export const MODEL_EXCHANGE_BODY_CAP = 256 * 1024;

/** One exchange as the API serves it: the two halves serialized and capped, not the live objects. */
export interface StoredModelExchange {
  seq: number;
  sessionId: string | null;
  model: string;
  clientType: string | null;
  baseUrl: string | null;
  /** The provider endpoint, as derived by core (llm/model-exchange.ts's modelRequestUrl). */
  url: string | null;
  startedAt: number;
  endedAt: number;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  requestJson: string;
  requestTruncated: boolean;
  responseJson: string;
  responseTruncated: boolean;
}

const entries: StoredModelExchange[] = [];
let installed = false;

function stringifyCapped(value: unknown): { json: string; truncated: boolean } {
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    json = JSON.stringify({ error: "not serializable" });
  }
  if (json.length <= MODEL_EXCHANGE_BODY_CAP) return { json, truncated: false };
  return { json: json.slice(0, MODEL_EXCHANGE_BODY_CAP), truncated: true };
}

/** Longest data: URL kept verbatim; anything longer is an image/video body, stored as a placeholder. */
const DATA_URL_KEEP_CHARS = 4096;

/**
 * Replace long inline media with a readable placeholder before serializing.
 *
 * A vision turn replays every image the conversation ever read as a base64 data URL, so the raw
 * request JSON is dominated by bytes nobody reads in a panel — and keeping them would be the one
 * thing that makes this ring big. `data:image/png;base64,<1.2MB>` says what crossed the wire
 * (there was an image, this size) without storing it again.
 */
function compactForStorage(value: unknown, depth = 0): unknown {
  if (depth > 24) return "[depth limit]";
  if (typeof value === "string") {
    if (
      value.length > DATA_URL_KEEP_CHARS &&
      value.startsWith("data:") &&
      value.includes(";base64,")
    ) {
      const mime = value.slice(5, value.indexOf(";"));
      return `data:${mime};base64,<${value.length} chars>`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => compactForStorage(v, depth + 1));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) out[key] = compactForStorage(v, depth + 1);
    return out;
  }
  return value;
}

function store(record: ModelExchangeRecord): void {
  const request = stringifyCapped(compactForStorage(record.request));
  const response = stringifyCapped(record.response);
  entries.push({
    seq: record.seq,
    sessionId: record.sessionId,
    model: record.model,
    clientType: record.clientType,
    baseUrl: record.baseUrl,
    url: record.url,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    status: record.status,
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
    requestJson: request.json,
    requestTruncated: request.truncated,
    responseJson: response.json,
    responseTruncated: response.truncated,
  });
  if (entries.length > MODEL_EXCHANGE_CAP) entries.splice(0, entries.length - MODEL_EXCHANGE_CAP);
}

/** Install the sink once per process (idempotent: several app constructions share one ring). */
export function installModelExchangeLog(): void {
  if (installed) return;
  installed = true;
  setModelExchangeSink(store);
}

/**
 * Exchanges for one Session, oldest first, optionally only those started after `after` (ms).
 *
 * `after` is what lets the page pick up just the call it is filling in: `request_end` arrives on
 * the same stream that already told the page a call began, and re-reading the whole ring per call
 * would be a quiet N².
 */
export function listModelExchanges(
  sessionId: string,
  after: number,
  limit: number,
): StoredModelExchange[] {
  const matched = entries.filter(
    (entry) => entry.sessionId === sessionId && entry.startedAt > after,
  );
  return matched.slice(-limit);
}

/** Drop everything (tests only: a shared ring would otherwise leak one test's calls into the next). */
export function resetModelExchangeLogForTests(): void {
  entries.length = 0;
}
