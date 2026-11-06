/**
 * Speech input: the server's own call to a streaming speech-to-text provider.
 *
 * The composer's microphone records in the browser, but the TRANSCRIPTION happens here, on
 * the server, for two reasons: the desktop shell has no Web Speech API to fall back on, so a
 * browser-side recognizer would make the two clients behave differently; and the API key then
 * lives in one place instead of being handed to every browser that opens the page.
 *
 * The protocol is the one Alibaba's DashScope documents for its ASR models and the TokenDance
 * gateway re-serves under `/gateway/alibaba/api-ws/v1/inference`: one WebSocket per utterance,
 * a `run-task` frame naming the model and the audio's format, then the audio in ~100 ms frames,
 * then `finish-task`; the transcript arrives as `result-generated` frames carrying one sentence
 * each, and `task-finished` ends it. Every frame is JSON except the audio itself.
 *
 * The transport's shape (undici's EventTarget WebSocket) never leaves this file: {@link
 * FrameStream} turns it into an ordered queue whose reader applies the deadline, so a stalled
 * upstream surfaces as `asr_timeout` instead of hanging the request.
 */
import { setTimeout as sleep } from "node:timers/promises";
import { WebSocket } from "undici";

/** Site the ASR endpoint hangs off when nothing is configured. */
export const DEFAULT_ASR_BASE_URL = "https://tokendance.space";

/** Model transcribed with when nothing is configured. */
export const DEFAULT_ASR_MODEL = "qwen-audio-3.1-asr-flash-streaming";

/**
 * Where the streaming protocol lives, appended to the configured site's ORIGIN. Only the
 * origin is taken from the setting, so an address that also carries a path (a gateway's
 * `/gateway/v1`, say) still resolves to the same endpoint.
 */
export const ASR_WS_PATH = "/gateway/alibaba/api-ws/v1/inference";

/** Sample rate the composer records at; the value travels with the audio and upstream. */
export const ASR_SAMPLE_RATE = 16_000;

/** Longest utterance accepted, in seconds — ~1.9 MB of 16 kHz mono PCM16. */
export const ASR_MAX_SECONDS = 60;

/** Sound-bytes cap for one utterance, derived from {@link ASR_MAX_SECONDS}. */
export const ASR_MAX_BYTES = ASR_SAMPLE_RATE * 2 * ASR_MAX_SECONDS;

/** One frame's worth of audio: ~100 ms at 16 kHz mono PCM16, the pace the protocol documents. */
const CHUNK_BYTES = ASR_SAMPLE_RATE * 0.2;

/**
 * Pause between audio frames. Sending a whole utterance back-to-back works, but this is the
 * pace the protocol asks for and it costs little on the utterance lengths accepted here.
 */
const CHUNK_PAUSE_MS = 10;

/** How long the socket itself may take to open. */
const HANDSHAKE_TIMEOUT_MS = 15_000;

/** How long the whole call may take, on top of the audio's own length. */
const OVERALL_SLACK_MS = 30_000;

/** A failure the route turns into an HTTP answer. `code` is what the Web App localizes. */
export type AsrErrorCode = "asr_unreachable" | "asr_upstream" | "asr_timeout";

export class AsrError extends Error {
  constructor(
    readonly code: AsrErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AsrError";
  }
}

export interface AsrRequest {
  /** The configured site, e.g. `https://tokendance.space` (empty takes the default). */
  baseUrl: string;
  /** The configured model id (empty takes the default). */
  model: string;
  /** The configured key. An empty one is refused by the route, never sent. */
  apiKey: string;
  /** The utterance: raw little-endian PCM16, mono, at `sampleRate`. */
  pcm: Uint8Array;
  sampleRate: number;
}

/** One frame of the protocol, reduced to what this product reads out of it. */
type AsrEvent =
  | { kind: "started" }
  | { kind: "sentence"; text: string }
  | { kind: "finished" }
  | { kind: "failed"; code: string; message: string };

/**
 * The WebSocket endpoint a configured site resolves to. Throws on an address that is not a
 * URL — the settings route validates before storing, so reaching this with one is a bug, not
 * a user error.
 */
export function asrWebSocketUrl(baseUrl: string): string {
  const site = baseUrl.trim() === "" ? DEFAULT_ASR_BASE_URL : baseUrl.trim();
  let url: URL;
  try {
    url = new URL(site);
  } catch {
    throw new Error(`ASR base URL is not a URL: ${site}`);
  }
  const scheme = url.protocol === "http:" ? "ws:" : "wss:";
  return `${scheme}//${url.host}${ASR_WS_PATH}`;
}

/** The model id a configured value resolves to. */
export function asrModel(model: string): string {
  return model.trim() === "" ? DEFAULT_ASR_MODEL : model.trim();
}

/**
 * Read one inbound frame. Anything this product has no use for (a binary frame, a heartbeat
 * shape, malformed JSON, an event added later) reads as null and is ignored: the protocol is
 * the provider's to extend.
 */
export function parseAsrEvent(raw: string): AsrEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const header = (parsed as { header?: Record<string, unknown> }).header;
  if (header === undefined || header === null) return null;
  const event = header.event;
  if (event === "task-started") return { kind: "started" };
  if (event === "task-finished") return { kind: "finished" };
  if (event === "task-failed") {
    return {
      kind: "failed",
      code: typeof header.error_code === "string" ? header.error_code : "asr_failed",
      message: typeof header.error_message === "string" ? header.error_message : "",
    };
  }
  if (event === "result-generated") {
    const sentence = (parsed as { payload?: { output?: { sentence?: unknown } } }).payload?.output
      ?.sentence as { text?: unknown } | undefined;
    if (sentence === undefined || sentence === null) return null;
    return { kind: "sentence", text: typeof sentence.text === "string" ? sentence.text : "" };
  }
  return null;
}

/** The transcript a stream of events adds up to, in the order they arrived. */
export function transcriptOf(events: readonly AsrEvent[]): string {
  return events
    .filter((e): e is Extract<AsrEvent, { kind: "sentence" }> => e.kind === "sentence")
    .map((e) => e.text)
    .join("");
}

/**
 * Transcribe one utterance and return its transcript. An empty transcript is a legitimate
 * answer — silence is not a failure, and the composer must not report one.
 */
export async function transcribeStreaming(req: AsrRequest): Promise<string> {
  const socket = new WebSocket(asrWebSocketUrl(req.baseUrl), {
    headers: { Authorization: `Bearer ${req.apiKey}` },
  });
  const frames = new FrameStream(socket);
  const deadline = Date.now() + OVERALL_SLACK_MS + (req.pcm.length / (req.sampleRate * 2)) * 1000;

  try {
    await frames.opened(HANDSHAKE_TIMEOUT_MS);
    // One utterance is one task, and both frames have to name the same one: `finish-task`
    // closes the task `run-task` opened.
    const task = taskId();
    socket.send(
      JSON.stringify({
        header: { action: "run-task", task_id: task, streaming: "duplex" },
        payload: {
          task_group: "audio",
          task: "asr",
          function: "recognition",
          model: asrModel(req.model),
          parameters: { format: "pcm", sample_rate: req.sampleRate },
          input: {},
        },
      }),
    );
    await untilStarted(frames, deadline);

    for (let offset = 0; offset < req.pcm.length; offset += CHUNK_BYTES) {
      socket.send(req.pcm.subarray(offset, offset + CHUNK_BYTES));
      if (offset + CHUNK_BYTES < req.pcm.length) await sleep(CHUNK_PAUSE_MS);
    }
    socket.send(
      JSON.stringify({
        header: { action: "finish-task", task_id: task, streaming: "duplex" },
        payload: { input: {} },
      }),
    );

    const sentences: AsrEvent[] = [];
    for (;;) {
      const event = await frames.next(deadline);
      if (event.kind === "finished") return transcriptOf(sentences);
      if (event.kind === "failed") throw upstreamFailure(event.code, event.message);
      if (event.kind === "sentence") sentences.push(event);
    }
  } finally {
    frames.dispose();
  }
}

/**
 * Wait for `task-started`. A `task-failed` before it — the shape an auth refusal takes — is
 * reported as it came.
 */
async function untilStarted(frames: FrameStream, deadline: number): Promise<void> {
  for (;;) {
    const event = await frames.next(deadline);
    if (event.kind === "started") return;
    if (event.kind === "failed") throw upstreamFailure(event.code, event.message);
  }
}

/**
 * The provider refused the task. Its own words are the message: they name what is wrong (an
 * unknown key, a model the account cannot use) and the settings page is where that gets fixed,
 * so wrapping them in this product's English would only put a translation between the operator
 * and the answer.
 */
function upstreamFailure(code: string, message: string): AsrError {
  return new AsrError("asr_upstream", message.trim() === "" ? code : message.trim(), 502);
}

function taskId(): string {
  return `asr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * A WebSocket as an ordered queue of {@link AsrEvent}. Frames that arrive before anyone is
 * reading are buffered, so nothing is lost between the handshake and the collect loop; the
 * socket's own failure is handed to the reader (and to every later one) as the rejection it
 * is, which is how an unreachable service keeps its own name instead of being read as a
 * refusal by the provider.
 */
class FrameStream {
  private readonly buffered: AsrEvent[] = [];
  private waiting: ((event: AsrEvent) => void) | null = null;
  private readonly openWaiters: {
    resolve: () => void;
    reject: (err: AsrError) => void;
    timer: NodeJS.Timeout;
  }[] = [];
  private isOpen = false;
  private failure: AsrError | null = null;

  constructor(private readonly socket: WebSocket) {
    socket.addEventListener("open", () => {
      this.isOpen = true;
      for (const waiter of this.openWaiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.resolve();
      }
    });
    socket.addEventListener("message", (event) => {
      const data = event.data;
      if (typeof data !== "string") return;
      const parsed = parseAsrEvent(data);
      if (parsed !== null) this.push(parsed);
    });
    socket.addEventListener("error", () => {
      this.fail(new AsrError("asr_unreachable", "Could not reach the speech service.", 502));
    });
    socket.addEventListener("close", () => {
      this.fail(new AsrError("asr_unreachable", "The speech service closed the connection.", 502));
    });
  }

  /** Resolves once the socket is open; rejects with `asr_unreachable` if it never is. */
  opened(timeoutMs: number): Promise<void> {
    if (this.failure !== null) return Promise.reject(this.failure);
    if (this.isOpen) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const err = new AsrError(
          "asr_unreachable",
          "Could not reach the speech service in time.",
          502,
        );
        this.fail(err);
      }, timeoutMs);
      timer.unref();
      this.openWaiters.push({ resolve, reject, timer });
    });
  }

  /** The next frame, or a rejection once the socket has failed or `deadline` has passed. */
  next(deadline: number): Promise<AsrEvent> {
    const buffered = this.buffered.shift();
    if (buffered !== undefined) return Promise.resolve(buffered);
    if (this.failure !== null) return Promise.reject(this.failure);
    return new Promise<AsrEvent>((resolve, reject) => {
      const timer = setTimeout(
        () => {
          if (this.waiting !== resolve) return;
          this.waiting = null;
          reject(new AsrError("asr_timeout", "The speech service did not answer in time.", 504));
        },
        Math.max(1, deadline - Date.now()),
      );
      timer.unref();
      this.waiting = (event) => {
        clearTimeout(timer);
        resolve(event);
      };
    });
  }

  dispose(): void {
    this.waiting = null;
    for (const waiter of this.openWaiters.splice(0)) clearTimeout(waiter.timer);
    if (this.socket.readyState < 2) this.socket.close();
  }

  private push(event: AsrEvent): void {
    const waiting = this.waiting;
    if (waiting === null) {
      this.buffered.push(event);
      return;
    }
    this.waiting = null;
    waiting(event);
  }

  private fail(err: AsrError): void {
    if (this.failure === null) this.failure = err;
    for (const waiter of this.openWaiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(this.failure);
    }
  }
}
