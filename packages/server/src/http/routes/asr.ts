/**
 * Speech input routes — the composer's microphone.
 *
 * GET|PUT /api/asr/config is an admin's: it holds the provider key the server transcribes
 * with, and every browser that opens a page would otherwise be able to read it. The read is
 * masked the way a Project's model credentials are — `hasKey`, never the key — and a PUT
 * that omits `apiKey` (or sends an empty one) keeps whatever is stored.
 *
 * POST /api/asr/transcribe is every signed-in user's: the admin configured the key, and
 * anyone may then talk into it. The body carries the utterance itself — raw little-endian
 * PCM16 mono, base64 like every other binary body in this API — which is forwarded to the
 * provider and never written to disk. The answer is the transcript, which may be empty:
 * silence is not an error.
 */
import { Hono } from "hono";
import type { AsrConfig, AsrConfigResponse, AsrTranscribeResponse } from "../../api/types.js";
import { HttpError } from "../errors.js";
import { readJson } from "../validate.js";
import { Bind, Component, Use } from "@adelie/core/kernel";
import type { AppEnv } from "../../auth/middleware.js";
import type { Settings } from "../../mechanisms/settings.js";
import {
  ASR_MAX_BYTES,
  ASR_SAMPLE_RATE,
  AsrError,
  DEFAULT_ASR_BASE_URL,
  DEFAULT_ASR_MODEL,
  transcribe,
} from "../../services/asr.js";

/** Sample rates a recording may arrive at; the protocol accepts these and nothing else. */
const ACCEPTED_SAMPLE_RATES = [8_000, ASR_SAMPLE_RATE];

/** What this route group reaches — bound by its module (src/modules). */
export interface AsrRouteDeps {
  settings: Settings;
}

export function asrRoutes(deps: AsrRouteDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  /** The masked view: the key is write-only, so only its presence is reported. */
  const config = (): AsrConfig => {
    const stored = deps.settings.getAsrSettings();
    return { baseUrl: stored.baseUrl, model: stored.model, hasKey: stored.apiKey !== "" };
  };

  const requireAdmin = async (c: { var: AppEnv["Variables"] }, next: () => Promise<void>) => {
    if (!c.var.user.isAdmin) {
      throw new HttpError(403, "admin_required", "Only an admin can perform this operation.");
    }
    await next();
  };

  app.get("/config", requireAdmin, (c) => c.json({ config: config() } satisfies AsrConfigResponse));

  app.put("/config", requireAdmin, async (c) => {
    const body = await readJson(c);
    const stored = deps.settings.getAsrSettings();
    // Every field is validated before any is written, so a PUT naming one bad value leaves
    // the rest as they were.
    const baseUrl =
      body.baseUrl === undefined
        ? stored.baseUrl
        : body.baseUrl === null
          ? DEFAULT_ASR_BASE_URL
          : parseBaseUrl(body.baseUrl);
    const model =
      body.model === undefined
        ? stored.model
        : body.model === null
          ? DEFAULT_ASR_MODEL
          : parseModel(body.model);
    // Omitted or empty keeps the stored key — the read never hands it back, so a page that
    // only edits the model must not have to blank its own credential to save.
    const apiKey =
      body.apiKey === undefined
        ? stored.apiKey
        : typeof body.apiKey === "string" && body.apiKey.trim() === ""
          ? stored.apiKey
          : parseApiKey(body.apiKey);
    deps.settings.setAsrSettings({ baseUrl, model, apiKey });
    return c.json({ config: config() } satisfies AsrConfigResponse);
  });

  app.post("/transcribe", async (c) => {
    const stored = deps.settings.getAsrSettings();
    if (stored.apiKey === "") {
      throw new HttpError(
        400,
        "asr_not_configured",
        "No speech model is configured: set one under Settings > Server > Speech input.",
      );
    }
    const body = await readJson(c);
    const sampleRate = parseSampleRate(body.sampleRate);
    const pcm = parseAudio(body.dataBase64);
    try {
      const text = await transcribe({
        baseUrl: stored.baseUrl,
        model: stored.model,
        apiKey: stored.apiKey,
        pcm,
        sampleRate,
      });
      return c.json({ text } satisfies AsrTranscribeResponse);
    } catch (err) {
      if (err instanceof AsrError) throw new HttpError(err.status, err.code, err.message);
      throw err;
    }
  });

  return app;
}

/**
 * The recording, decoded. It is forwarded to the provider and never written to disk, but its
 * size is capped first: an unbounded body would be a way to make this server hold as much
 * memory as the client cares to send.
 */
function parseAudio(value: unknown): Uint8Array {
  if (typeof value !== "string" || value === "") {
    throw new HttpError(400, "asr_empty_audio", "The recording is empty.");
  }
  const pcm = new Uint8Array(Buffer.from(value, "base64"));
  if (pcm.length === 0) {
    throw new HttpError(400, "asr_empty_audio", "The recording is empty.");
  }
  if (pcm.length > ASR_MAX_BYTES) {
    throw new HttpError(413, "asr_too_long", "The recording is too long to transcribe.");
  }
  if (pcm.length % 2 !== 0) {
    throw new HttpError(400, "asr_bad_audio", "The recording is not 16-bit PCM.");
  }
  return pcm;
}

/** The configured site: an absolute http(s) URL, or its origin is not something we can call. */
function parseBaseUrl(value: unknown): string {
  if (typeof value === "string") {
    try {
      const url = new URL(value.trim());
      if (url.protocol === "http:" || url.protocol === "https:") return value.trim();
    } catch {
      // falls through to the refusal below
    }
  }
  throw new HttpError(
    400,
    "invalid_asr_base_url",
    "baseUrl must be an absolute http(s) URL, e.g. https://tokendance.space.",
  );
}

/** The model id: a non-empty string. What the provider accepts is the provider's business. */
function parseModel(value: unknown): string {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  throw new HttpError(400, "invalid_asr_model", "model must be a non-empty model id.");
}

/** The key: a non-empty string (an empty one was handled as "keep the stored key"). */
function parseApiKey(value: unknown): string {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  throw new HttpError(400, "invalid_asr_api_key", "apiKey must be a non-empty string.");
}

/**
 * The recording's sample rate. Refused rather than defaulted when it is not one the protocol
 * takes: a mismatch here is audio the provider would transcribe as noise, which reads to the
 * user as a broken microphone.
 */
function parseSampleRate(value: unknown): number {
  if (value === undefined || value === null) return ASR_SAMPLE_RATE;
  if (typeof value !== "number" || !ACCEPTED_SAMPLE_RATES.includes(value)) {
    throw new HttpError(
      400,
      "asr_bad_sample_rate",
      `sampleRate must be one of ${ACCEPTED_SAMPLE_RATES.join(", ")}.`,
    );
  }
  return value;
}

@Component({
  contributes: {
    "HttpModule.routes": [
      {
        id: "asr",
        prefix: "/api/asr",
        auth: "user",
        order: 55,
      },
    ],
  },
})
export class AsrRoutes {
  @Use() private readonly settings!: Settings;
  @Bind("asr") routes!: Hono<AppEnv>;
  setup() {
    this.routes = asrRoutes({ settings: this.settings });
  }
}
