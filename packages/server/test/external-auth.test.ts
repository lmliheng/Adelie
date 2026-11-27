/**
 * External auth: program tokens (a person's credential for an outside server-side app) and
 * introspection (an app turning that token into an identity).
 *
 * What this suite pins: an admin mints a token and a straight `curl`-shaped introspection reads
 * it back as `{active:true, sub}`; every way a token can be dead folds into the SAME
 * `{active:false}` (so the endpoint cannot be used to discover which tokens exist); a wrong or
 * missing client credential is 401; the person's own list/revoke works and cannot reach another
 * account's token; a password change does NOT clear program tokens (the reason they are their own
 * table); introspection is rate-limited per client; every attempt, refusals included, is audited.
 */
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Hono } from "hono";
import type {
  MintUserTokenResponse,
  OAuthClientSummary,
  RegisterOAuthClientResponse,
  UserTokensResponse,
} from "../src/api/types.js";
import { apiClient, createTestApp, loginAdmin, provisionUser, tokenClient } from "./helpers.js";
import type { TestApp } from "./helpers.js";
import type { AppEnv } from "../src/auth/middleware.js";
import type { ExternalAuth } from "../src/mechanisms/oauth.js";
import { LATEST_VERSION, schemaVersion } from "../src/db/migrations.js";
import { mintUserToken } from "../src/auth/user-token.js";
import { UserTokensRepo } from "../src/db/repos/user-tokens.js";
import { UsersRepo } from "../src/db/repos/users.js";
import { openDatabase } from "../src/db/database.js";
import { wire } from "@adelie/core/kernel";

function basic(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

/** `curl -u id:secret -d token=… /oauth/introspect`: a form body, the app's credentials in Basic. */
function introspect(
  app: Hono<AppEnv>,
  cred: string,
  token: string,
  form: Record<string, string> = {},
): Promise<Response> {
  const body = new URLSearchParams({ token, ...form }).toString();
  return Promise.resolve(
    app.request("/oauth/introspect", {
      method: "POST",
      headers: {
        ...(cred === "" ? {} : { authorization: cred }),
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    }),
  );
}

describe("external auth: program tokens and introspection", () => {
  let t: TestApp;
  let admin: ReturnType<typeof apiClient>;
  let oauth: ExternalAuth;

  beforeEach(async () => {
    t = await createTestApp();
    admin = apiClient(t.app, (await loginAdmin(t.app)).cookie);
    oauth = t.deps.tree.api<ExternalAuth>("IdentityModule", "ExternalAuth");
  });
  afterEach(async () => {
    await t.cleanup();
  });

  const mint = async (
    userId: string,
    name = "requirements box",
    extra: Record<string, unknown> = {},
  ): Promise<MintUserTokenResponse> => {
    const res = await admin.post("/api/admin/tokens", { userId, name, ...extra });
    expect(res.status, await res.clone().text()).toBe(201);
    return (await res.json()) as MintUserTokenResponse;
  };

  const registerClient = async (
    clientName = "requirements box",
  ): Promise<RegisterOAuthClientResponse> => {
    const res = await admin.post("/api/admin/oauth-clients", { clientName });
    expect(res.status, await res.clone().text()).toBe(201);
    return (await res.json()) as RegisterOAuthClientResponse;
  };

  it("the migration lands the three tables and the version stamp", () => {
    expect(LATEST_VERSION).toBe(18);
    expect(schemaVersion(t.deps.db)).toBe(LATEST_VERSION);
    const names = (
      t.deps.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    expect(names).toContain("user_tokens");
    expect(names).toContain("oauth_clients");
    expect(names).toContain("oauth_audit");
  });

  it("mint → introspect reads the token back as an identity", async () => {
    const client = await registerClient();
    const { token, entry } = await mint("admin");
    expect(token.startsWith("adelie_pat_")).toBe(true);
    expect(entry.scope).toBe("openid profile");
    expect(entry.prefix).toBe(token.slice(0, 16));

    const res = await introspect(t.app, basic(client.clientId, client.clientSecret), token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      active: true,
      sub: "admin",
      username: "admin",
      name: "admin",
      scope: "openid profile",
      client_id: client.clientId,
    });
    // The token's last use is stamped, and the app's too.
    const again = await introspect(t.app, basic(client.clientId, client.clientSecret), token);
    expect(((await again.json()) as { active: boolean }).active).toBe(true);
    expect(oauth.listClients()[0]!.lastUsedAt).toBeTruthy();
  });

  it("a missing or wrong client credential is 401, and the refusal is audited", async () => {
    const client = await registerClient();
    const { token } = await mint("admin");
    expect((await introspect(t.app, "", token)).status).toBe(401);
    expect((await introspect(t.app, basic(client.clientId, "nope"), token)).status).toBe(401);
    expect((await introspect(t.app, basic("adelie_app_unknown", "whatever"), token)).status).toBe(
      401,
    );
    const actions = (
      t.deps.db.prepare("SELECT action, detail FROM oauth_audit").all() as {
        action: string;
        detail: string | null;
      }[]
    ).filter((r) => r.action === "introspect_denied");
    expect(actions.map((r) => r.detail).sort()).toEqual([
      "bad_secret",
      "unknown_client",
      "unknown_client",
    ]);
  });

  it("unknown / revoked / expired tokens all read active:false", async () => {
    const client = await registerClient();
    const cred = basic(client.clientId, client.clientSecret);

    expect(
      ((await (await introspect(t.app, cred, "adelie_pat_nothing")).json()) as { active: boolean })
        .active,
    ).toBe(false);

    const revoked = await mint("admin", "revoked one");
    await admin.delete(`/api/admin/tokens/${revoked.entry.tokenId}`);
    expect(
      ((await (await introspect(t.app, cred, revoked.token)).json()) as { active: boolean }).active,
    ).toBe(false);

    // An already-expired token: minted with a lifetime, then backdated through the repo.
    const expired = await mint("admin", "expired one", { ttlDays: 1 });
    t.deps.db
      .prepare("UPDATE user_tokens SET expires_at = ? WHERE token_id = ?")
      .run("2000-01-01T00:00:00.000Z", expired.entry.tokenId);
    const denied = (await (await introspect(t.app, cred, expired.token)).json()) as {
      active: boolean;
    };
    expect(denied.active).toBe(false);
    // The refusal still learned nothing out loud: no reason in the body.
    expect(JSON.stringify(denied)).toBe('{"active":false}');
  });

  it("a token outside the app's registered scopes is inactive", async () => {
    // A client registered for identity only, and a token carrying identity only: the default
    // scope set is exactly that, so prove the guard by narrowing the CLIENT to one scope.
    const client = await registerClient();
    t.deps.db
      .prepare("UPDATE oauth_clients SET scopes = 'openid' WHERE client_id = ?")
      .run(client.clientId);
    const { token } = await mint("admin");
    const res = await introspect(t.app, basic(client.clientId, client.clientSecret), token);
    expect(((await res.json()) as { active: boolean }).active).toBe(false);
  });

  it("a password change leaves program tokens alone", async () => {
    const client = await registerClient();
    const kate = await provisionUser(t.app, "kate");
    const me = apiClient(t.app, kate.cookie);
    const { token } = await mint("kate");
    expect(
      (
        await me.put("/api/me/password", {
          oldPassword: "password-123",
          newPassword: "password-456",
        })
      ).status,
    ).toBe(204);
    // The program token still introspects after the password changed: it is NOT the browser
    // session's row, and a reset that clears sessions must not reach it.
    const res = await introspect(t.app, basic(client.clientId, client.clientSecret), token);
    expect(((await res.json()) as { active: boolean }).active).toBe(true);
  });

  it("the person's own list and revoke; another account's id is a 404", async () => {
    const kate = await provisionUser(t.app, "kate");
    const bob = await provisionUser(t.app, "bob");
    const kateApi = apiClient(t.app, kate.cookie);
    const bobApi = apiClient(t.app, bob.cookie);

    const mine = await mint("kate", "kate's own");
    await mint("kate", "second");
    const listed = (await (await kateApi.get("/api/me/tokens")).json()) as UserTokensResponse;
    // The list is oldest first — but two mints that land inside the SAME millisecond tie on
    // `created_at`, and the list's total order breaks that tie by token id, which is random. So
    // the names are compared as a set and only the stamps are compared as a sequence: macOS
    // mints both inside one millisecond (that is where CI went red), and an "insertion order"
    // assertion there is a coin flip (the repo's 12-pair check saw 6 reversed).
    expect(listed.tokens.map((x) => x.name).sort()).toEqual(["kate's own", "second"].sort());
    const stamps = listed.tokens.map((x) => x.createdAt);
    expect(stamps).toEqual([...stamps].sort());
    // The raw token is never in a list.
    expect(JSON.stringify(listed)).not.toContain(mine.token);

    expect((await bobApi.delete(`/api/me/tokens/${mine.entry.tokenId}`)).status).toBe(404);
    expect((await kateApi.delete(`/api/me/tokens/${mine.entry.tokenId}`)).status).toBe(204);
    const after = (await (await kateApi.get("/api/me/tokens")).json()) as UserTokensResponse;
    expect(after.tokens.find((x) => x.tokenId === mine.entry.tokenId)!.revokedAt).toBeTruthy();
  });

  it("the admin surface: non-admin 403, the machine's own token 403 human_required", async () => {
    const norm = await provisionUser(t.app, "norm");
    const normApi = apiClient(t.app, norm.cookie);
    expect((await normApi.get("/api/admin/tokens?userId=admin")).status).toBe(403);
    expect((await normApi.post("/api/admin/tokens", { userId: "admin", name: "x" })).status).toBe(
      403,
    );
    expect((await normApi.post("/api/admin/oauth-clients", { clientName: "x" })).status).toBe(403);

    const machine = tokenClient(t.app, t.deps.authService.localApiToken()!);
    expect((await machine.post("/api/admin/tokens", { userId: "admin", name: "x" })).status).toBe(
      403,
    );
    expect((await machine.post("/api/admin/oauth-clients", { clientName: "x" })).status).toBe(403);
  });

  it("introspection is rate-limited per client", async () => {
    const client = await registerClient();
    const { token } = await mint("admin");
    const cred = basic(client.clientId, client.clientSecret);
    for (let i = 0; i < 60; i += 1) {
      expect((await introspect(t.app, cred, token)).status, `call ${i + 1}`).toBe(200);
    }
    expect((await introspect(t.app, cred, token)).status).toBe(429);
  });

  it("userinfo answers the token holder, and stops once the token is revoked", async () => {
    const { token, entry } = await mint("admin");
    const res = await t.app.request("/oauth/userinfo", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sub: "admin", username: "admin" });

    await admin.delete(`/api/admin/tokens/${entry.tokenId}`);
    const gone = await t.app.request("/oauth/userinfo", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(gone.status).toBe(401);
    expect((await t.app.request("/oauth/userinfo")).status).toBe(401);
  });

  it("the mint validates its inputs", async () => {
    expect((await admin.post("/api/admin/tokens", { userId: "ghost", name: "x" })).status).toBe(
      404,
    );
    expect((await admin.post("/api/admin/tokens", { userId: "admin", name: "" })).status).toBe(400);
    expect(
      (await admin.post("/api/admin/tokens", { userId: "admin", name: "x", scope: "openid,email" }))
        .status,
    ).toBe(400);
    expect(
      (await admin.post("/api/admin/tokens", { userId: "admin", name: "x", ttlDays: -1 })).status,
    ).toBe(400);
    // ttlDays 0 is the explicit "no expiry", and the row records it as null.
    const forever = await mint("admin", "forever", { ttlDays: 0 });
    expect(forever.entry.expiresAt).toBeNull();
  });

  it("an admin token list for one account shows lifecycle, never the raw token", async () => {
    const { token } = await mint("admin", "listed");
    const res = await admin.get("/api/admin/tokens?userId=admin");
    expect(res.status).toBe(200);
    const body = (await res.json()) as UserTokensResponse;
    expect(body.tokens.map((x: { name: string }) => x.name)).toEqual(["listed"]);
    expect(JSON.stringify(body)).not.toContain(token);
    expect((await admin.get("/api/admin/tokens")).status).toBe(400);
  });

  it("the offline CLI mint writes a usable row, and says so when there is no server", async () => {
    // A root with no web.db: nothing to mint into.
    expect(mintUserToken(t.root, { userId: "admin", name: "x" })).toEqual({ outcome: "no_server" });

    // A real file database, the way the CLI opens one: an account, a mint, then introspection.
    const root = `${t.root}-cli`;
    const db = openDatabase(path.join(root, "web.db"));
    try {
      wire(UsersRepo, { db }).insert({
        userId: "cli_user",
        passwordHash: "scrypt$1$1$1$x$y",
        isAdmin: false,
        passwordIsInitial: true,
        displayName: null,
        avatar: null,
        lastLoginAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      const minted = mintUserToken(root, { userId: "cli_user", name: "from cli", ttlDays: 30 });
      expect(minted.outcome).toBe("minted");
      if (minted.outcome !== "minted") return;
      const row = wire(UserTokensRepo, { db }).findById(minted.tokenId);
      expect(row?.name).toBe("from cli");
      expect(row?.expiresAt).toBeTruthy();
      expect(mintUserToken(root, { userId: "ghost", name: "x" })).toEqual({
        outcome: "failed",
        detail: "no such account: ghost",
      });
    } finally {
      db.close();
    }
  });

  it("the audit trail records a client registration and a token mint", async () => {
    await registerClient("audited app");
    await mint("admin", "audited token");
    const rows = t.deps.db
      .prepare("SELECT action, client_id, subject, detail FROM oauth_audit ORDER BY rowid")
      .all() as {
      action: string;
      client_id: string | null;
      subject: string | null;
      detail: string;
    }[];
    expect(rows.map((r) => r.action)).toEqual(["client_registered", "token_mint"]);
    expect(rows[0]!.client_id).toMatch(/^adelie_app_/);
    expect(rows[1]!.subject).toBe("admin");
  });

  it("a registered app can be disabled, and then introspection refuses it", async () => {
    const client = await registerClient();
    const { token } = await mint("admin");
    const before = (await (
      await introspect(t.app, basic(client.clientId, client.clientSecret), token)
    ).json()) as {
      active: boolean;
    };
    expect(before.active).toBe(true);
    expect((await admin.post(`/api/admin/oauth-clients/${client.clientId}/disable`)).status).toBe(
      204,
    );
    const listed = (await (await admin.get("/api/admin/oauth-clients")).json()) as {
      clients: OAuthClientSummary[];
    };
    expect(listed.clients[0]!.disabled).toBe(true);
    expect(
      (await introspect(t.app, basic(client.clientId, client.clientSecret), token)).status,
    ).toBe(401);
  });
});
