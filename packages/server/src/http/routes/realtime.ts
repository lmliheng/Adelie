/**
 * Real-time voice routes — the desktop pet's call.
 *
 * GET|PUT /api/realtime/config is an admin's: it holds the key the server relays with, and every
 * browser that opens a page would otherwise be able to read it. The read is masked the way a
 * Project's model credentials are — `hasKey`, never the key — and a PUT that omits `apiKey` (or
 * sends an empty one) keeps whatever is stored.
 *
 * POST /api/realtime/test is an admin's too: the settings page's connectivity check. It resolves
 * the fields the same way a PUT does — an omitted one falls back to what is stored — so the page
 * can check a form it has not saved yet, and nothing is written either way.
 *
 * GET /api/realtime/status is every signed-in user's: whether a call is possible (a key is
 * stored), and which model and voice it would use. No key, no model id is a secret — this is what
 * lets the pet window offer the call button only where it can lead somewhere.
 *
 * The call itself is not here: it is a WebSocket upgrade on `/api/realtime` (realtime/ws.ts),
 * which a seam handler cannot answer.
 */
import { Hono } from "hono";
import type {
  RealtimeConfig,
  RealtimeConfigResponse,
  RealtimeStatusResponse,
  RealtimeTestResponse,
} from "../../api/types.js";
import { HttpError } from "../errors.js";
import { readJson } from "../validate.js";
import { Bind, Component, Use } from "@adelie/core/kernel";
import type { AppEnv } from "../../auth/middleware.js";
import type { Settings } from "../../mechanisms/settings.js";
import {
  DEFAULT_REALTIME_BASE_URL,
  DEFAULT_REALTIME_MODEL,
  DEFAULT_REALTIME_VOICE,
  isRealtimeId,
  realtimeModel,
  realtimeVoice,
  realtimeWebSocketUrl,
  probeRealtime,
} from "../../services/realtime.js";

/** What this route group reaches — bound by its module (src/modules). */
export interface RealtimeRouteDeps {
  settings: Settings;
}

export function realtimeRoutes(deps: RealtimeRouteDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  /** The masked view: the key is write-only, so only its presence is reported. */
  const config = (): RealtimeConfig => {
    const stored = deps.settings.getRealtimeSettings();
    return {
      baseUrl: stored.baseUrl,
      model: stored.model,
      voice: stored.voice,
      hasKey: stored.apiKey !== "",
    };
  };

  const requireAdmin = async (c: { var: AppEnv["Variables"] }, next: () => Promise<void>) => {
    if (!c.var.user.isAdmin) {
      throw new HttpError(403, "admin_required", "Only an admin can perform this operation.");
    }
    await next();
  };

  /**
   * Every field optional, each falling back the same way for both verbs below: an omitted field
   * takes the stored one, `null` takes the built-in default, and an omitted or empty key keeps the
   * stored one (the read never hands a key back, so a page that only edits the voice must not have
   * to blank its own credential to save).
   */
  const resolve = (body: Record<string, unknown>) => {
    const stored = deps.settings.getRealtimeSettings();
    const baseUrl =
      body.baseUrl === undefined
        ? stored.baseUrl
        : body.baseUrl === null
          ? DEFAULT_REALTIME_BASE_URL
          : parseBaseUrl(body.baseUrl);
    const model =
      body.model === undefined
        ? stored.model
        : body.model === null
          ? DEFAULT_REALTIME_MODEL
          : parseId(body.model, "invalid_realtime_model", "model");
    const voice =
      body.voice === undefined
        ? stored.voice
        : body.voice === null
          ? DEFAULT_REALTIME_VOICE
          : parseId(body.voice, "invalid_realtime_voice", "voice");
    const apiKey =
      body.apiKey === undefined
        ? stored.apiKey
        : typeof body.apiKey === "string" && body.apiKey.trim() === ""
          ? stored.apiKey
          : parseApiKey(body.apiKey);
    return { baseUrl, model, voice, apiKey };
  };

  app.get("/config", requireAdmin, (c) =>
    c.json({ config: config() } satisfies RealtimeConfigResponse),
  );

  app.put("/config", requireAdmin, async (c) => {
    // Every field is validated before any is written, so a PUT naming one bad value leaves the
    // rest as they were.
    deps.settings.setRealtimeSettings(resolve(await readJson(c)));
    return c.json({ config: config() } satisfies RealtimeConfigResponse);
  });

  app.get("/status", (c) => {
    const stored = deps.settings.getRealtimeSettings();
    return c.json({
      configured: stored.apiKey !== "",
      model: realtimeModel(stored.model),
      voice: realtimeVoice(stored.voice),
    } satisfies RealtimeStatusResponse);
  });

  /**
   * The settings page's connectivity check: one connection and one session update against the
   * resolved site. It answers 200 with `ok: false` when the service refused — the check itself
   * ran, and the operator wants the provider's sentence, not an HTTP status. Only the fields being
   * unresolvable (400) or no key being stored (400) are errors here.
   */
  app.post("/test", requireAdmin, async (c) => {
    const { baseUrl, model, voice, apiKey } = resolve(await readJson(c));
    if (apiKey === "") {
      throw new HttpError(
        400,
        "realtime_not_configured",
        "No real-time voice model is configured: set one under Settings > Server > Real-time voice.",
      );
    }
    const probe = await probeRealtime({ baseUrl, model, voice, apiKey });
    return c.json({
      ...probe,
      endpoint: realtimeWebSocketUrl(baseUrl, realtimeModel(model)),
    } satisfies RealtimeTestResponse);
  });

  return app;
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
    "invalid_realtime_base_url",
    "baseUrl must be an absolute http(s) URL, e.g. https://dashscope.aliyuncs.com.",
  );
}

/**
 * A model id or a voice. The same shape the relay will accept on the wire is required here, so a
 * value the page can save is a value a call can actually use.
 */
function parseId(value: unknown, code: string, field: string): string {
  if (typeof value === "string" && isRealtimeId(value.trim())) return value.trim();
  throw new HttpError(400, code, `${field} must be a model id or voice name.`);
}

/** The key: a non-empty string (an empty one was handled as "keep the stored key"). */
function parseApiKey(value: unknown): string {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  throw new HttpError(400, "invalid_realtime_api_key", "apiKey must be a non-empty string.");
}

@Component({
  contributes: {
    "HttpModule.routes": [
      {
        id: "realtime",
        prefix: "/api/realtime",
        auth: "user",
        order: 56,
      },
    ],
  },
})
export class RealtimeRoutes {
  @Use() private readonly settings!: Settings;
  @Bind("realtime") routes!: Hono<AppEnv>;
  setup() {
    this.routes = realtimeRoutes({ settings: this.settings });
  }
}
