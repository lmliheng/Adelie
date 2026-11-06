/**
 * Speech input: the server's own call to a streaming speech-to-text service.
 *
 * The composer's microphone records in the browser, but the TRANSCRIPTION happens here, on
 * the server, for two reasons: the desktop shell has no Web Speech API to fall back on, so a
 * browser-side recognizer would make the two clients behave differently; and the API key then
 * lives in one place instead of being handed to every browser that opens the page.
 *
 * ONE protocol, two sites — {@link asrWebSocketUrl} picks the path from the configured address.
 * Alibaba's Bailian serves the real-time models directly, and the gateway in front of it
 * re-serves the same models under its own prefix; both speak `run-task`: a frame naming the
 * model and the audio's format, then the recording in ~100 ms frames, then `finish-task`. The
 * transcript arrives as `result-generated` frames, one sentence at a time, and `task-finished`
 * ends it.
 *
 * The transport's shape (undici's EventTarget WebSocket) never leaves this file: {@link
 * FrameStream} turns it into an ordered queue whose reader applies the deadline, so a stalled
 * service surfaces as `asr_timeout` instead of hanging the request.
 */
import { setTimeout as sleep } from "node:timers/promises";
import { WebSocket } from "undici";

/** Site the speech endpoint hangs off when nothing is configured. */
export const DEFAULT_ASR_BASE_URL = "https://tokendance.space";

/** Model transcribed with when nothing is configured. */
export const DEFAULT_ASR_MODEL = "qwen-audio-3.1-asr-flash-streaming";

/**
 * Where the streaming protocol lives on the gateway that re-serves the models, appended to the
 * configured site's ORIGIN. Only the origin is taken from the setting, so an address that also
 * carries a path (a gateway's `/gateway/v1`, say) still resolves to the same endpoint.
 */
export const ASR_WS_PATH = "/gateway/alibaba/api-ws/v1/inference";

/** The same protocol as Alibaba's own site serves it, appended to that site's origin. */
export const BAILIAN_WS_PATH = "/api-ws/v1/inference";

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

/**
 * How long the diagnostic below may take. Shorter than the handshake: it runs only once the
 * handshake has already failed, and it asks a question a server that is there answers at once.
 */
const PROBE_TIMEOUT_MS = 8_000;

/** How long the whole call may take, on top of the audio's own length. */
const OVERALL_SLACK_MS = 30_000;

/** A failure the route turns into an HTTP answer. `code` is what the Web App localizes. */
export type AsrErrorCode =
  "asr_unreachable" | "asr_credential_refused" | "asr_upstream" | "asr_timeout";

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
  | { kind: "sentence"; id: string | null; text: string; final: boolean }
  | { kind: "finished" }
  | { kind: "failed"; code: string; message: string };

/**
 * The WebSocket endpoint a configured site resolves to. Throws on an address that is not a URL
 * — the settings route validates before storing, so reaching this with one is a bug, not a
 * user's mistake.
 */
export function asrWebSocketUrl(baseUrl: string): string {
  const site = baseUrl.trim() === "" ? DEFAULT_ASR_BASE_URL : baseUrl.trim();
  let url: URL;
  try {
    url = new URL(site);
  } catch {
    throw new Error(`ASR base URL is not a URL: ${site}`);
  }
  // Alibaba's own site, public or international, serves the models itself one path shorter.
  const bailian = url.hostname === "aliyuncs.com" || url.hostname.endsWith(".aliyuncs.com");
  const scheme = url.protocol === "http:" ? "ws:" : "wss:";
  return `${scheme}//${url.host}${bailian ? BAILIAN_WS_PATH : ASR_WS_PATH}`;
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
  const header = asRecord(asRecord(parsed)?.header);
  if (header === null) return null;
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
    const sentence = asRecord(asRecord(asRecord(parsed)?.payload)?.output)?.sentence;
    if (!isRecord(sentence)) return null;
    const id = sentence.sentence_id;
    return {
      kind: "sentence",
      id: typeof id === "string" || typeof id === "number" ? String(id) : null,
      text: typeof sentence.text === "string" ? sentence.text : "",
      final: sentence.sentence_end === true,
    };
  }
  return null;
}

/** A transcript being built from sentence frames — see {@link Transcript}. */
export function transcriptOf(events: readonly AsrEvent[]): string {
  const transcript = new Transcript();
  for (const event of events) {
    if (event.kind === "sentence") transcript.add(event);
  }
  return transcript.value;
}

/**
 * The transcript a stream of sentence frames adds up to. A sentence is NOT one frame: while it
 * is still being recognized the service sends the same sentence again with more of it — sixteen
 * seconds of speech arrives as roughly twenty frames revising one sentence, and the earlier
 * guesses contain words the later ones replace. So a frame that names its sentence replaces the
 * text held for that sentence, and the sentences are joined in the order they first appeared.
 *
 * That flag is not what ends a sentence here: the live service never marks `sentence_end`, not
 * even on its last frame before `task-finished`, so waiting for it would return nothing. A frame
 * that names no sentence therefore counts only when it is marked finished — the shape the
 * gateway's own example prints — and everything else is a revision of something already counted.
 */
class Transcript {
  private readonly sentences: { text: string }[] = [];
  private readonly at = new Map<string, number>();

  add(sentence: { id: string | null; text: string; final: boolean }): void {
    if (sentence.id === null) {
      if (sentence.final) this.sentences.push({ text: sentence.text });
      return;
    }
    const index = this.at.get(sentence.id);
    if (index === undefined) {
      this.at.set(sentence.id, this.sentences.length);
      this.sentences.push({ text: sentence.text });
      return;
    }
    this.sentences[index]!.text = sentence.text;
  }

  get value(): string {
    return this.sentences.map((s) => s.text).join("");
  }
}

/**
 * Transcribe one utterance and return its transcript. An empty transcript is a legitimate
 * answer — silence is not a failure, and the composer must not report one.
 */
export async function transcribe(req: AsrRequest): Promise<string> {
  const socket = new WebSocket(asrWebSocketUrl(req.baseUrl), {
    headers: { Authorization: `Bearer ${req.apiKey}` },
  });
  const frames = new FrameStream(socket);
  const deadline = Date.now() + OVERALL_SLACK_MS + durationMs(req.pcm.length, req.sampleRate);

  try {
    try {
      await frames.opened(HANDSHAKE_TIMEOUT_MS);
    } catch (err) {
      throw err instanceof AsrError ? await explainHandshake(err, req) : err;
    }
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
      if (event.kind === "failed") throw upstreamFailure(event.message.trim() || event.code);
      if (event.kind === "sentence") sentences.push(event);
    }
  } finally {
    frames.dispose();
  }
}

/**
 * How much silence a connectivity check plays: half a second at 16 kHz mono PCM16. Not none —
 * `finish-task` on a task that never carried audio is a shape the protocol does not document,
 * and this is short enough to be free while still being a whole request end to end.
 */
const PROBE_BYTES = ASR_SAMPLE_RATE;

/** What a connectivity check found. */
export interface AsrProbe {
  /** Whether the configured site answered a whole task with this model and key. */
  ok: boolean;
  /** The provider's own words when it refused, this product's sentence when it was unreachable; empty when ok. */
  message: string;
}

/**
 * Ask the configured service whether it will take this site, this model and this key: one task,
 * opened and finished, over half a second of silence. It is the call a recording makes minus the
 * recording, so what it proves is what pressing the microphone proves — `ok` means the next
 * utterance reaches a service that answers it.
 *
 * A refusal is an ANSWER, not a failure of the check: everything comes back as `ok: false`
 * carrying the sentence the provider sent, which is what the settings page puts in front of the
 * operator. Only a bug inside this file throws.
 */
export async function probeAsr(req: Omit<AsrRequest, "pcm" | "sampleRate">): Promise<AsrProbe> {
  try {
    await transcribe({ ...req, pcm: new Uint8Array(PROBE_BYTES), sampleRate: ASR_SAMPLE_RATE });
    return { ok: true, message: "" };
  } catch (err) {
    if (err instanceof AsrError) return { ok: false, message: err.message };
    throw err;
  }
}

/**
 * A handshake that never completed, explained.
 *
 * The transport cannot say WHY: undici's WebSocket reports a refused credential, a path that is
 * not the endpoint and a host that does not exist with the same bare `TypeError` and the same
 * close code, so all three used to arrive as "could not reach" — and an operator sent to look at
 * the network for a key that is simply wrong. The two are told apart by asking the same address
 * once over HTTP with the same credential, which a service that is there answers at once (the
 * path wants an upgrade, so a working credential reads 4xx and a refused one reads 401).
 *
 * When even that request cannot be made, the socket's own sentence stands: nothing is there to
 * ask. Only a handshake failure is explained this way — a socket that dies mid-task is not a
 * configuration problem and keeps its own name.
 */
async function explainHandshake(err: AsrError, req: AsrRequest): Promise<AsrError> {
  if (err.code !== "asr_unreachable") return err;
  let status: number;
  try {
    const res = await fetch(asrWebSocketUrl(req.baseUrl).replace(/^ws/, "http"), {
      headers: { Authorization: `Bearer ${req.apiKey}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    status = res.status;
    await res.text();
  } catch {
    return err;
  }
  if (status === 401 || status === 403) {
    return new AsrError(
      "asr_credential_refused",
      `The speech service refused the credential (HTTP ${status}).`,
      502,
    );
  }
  return new AsrError(
    "asr_unreachable",
    `The speech service answered HTTP ${status} instead of upgrading the connection.`,
    502,
  );
}

/**
 * Wait for `task-started`. A `task-failed` before it — the shape an auth refusal takes — is
 * reported as it came.
 */
async function untilStarted(frames: FrameStream, deadline: number): Promise<void> {
  for (;;) {
    const event = await frames.next(deadline);
    if (event.kind === "started") return;
    if (event.kind === "failed") throw upstreamFailure(event.message.trim() || event.code);
  }
}

/**
 * The service refused or failed the task. Its own words are the message: they name what is wrong
 * (an unknown key, a model the account cannot use, an account in arrears) and the settings page
 * is where that gets fixed, so wrapping them in this product's English would only put a
 * translation between the operator and the answer.
 */
function upstreamFailure(message: string): AsrError {
  return new AsrError("asr_upstream", message.trim(), 502);
}

/**
 * How long an utterance of this many bytes takes to play, in milliseconds — a whole number,
 * because that is all a timer takes when it is handed one.
 */
function durationMs(bytes: number, sampleRate: number): number {
  return Math.round((bytes / (sampleRate * 2)) * 1000);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
