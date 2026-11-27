/**
 * One model exchange, as the "网络" panel's model rows show it: what Adelie sent to the provider
 * and what came back.
 *
 * Model calls happen **server-side**, so the page cannot see them the way it sees its own HTTP
 * calls. It does see their boundaries — `request_begin` / `request_end` ride the Session's SSE
 * stream and already give a row its start, duration and terminal state — but not the content:
 * which messages, which tools, what system prompt, and what the model answered with. Those are
 * what this module records.
 *
 * Core does not decide where a record goes. It reports through one process-level sink that the
 * host installs (`setModelExchangeSink`) — the server keeps a bounded ring and serves it over
 * `/api/sessions/:id/model-exchanges`; a host that installs nothing pays one null check per
 * request. Nothing is written to the Session's Trace: a Trace is the conversation's durable
 * history and must not grow with every request's full prompt.
 */
import type { UniConfig, UniMessage } from "@prismshadow/agenthub";
import type { StopReason } from "../omnimessage/types.js";

/** The request half: exactly what the provider was told. */
export interface ModelExchangeRequest {
  /** The substituted system prompt, when there is one. */
  systemPrompt: string | null;
  /** Tool schemas as sent (name/description/parameters), or null when the request carried no tools. */
  tools: unknown[] | null;
  /** The rest of the wire config (max_tokens, thinking_level, fast_mode, thinking_summary, …). */
  config: Record<string, unknown>;
  /** The full conversation as sent: the replayed history followed by this request's input. */
  messages: unknown[];
}

/** The response half: what the model produced, stitched back together from the stream. */
export interface ModelExchangeResponse {
  text: string;
  thinking: string;
  toolCalls: Array<{ name: string; arguments: string; toolCallId: string }>;
}

export interface ModelExchangeRecord {
  /** Process-wide, monotonic — the panel's stable handle when two calls land in the same second. */
  seq: number;
  /** The Session this request belonged to; null for a probe or a one-off utility completion. */
  sessionId: string | null;
  model: string;
  clientType: string | null;
  baseUrl: string | null;
  /**
   * The provider endpoint this call went to, as far as it can be known from the configured base
   * URL and the protocol: `<baseUrl><the SDK's own path>` (see modelRequestUrl). null when the
   * caller configured no base URL (the SDK then uses its vendor default, which this module does
   * not guess). The Network panel's model rows show this instead of the internal
   * `/api/sessions/<id>/model` placeholder.
   */
  url: string | null;
  /** Server clock, ms. */
  startedAt: number;
  endedAt: number;
  /** The request's terminal state, in the same vocabulary `request_end` uses. */
  status: StopReason;
  errorCode: string | null;
  errorMessage: string | null;
  request: ModelExchangeRequest;
  response: ModelExchangeResponse;
}

export type ModelExchangeSink = (record: ModelExchangeRecord) => void;

/**
 * The provider endpoint a model call goes to, derived from the configured base URL and the
 * protocol.
 *
 * The call itself is made inside @prismshadow/agenthub, which builds an SDK client from
 * `baseUrl` + `clientType` (or the model name when no client type is pinned). Those SDKs append
 * their own fixed path — the OpenAI SDK `chat/completions` or `responses`, the Anthropic SDK
 * `v1/messages`, the Google SDK `v1beta/models/<model>:streamGenerateContent` — and this repeats
 * that rule so the Network panel can name the real endpoint instead of the internal session path.
 *
 * The rule is deliberately literal: the SDK does not add a version segment to a caller-supplied
 * base URL, so a base that already ends with `/v1` keeps it and the path is appended as the SDK
 * appends it. Null when no base URL is configured: the SDK then talks to its vendor default,
 * which differs per protocol, and guessing it would put a URL on screen that was never used.
 */
export function modelRequestUrl(
  baseUrl: string | null,
  clientType: string | null,
  model: string,
): string | null {
  if (baseUrl === null || baseUrl.trim() === "") return null;
  const base = baseUrl.replace(/\/+$/, "");
  // The client type AgentHub resolved (its own fallback is the model name, lowercased).
  const type = (clientType ?? model).toLowerCase();
  if (type.includes("gemini-3") || type.includes("gemini-embedding")) {
    return `${base}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  }
  if (
    type.includes("ant-messages") ||
    (type.includes("claude") &&
      (type.includes("4-6") || type.includes("4-7") || type.includes("4-8") || type.includes("-5")))
  ) {
    return `${base}/v1/messages`;
  }
  if (
    type.includes("openai-responses") ||
    type.includes("deepseek-v4") ||
    type.includes("gpt-5.") ||
    type.includes("gpt-6") ||
    type.includes("minimax-m3")
  ) {
    return `${base}/responses`;
  }
  return `${base}/chat/completions`;
}

let sink: ModelExchangeSink | null = null;
let sequence = 0;

/**
 * Install (or clear, with null) the process's single sink. The last caller wins: a host owns one
 * log for its whole process, not one per model.
 */
export function setModelExchangeSink(next: ModelExchangeSink | null): void {
  sink = next;
}

/** Whether anyone is listening — lets a hot path skip building a record nobody would keep. */
export function hasModelExchangeSink(): boolean {
  return sink !== null;
}

/** Report one finished exchange. No sink installed: nothing happens. */
export function emitModelExchange(record: Omit<ModelExchangeRecord, "seq">): void {
  if (sink === null) return;
  sequence += 1;
  sink({ ...record, seq: sequence });
}

/** The wire config split into the three fields the record keeps, from this request's resolved `UniConfig`. */
export function splitExchangeConfig(config: UniConfig): {
  systemPrompt: string | null;
  tools: unknown[] | null;
  config: Record<string, unknown>;
} {
  const { system_prompt, tools, ...rest } = config as Record<string, unknown>;
  return {
    systemPrompt: typeof system_prompt === "string" ? system_prompt : null,
    tools: Array.isArray(tools) ? tools : null,
    config: rest,
  };
}

/** The history to snapshot for a request: the client's replayed history plus the input being sent. */
export function exchangeMessages(history: UniMessage[], input: UniMessage): unknown[] {
  return [...history, input];
}
