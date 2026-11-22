/**
 * Real-time voice: the speech-to-speech model the desktop pet's call runs on.
 *
 * A call is not the composer's microphone (services/asr.ts). There, one recording goes up and a
 * transcript comes back. Here a single WebSocket carries a whole spoken conversation: audio up,
 * audio down, the transcript of both, and the moment the user talks again — which is what
 * interrupts a reply that is still being spoken. The endpoint, the model, the voice and the key
 * are the deployment's, so they are stored beside the speech-input ones and the key is added on
 * the server's own hop: the browser never sees it.
 *
 * ONE protocol, one shape. The transport (realtime/ws.ts) is a pipe between the browser and the
 * provider's realtime endpoint, and the frames are the provider's own — a `session.update` naming
 * the voice and the audio formats, `input_audio_buffer.append` carrying 16 kHz PCM16 up,
 * `response.audio.delta` carrying 24 kHz PCM24 back. What this file owns is both ends of that: the
 * endpoint a configured site resolves to, what the session is told when a call starts, and the
 * connectivity check the settings page runs before anyone puts a microphone in front of it.
 */
import { WebSocket } from "ws";

/** Site the realtime endpoint hangs off when nothing is configured. */
export const DEFAULT_REALTIME_BASE_URL = "https://dashscope.aliyuncs.com";

/** Model the call runs on when nothing is configured. */
export const DEFAULT_REALTIME_MODEL = "qwen3.8-omni-flash-realtime";

/** Voice the model answers in when nothing is configured. */
export const DEFAULT_REALTIME_VOICE = "Tina";

/** Where the realtime protocol lives, appended to the configured site's ORIGIN. */
export const REALTIME_WS_PATH = "/api-ws/v1/realtime";

/**
 * The model that transcribes the user's own speech in the call, so both sides of the conversation
 * can be shown as text. It is fixed rather than configurable: it is a detail of how the call is
 * presented, and the provider serves this one for every realtime model in the catalog.
 */
export const REALTIME_TRANSCRIPTION_MODEL = "qwen3-asr-flash-realtime";

/** Sample rate of the audio the browser sends up, and of the audio it gets back. */
export const REALTIME_INPUT_RATE = 16_000;
export const REALTIME_OUTPUT_RATE = 24_000;

/**
 * What the pet says it is when the call starts. It is the server's to write, not the page's: a
 * browser can put anything in a `session.update` it sends itself, and the persona of the
 * companion window is one thing that should read the same wherever the app runs. Short spoken
 * sentences, no markup, because everything here is heard rather than read.
 */
export const REALTIME_INSTRUCTIONS =
  "你是桌面上的 Adelie 小企鹅，用自然、口语化的中文跟主人聊天。像朋友说话那样：直接回应对方真正问的事，" +
  "句子短，一次只说一两句，不用列表、标题或任何 markdown 符号，不要念出标点。没听清就自然地问一句，别瞎猜。";

/**
 * Model ids and voices the settings page offers. Both lists were verified against this account
 * when the call was built: every model streams, every voice speaks. What the provider accepts is
 * still the provider's business — a deployment may store any id through the settings page, and a
 * wrong one surfaces on the next call as the provider's own refusal.
 */
export const REALTIME_MODELS = [
  "qwen3.8-omni-flash-realtime",
  "qwen3.5-omni-plus-realtime",
  "qwen-audio-3.1-realtime-plus",
] as const;

export const REALTIME_VOICES = ["Tina", "Serena", "Sunny", "Kiki", "Dylan"] as const;

/** How long a connectivity check may take: one handshake and one session update. */
const PROBE_TIMEOUT_MS = 10_000;

/**
 * The shape of an id that may be put in a URL or a session frame. Deliberately narrow: these
 * values reach both an upstream query string and the provider's own protocol, and the provider's
 * model and voice ids are all of this alphabet.
 */
const ID_SHAPE = /^[A-Za-z0-9._:-]{1,64}$/;

/** A failure the settings route turns into an answer. `message` is the provider's own sentence. */
export class RealtimeError extends Error {
  constructor(
    readonly code:
      | "realtime_unreachable"
      | "realtime_credential_refused"
      | "realtime_upstream"
      | "realtime_timeout",
    message: string,
  ) {
    super(message);
    this.name = "RealtimeError";
  }
}

/** What a configuration resolves to at the far end: the site, the model and the voice. */
export interface RealtimeTarget {
  /** The configured site, e.g. `https://dashscope.aliyuncs.com` (blank takes the default). */
  baseUrl: string;
  /** The configured model id (blank takes the default). */
  model: string;
  /** The configured voice (blank takes the default). */
  voice: string;
}

/** The model a configured value resolves to. */
export function realtimeModel(model: string): string {
  const value = model.trim();
  return value === "" ? DEFAULT_REALTIME_MODEL : value;
}

/** The voice a configured value resolves to. */
export function realtimeVoice(voice: string): string {
  const value = voice.trim();
  return value === "" ? DEFAULT_REALTIME_VOICE : value;
}

/** Whether a model id or a voice is shaped like one. */
export function isRealtimeId(value: string): boolean {
  return ID_SHAPE.test(value);
}

/**
 * The WebSocket endpoint a configured site resolves to. The model rides the query string, which
 * is how the provider's realtime protocol names it — one connection serves one model. Throws on
 * an address that is not a URL: the settings route validates before storing, so reaching this
 * with one is a bug rather than a user's mistake.
 */
export function realtimeWebSocketUrl(baseUrl: string, model: string): string {
  const site = baseUrl.trim() === "" ? DEFAULT_REALTIME_BASE_URL : baseUrl.trim();
  let url: URL;
  try {
    url = new URL(site);
  } catch {
    throw new Error(`realtime base URL is not a URL: ${site}`);
  }
  // Only the origin is taken from the setting, so an address that also carries a path resolves
  // to the same endpoint.
  const scheme = url.protocol === "http:" ? "ws:" : "wss:";
  return `${scheme}//${url.host}${REALTIME_WS_PATH}?model=${encodeURIComponent(model)}`;
}

/**
 * What the session is told once the upstream connection is open, before any audio moves: both
 * directions in the formats the transport actually carries (PCM16 up, PCM24 back), the voice, the
 * instructions above, a transcript of the user's own speech, and the provider's own voice-activity
 * detection. `server_vad` is what makes the conversation turn-taking rather than push-to-talk, and
 * `interrupt_response` is what makes the user's first word stop a reply that is still playing.
 */
export function realtimeSession(voice: string): Record<string, unknown> {
  return {
    modalities: ["text", "audio"],
    voice: realtimeVoice(voice),
    instructions: REALTIME_INSTRUCTIONS,
    input_audio_format: "pcm16",
    output_audio_format: "pcm24",
    input_audio_transcription: { model: REALTIME_TRANSCRIPTION_MODEL },
    turn_detection: {
      type: "server_vad",
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 650,
      create_response: true,
      interrupt_response: true,
    },
  };
}

/** What a connectivity check found. */
export interface RealtimeProbe {
  /** Whether the configured site opened a session with this model, voice and key. */
  ok: boolean;
  /** The provider's own words when it refused, this product's sentence when it was unreachable. */
  message: string;
}

/**
 * Ask the configured service whether it will take this site, this model and this key: one
 * connection, one session update, and the provider's answer to it. It is the call a conversation
 * makes minus the audio, so what it proves is what pressing the call button proves.
 *
 * A refusal is an ANSWER, not a failure of the check: everything comes back as `ok: false`
 * carrying the sentence the provider sent, which is what the settings page puts in front of the
 * operator. Only a bug inside this file throws.
 */
export async function probeRealtime(
  req: RealtimeTarget & { apiKey: string },
): Promise<RealtimeProbe> {
  const url = realtimeWebSocketUrl(req.baseUrl, realtimeModel(req.model));
  return new Promise<RealtimeProbe>((resolve, reject) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(url, { headers: { Authorization: `Bearer ${req.apiKey}` } });
    } catch {
      reject(new RealtimeError("realtime_unreachable", "Could not reach the speech service."));
      return;
    }
    let settled = false;
    const finish = (probe: RealtimeProbe) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // already gone
      }
      resolve(probe);
    };
    const timer = setTimeout(
      () => finish({ ok: false, message: "The speech service did not answer in time." }),
      PROBE_TIMEOUT_MS,
    );
    timer.unref();
    socket.on("open", () => {
      socket.send(JSON.stringify({ type: "session.update", session: realtimeSession(req.voice) }));
    });
    socket.on("message", (data: unknown) => {
      const frame = asRecord(parseJson(String(data)));
      if (frame === null) return;
      if (frame.type === "session.updated") {
        finish({ ok: true, message: "" });
        return;
      }
      if (frame.type === "error") {
        const message = asRecord(frame.error)?.message;
        finish({
          ok: false,
          message:
            typeof message === "string" && message !== ""
              ? message
              : "The speech service refused the session.",
        });
      }
    });
    // A refused credential and a path that is not the endpoint both arrive here, with the HTTP
    // status the provider answered — which is the one thing that tells an operator which of the
    // two it is, so it is named rather than folded into "could not reach".
    socket.on("unexpected-response", (_request, response) => {
      let body = "";
      response.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      response.on("end", () => {
        const status = response.statusCode ?? 0;
        if (status === 401 || status === 403) {
          finish({
            ok: false,
            message: `The speech service refused the credential (HTTP ${status}).`,
          });
          return;
        }
        const detail = body.trim().slice(0, 200);
        finish({
          ok: false,
          message: `The speech service answered HTTP ${status}${detail === "" ? "" : `: ${detail}`} instead of upgrading the connection.`,
        });
      });
    });
    socket.on("error", () => finish({ ok: false, message: "Could not reach the speech service." }));
    socket.on("close", () =>
      finish({ ok: false, message: "The speech service closed the connection." }),
    );
  });
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
