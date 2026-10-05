/**
 * User-level vault routes: GET|PUT /api/me/vault, POST /api/me/vault/import.
 *
 * The caller's OWN secrets, one scope above the Agent vault
 * (`/api/projects/:p/agents/:a/vault`): there is no Project in the path and no membership to
 * check, because the file belongs to the account — reading and writing are both the signed-in
 * user, and one account can never see another's. The routes therefore sit under /api/me, beside
 * the other per-account resources (prefs, profile).
 *
 * Values are masked on the way out exactly like the Agent vault's, so plaintext never reaches
 * the browser. PUT carries whole-table replace semantics (the same body as the Agent vault's —
 * its parser is shared); the import endpoint takes a whole JSON object and MERGES it, because
 * the paste flow is additive by nature.
 *
 * Same `auth: "user"` group as every other route; the Hono app is bound by its own component,
 * so this file owns everything the endpoints need.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../auth/middleware.js";
import { parseVaultUpdate } from "./vault.js";
import { badRequest, readJson } from "../validate.js";
import { Bind, Component, Use } from "@lmliheng/penguin-core/kernel";
import type { UserVault } from "../../mechanisms/vault.js";

/** What this route group reaches — bound by its module (src/modules). */
export interface UserVaultRouteDeps {
  userVault: UserVault;
}

/** Whether a parsed JSON value is a plain object (what an import has to be). */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Turns the import body into the not-yet-checked table the service validates, in either shape:
 * `{ json: "<text>" }` — what the paste box sends, parsed here so a syntax error is a 400 with
 * the parser's own message rather than a silent no-op — or the `{"KEY": "value"}` object itself.
 * The wrapper wins, so a vault key literally named `json` is imported through the text form.
 */
export function parseVaultImport(body: Record<string, unknown>): Record<string, unknown> {
  if (body.json !== undefined) {
    if (typeof body.json !== "string") throw badRequest("json must be the pasted JSON text.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.json);
    } catch (err) {
      throw badRequest(
        `json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!isPlainObject(parsed)) {
      throw badRequest('json must be an object of "KEY": "value" pairs.');
    }
    return parsed;
  }
  // No `json` field: the body IS the table. It is always an object by the time it gets here
  // (readJson rejects anything else), so this is the one-key-at-a-time shape.
  return body;
}

export function userVaultRoutes(deps: UserVaultRouteDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // The caller's own vault; there is nothing to authorize beyond being signed in.
  app.get("/", async (c) => {
    return c.json(await deps.userVault.getVault(c.var.user.userId));
  });

  app.put("/", async (c) => {
    const req = parseVaultUpdate(await readJson(c));
    return c.json(await deps.userVault.updateVault(c.var.user.userId, req));
  });

  // Whole-object import (a pasted JSON key-value table), merged into the stored one.
  app.post("/import", async (c) => {
    const table = parseVaultImport(await readJson(c));
    return c.json(await deps.userVault.importVault(c.var.user.userId, table));
  });
  return app;
}

/**
 * The per-account vault, mounted beside /api/me (MeRoutes): its own group because the path is
 * `/api/me/vault` and a group owns one prefix. Order 12 puts it right after the me group's 10,
 * which is only a mount position — each prefix matches its own routes.
 */
@Component({
  contributes: {
    "HttpModule.routes": [
      {
        id: "UserVaultRoutes.routes",
        prefix: "/api/me/vault",
        auth: "user",
        order: 12,
      },
    ],
  },
})
export class UserVaultRoutes {
  @Use() private readonly userVault!: UserVault;
  @Bind("UserVaultRoutes.routes") routes!: Hono<AppEnv>;
  setup() {
    this.routes = userVaultRoutes({ userVault: this.userVault });
  }
}
