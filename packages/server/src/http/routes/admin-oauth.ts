/**
 * Admin side of external auth: minting a program token for someone, and registering an external
 * app. Both are admin-only, refused in desktop mode (single-user, no external apps), and both mint
 * writes take requireHuman — the machine's local API token must not be able to hand a person a
 * credential on its own, the same rule the Agent API's keys follow.
 *
 * The person's own side (list/revoke your own tokens) lives in routes/me.ts; the app's side is
 * routes/oauth.ts. This file is only what an admin does on someone else's behalf.
 *
 * Prefixes: `/api/admin/tokens` and `/api/admin/oauth-clients`. The design sketched tokens under
 * `/api/admin/users/:userId/tokens`, but a flat collection with the user in the body/query reads
 * the same and does not nest a second gate under the user backend's group.
 */
import { Hono } from "hono";
import type {
  MintUserTokenResponse,
  OAuthClientsResponse,
  RegisterOAuthClientResponse,
  UserTokensResponse,
} from "../../api/types.js";
import { HttpError } from "../errors.js";
import { rejectInDesktopMode } from "./desktop.js";
import type { DesktopService } from "../../services/desktop-service.js";
import type { AppEnv } from "../../auth/middleware.js";
import { requireHuman } from "../../auth/middleware.js";
import { pathParam, readJson, requireString } from "../validate.js";
import { Bind, Component, Use } from "@adelie/core/kernel";
import type { Desktop } from "../../hmr/capabilities.js";
import type { ExternalAuth } from "../../mechanisms/oauth.js";
import { toUserTokenSummary } from "../../services/oauth-service.js";

export interface AdminOAuthRouteDeps {
  oauth: ExternalAuth;
  desktop: DesktopService | null;
}

/** Admin-only + desktop-refused + a person's own sign-in for the writes. */
function adminGate(app: Hono<AppEnv>, deps: AdminOAuthRouteDeps): void {
  app.use("*", rejectInDesktopMode(deps));
  app.use("*", async (c, next) => {
    if (!c.var.user.isAdmin) {
      throw new HttpError(403, "admin_required", "Only an admin can perform this operation.");
    }
    await next();
  });
}

export function adminTokenRoutes(deps: AdminOAuthRouteDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  adminGate(app, deps);

  app.get("/", (c) => {
    const userId = c.req.query("userId");
    if (userId === undefined || userId === "") {
      throw new HttpError(400, "invalid_request", "userId is required.");
    }
    return c.json({ tokens: deps.oauth.listForUser(userId) } satisfies UserTokensResponse);
  });

  app.post("/", async (c) => {
    requireHuman(c);
    const body = await readJson(c);
    const userId = requireString(body, "userId", { label: "userId" });
    const name = requireString(body, "name", { label: "name" });
    const scope = typeof body.scope === "string" ? body.scope : undefined;
    const ttlDays = typeof body.ttlDays === "number" ? body.ttlDays : undefined;
    const { token, row } = deps.oauth.mint({
      userId,
      name,
      createdBy: c.var.user.userId,
      ...(scope === undefined ? {} : { scope }),
      ...(ttlDays === undefined ? {} : { ttlDays }),
    });
    return c.json({ token, entry: toUserTokenSummary(row) } satisfies MintUserTokenResponse, 201);
  });

  app.delete("/:tokenId", (c) => {
    requireHuman(c);
    // An admin may revoke anyone's token, so no ownerUserId scope.
    const done = deps.oauth.revoke(pathParam(c, "tokenId"), { actor: c.var.user.userId });
    if (!done) throw new HttpError(404, "not_found", "No such token.");
    return c.body(null, 204);
  });

  return app;
}

export function adminOAuthClientRoutes(deps: AdminOAuthRouteDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  adminGate(app, deps);

  app.get("/", (c) => {
    return c.json({ clients: deps.oauth.listClients() } satisfies OAuthClientsResponse);
  });

  app.post("/", async (c) => {
    requireHuman(c);
    const body = await readJson(c);
    const clientName = requireString(body, "clientName", { label: "clientName" });
    const scopes = typeof body.scopes === "string" ? body.scopes : undefined;
    const { clientId, clientSecret, row } = deps.oauth.registerClient({
      clientName,
      createdBy: c.var.user.userId,
      ...(scopes === undefined ? {} : { scopes }),
    });
    return c.json(
      {
        clientId,
        clientSecret,
        entry: {
          clientId: row.clientId,
          clientName: row.clientName,
          secretPrefix: row.secretPrefix,
          scopes: row.scopes,
          disabled: row.disabled,
          createdAt: row.createdAt,
          lastUsedAt: row.lastUsedAt,
        },
      } satisfies RegisterOAuthClientResponse,
      201,
    );
  });

  app.post("/:clientId/disable", (c) => {
    requireHuman(c);
    const done = deps.oauth.disableClient(pathParam(c, "clientId"), c.var.user.userId);
    if (!done) throw new HttpError(404, "not_found", "No such client.");
    return c.body(null, 204);
  });

  return app;
}

@Component({
  contributes: {
    "HttpModule.routes": [
      { id: "admin-api.tokens", prefix: "/api/admin/tokens", auth: "user", order: 35 },
      {
        id: "admin-api.oauth-clients",
        prefix: "/api/admin/oauth-clients",
        auth: "user",
        order: 36,
      },
    ],
  },
})
export class AdminOAuthRoutes {
  @Use() private readonly oauth!: ExternalAuth;
  @Use() private readonly desktop!: Desktop;
  @Bind("admin-api.tokens") tokenRoutes!: Hono<AppEnv>;
  @Bind("admin-api.oauth-clients") clientRoutes!: Hono<AppEnv>;
  setup() {
    const deps: AdminOAuthRouteDeps = {
      oauth: this.oauth,
      desktop: this.desktop.current() as DesktopService | null,
    };
    this.tokenRoutes = adminTokenRoutes(deps);
    this.clientRoutes = adminOAuthClientRoutes(deps);
  }
}
