/**
 * Feedback routes: the sidebar's feedback entry, and whether this install has anywhere to
 * send it.
 *
 *   GET  /api/feedback  -> { ok, configured }  whether a feedback endpoint is configured
 *   POST /api/feedback  -> { ok, id? }         forwards the entry's words to that endpoint
 *
 * The endpoint is the Adelie requirements box (ADELIE_FEEDBACK_URL, the key in
 * ADELIE_FEEDBACK_KEY, see config.ts): the UI posts its title and detail here, this route
 * forwards them as the box's `POST /api/requirements`, and the round the patrol runs picks
 * the item up like any other. The hop exists because the box's key is the operator's — it is
 * held by this process and never reaches the browser, and the box itself needs neither CORS
 * nor to be reachable from wherever the user happens to sit.
 *
 * The browser is told only whether there is somewhere to send to (GET), never where: a
 * 404/500 at the other end is this route's problem to report, not the client's to explain.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../auth/middleware.js";
import { Bind, Component, Use } from "@lmliheng/penguin-core/kernel";
import type { FeedbackConfigResponse, FeedbackResponse } from "../../api/types.js";
import type { ServerConfig } from "../../config.js";
import type { Config } from "../../hmr/capabilities.js";
import { HttpError } from "../errors.js";
import { badRequest, readJson } from "../validate.js";
import type { HttpFetch } from "../../services/update-check-service.js";

export interface FeedbackRouteDeps {
  config: ServerConfig;
  /** Outbound HTTP, injectable so tests need not stub the global fetch. */
  http: HttpFetch;
}

/** The box trims and caps these itself; the same caps here give the user an answer before the hop. */
const MAX_TITLE = 200;
const MAX_DETAIL = 20000;

/** A feedback submission must not hold a request thread open behind a wedged backend. */
const FEEDBACK_TIMEOUT_MS = 10_000;

export function feedbackRoutes(deps: FeedbackRouteDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/", (c) => {
    const body: FeedbackConfigResponse = { ok: true, configured: deps.config.feedbackUrl !== null };
    return c.json(body);
  });

  routes.post("/", async (c) => {
    const { feedbackUrl, feedbackKey } = deps.config;
    // Checked here rather than in a middleware: the entry is hidden without an endpoint, so
    // this only answers a hand-made request — and it answers with a code the UI can name.
    if (feedbackUrl === null) {
      throw new HttpError(
        503,
        "feedback_not_configured",
        "This install has no feedback endpoint (ADELIE_FEEDBACK_URL).",
      );
    }

    const body = await readJson(c);
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const detail = typeof body.detail === "string" ? body.detail.trim() : "";
    if (title === "") throw badRequest("title must not be empty.");
    if (title.length > MAX_TITLE)
      throw badRequest(`title must be at most ${MAX_TITLE} characters.`);
    if (detail.length > MAX_DETAIL)
      throw badRequest(`detail must be at most ${MAX_DETAIL} characters.`);

    let response: Response;
    try {
      response = await deps.http.fetch(feedbackUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(feedbackKey !== null ? { "x-adelie-key": feedbackKey } : {}),
        },
        body: JSON.stringify({ title, detail }),
        signal: AbortSignal.timeout(FEEDBACK_TIMEOUT_MS),
      });
    } catch {
      // The backend's own error text is not relayed: it is written for the box's operator,
      // and a user typing into a text box can do nothing with it.
      throw new HttpError(502, "feedback_unreachable", "Could not reach the feedback endpoint.");
    }
    if (!response.ok) {
      throw new HttpError(
        502,
        "feedback_rejected",
        `The feedback endpoint refused the submission (status ${response.status}).`,
      );
    }

    // The created item's id is handed back so the report can name what was filed; a backend
    // that answers with something else is still a success, just a nameless one.
    let id: string | undefined;
    try {
      const data = (await response.json()) as { item?: { id?: unknown } };
      if (typeof data?.item?.id === "string") id = data.item.id;
    } catch {
      // A reply that is not JSON (an empty 204, a proxy's HTML) is not a failure.
    }
    const answer: FeedbackResponse = { ok: true, ...(id !== undefined ? { id } : {}) };
    return c.json(answer);
  });

  return routes;
}

/**
 * The route group's declaration. `auth: "user"` — anyone signed in may report something;
 * the audience is the operator either way, and gating it by role would only hide the
 * channel from the people who use the UI most.
 */
@Component({
  contributes: {
    "HttpModule.routes": [
      {
        id: "FeedbackModule.routes",
        prefix: "/api/feedback",
        auth: "user",
        order: 75,
      },
    ],
  },
})
export class FeedbackRoutes {
  @Use() private readonly config!: Config;
  @Use() private readonly http!: HttpFetch;
  @Bind("FeedbackModule.routes") routes!: Hono<AppEnv>;
  setup() {
    this.routes = feedbackRoutes({ config: this.config, http: this.http });
  }
}
