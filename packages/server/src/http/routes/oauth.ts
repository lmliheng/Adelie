/**
 * External auth over HTTP — the whole of it, and none of it a page.
 *
 * `/oauth/introspect` takes an app's client_id/secret (HTTP Basic or form fields) and a token,
 * and answers `{active, sub, username, name, avatar, scope, exp}` or the same shape with
 * `active:false`. `/oauth/userinfo` is the direct route when a caller already holds the token and
 * wants only a name and avatar. `/oauth/revoke` ends a token.
 *
 * The group is mounted at `/oauth`, `auth: "none"`, `order: 5` — in front of the cookie gate and
 * deliberately NOT under `/api`. Two reasons: the write guard on `/api/*` (jsonOnlyWrites) only
 * accepts JSON, while these endpoints are form-encoded per spec; and a path outside `/api` carries
 * no cookie semantics, so there is no CSRF or CORS surface to worry about. Server-to-server calls
 * send no Origin, and this answers no CORS header.
 *
 * A wrong or missing app credential is 401; everything about the TOKEN is folded into
 * `active:false`, so the endpoint cannot be used to discover which tokens exist. Refusals are
 * written to the audit, where the reason is safe to keep.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../../auth/middleware.js";
import { HttpError } from "../errors.js";
import { Bind, Component, Use } from "@adelie/core/kernel";
import type { ExternalAuth } from "../../mechanisms/oauth.js";

/** A form body as the OAuth endpoints receive it (values only; a file part is not meaningful here). */
type Form = Record<string, string>;

async function readForm(c: Context<AppEnv>): Promise<Form> {
  const body = await c.req.parseBody();
  const form: Form = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") form[key] = value;
  }
  return form;
}

/**
 * The app's credentials: HTTP Basic wins (the spec's preferred form and what `curl -u` sends),
 * otherwise the `client_id`/`client_secret` form fields. A missing one is left empty, and the
 * service refuses it — the route does not decide what "absent" means.
 */
function clientCredentials(
  c: Context<AppEnv>,
  form: Form,
): { clientId: string; clientSecret: string } {
  const header = c.req.header("authorization");
  if (header !== undefined && /^Basic\s+/i.test(header.trim())) {
    const raw = header.trim().replace(/^Basic\s+/i, "");
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep >= 0) {
      return { clientId: decoded.slice(0, sep), clientSecret: decoded.slice(sep + 1) };
    }
    return { clientId: decoded, clientSecret: "" };
  }
  return { clientId: form.client_id ?? "", clientSecret: form.client_secret ?? "" };
}

function bearerToken(header: string | undefined): string {
  if (header === undefined) return "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m === null ? "" : m[1]!.trim();
}

export function oauthRoutes(oauth: ExternalAuth): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.post("/introspect", async (c) => {
    const form = await readForm(c);
    const { clientId, clientSecret } = clientCredentials(c, form);
    return c.json(oauth.introspect({ clientId, clientSecret, token: form.token ?? "" }));
  });

  app.get("/userinfo", (c) => {
    const info = oauth.userinfo(bearerToken(c.req.header("authorization")));
    if (info === null) {
      c.header("WWW-Authenticate", 'Bearer realm="adelie"');
      return c.json({ error: "invalid_token" }, 401);
    }
    return c.json(info);
  });

  app.post("/revoke", async (c) => {
    const form = await readForm(c);
    const { clientId, clientSecret } = clientCredentials(c, form);
    oauth.revokeByToken({ clientId, clientSecret, token: form.token ?? "" });
    // Spec-shaped: an unknown app or an unknown token still succeeds, so a caller learns nothing.
    return c.json({ ok: true });
  });

  // The group owns its prefix: an unknown path here is a 404, never a gate's 401 behind it.
  app.all("/*", () => {
    throw new HttpError(404, "not_found", "Not found.");
  });

  return app;
}

@Component({
  contributes: {
    "HttpModule.routes": [{ id: "OAuthRoutes.routes", prefix: "/oauth", auth: "none", order: 5 }],
  },
})
export class OAuthRoutes {
  @Use() private readonly oauth!: ExternalAuth;
  @Bind("OAuthRoutes.routes") routes!: Hono<AppEnv>;
  setup() {
    this.routes = oauthRoutes(this.oauth);
  }
}
