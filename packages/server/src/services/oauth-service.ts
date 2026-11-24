/**
 * External auth: the two credentials an outside program deals in, and the one question it asks.
 *
 * A person mints a PROGRAM TOKEN (`user_tokens`) and hands it to a server-side app; the app
 * stores it as a secret and represents that person. A registered APP (`oauth_clients`) holds its
 * own client_id/secret and calls `POST /oauth/introspect` to turn a token into an identity —
 * `{active, sub, username, name, avatar, scope, exp}`. The app credential is what keeps the
 * endpoint from being a bare token-prober, lets one app be cut off on its own, and puts a name in
 * the audit.
 *
 * Only identity is on offer (`openid` + `profile`). Reading Sessions or running an Agent is the
 * Agent API's (AMSP) business; a program token is refused at every `/api/*` route by construction
 * (authMiddleware only knows the cookie and the machine's own local token), so this surface cannot
 * be turned into one.
 *
 * Nothing here is a page: a token is minted by the CLI or the admin/mine routes, an app is
 * registered by an admin, and the only other side is HTTP.
 */
import { randomBytes } from "node:crypto";
import { Component, Use } from "@adelie/core/kernel";
import type { Clock } from "../hmr/capabilities.js";
import { HttpError } from "../http/errors.js";
import { tokensEqual } from "../auth/api-token.js";
import {
  newUserToken,
  userTokenExpiry,
  userTokenHash,
  USER_TOKEN_DEFAULT_TTL_DAYS,
  USER_TOKEN_MAX_TTL_DAYS,
  parseUserTokenScope,
} from "../auth/user-token.js";
import type { UserTokenRow } from "../db/repos/user-tokens.js";
import type { OAuthClientRow } from "../db/repos/oauth-clients.js";
import type {
  ExternalAuth,
  MintedUserToken,
  OAuthAudit,
  OAuthClients,
  OAuthIntrospection,
  OAuthUserInfo,
  RegisteredOAuthClient,
  UserTokens,
} from "../mechanisms/oauth.js";
import type { Users } from "../mechanisms/identity.js";
import type { OAuthClientSummary, UserTokenSummary } from "../api/types.js";

/** Identifiable client_id prefix, so a leaked one is recognisable. */
export const OAUTH_CLIENT_PREFIX = "adelie_app_";

/**
 * Introspection rate limit, per client. Generous for a server that caches its results for 60
 * seconds (this codebase's own advice to callers), tight enough that a stolen client credential
 * cannot sweep the token space.
 */
const INTROSPECT_FREE_ATTEMPTS = 60;
const INTROSPECT_WINDOW_MS = 60_000;
/** Consecutive client-auth failures before a delay is imposed (mirrors the login throttle). */
const CLIENT_AUTH_FREE_FAILURES = 5;
const CLIENT_AUTH_BACKOFF_START_MS = 1000;
const CLIENT_AUTH_BACKOFF_CAP_MS = 60_000;
const CLIENT_AUTH_IDLE_MS = 15 * 60_000;

/** A program token as its own list shows it — never the hash and never the raw value. */
export function toUserTokenSummary(row: UserTokenRow): UserTokenSummary {
  return {
    tokenId: row.tokenId,
    name: row.name,
    prefix: row.prefix,
    scope: row.scope,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
  };
}

/** A registered app as the admin list shows it — never the secret hash, never the raw secret. */
export function toOAuthClientSummary(row: OAuthClientRow): OAuthClientSummary {
  return {
    clientId: row.clientId,
    clientName: row.clientName,
    secretPrefix: row.secretPrefix,
    scopes: row.scopes,
    disabled: row.disabled,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

/** Whether every scope in `requested` (space-separated) appears in `allowed`. */
export function scopeWithin(requested: string, allowed: string): boolean {
  const have = new Set(allowed.split(/\s+/).filter((s) => s !== ""));
  return requested
    .split(/\s+/)
    .filter((s) => s !== "")
    .every((s) => have.has(s));
}

@Component()
export class OAuthService implements ExternalAuth {
  @Use() private readonly userTokens!: UserTokens;
  @Use() private readonly clients!: OAuthClients;
  @Use() private readonly audit!: OAuthAudit;
  @Use() private readonly users!: Users;
  @Use() private readonly clock!: Clock;

  /** Introspection attempts per client within the current window (see INTROSPECT_WINDOW_MS). */
  private readonly windows = new Map<string, { startAt: number; count: number }>();
  /** Consecutive client-auth failures per client_id (see CLIENT_AUTH_* above). */
  private readonly authFailures = new Map<string, { failures: number; lastAt: number }>();

  // ---- minting and listing ----------------------------------------------------------------

  /**
   * Mints a program token for `userId` and returns the raw value ONCE. `name` is what the person
   * will recognise in a list; `ttlDays` 0 means no expiry (the only way past the 1-year cap).
   */
  mint(opts: {
    userId: string;
    name: string;
    scope?: string;
    ttlDays?: number;
    createdBy: string;
  }): MintedUserToken {
    if (this.users.findById(opts.userId) === null) {
      throw new HttpError(404, "user_not_found", `No such account: ${opts.userId}`);
    }
    const name = opts.name.trim();
    if (name.length === 0 || name.length > 64) {
      throw new HttpError(400, "invalid_name", "Token name must be 1-64 characters.");
    }
    if (opts.ttlDays !== undefined && (!Number.isSafeInteger(opts.ttlDays) || opts.ttlDays < 0)) {
      throw new HttpError(
        400,
        "invalid_ttl",
        "ttlDays must be 0 (no expiry) or a positive integer.",
      );
    }
    let scope: string;
    try {
      scope = parseUserTokenScope(opts.scope);
    } catch (err) {
      throw new HttpError(400, "invalid_scope", err instanceof Error ? err.message : String(err));
    }
    const now = this.clock.now();
    const { token, tokenId, prefix, tokenHash } = newUserToken();
    const expiresAt = userTokenExpiry(now, opts.ttlDays);
    const row: UserTokenRow = {
      tokenId,
      userId: opts.userId,
      name,
      tokenHash,
      prefix,
      scope,
      createdBy: opts.createdBy,
      createdAt: now.toISOString(),
      expiresAt,
      lastUsedAt: null,
      revokedAt: null,
    };
    this.userTokens.insert({
      tokenId,
      userId: row.userId,
      name: row.name,
      tokenHash,
      prefix,
      scope,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      expiresAt,
    });
    this.audit.record({
      at: row.createdAt,
      actor: opts.createdBy,
      clientId: null,
      action: "token_mint",
      subject: opts.userId,
      detail: `name=${name} scope=${scope} ttlDays=${opts.ttlDays ?? USER_TOKEN_DEFAULT_TTL_DAYS}`,
    });
    return { token, row };
  }

  listForUser(userId: string): UserTokenSummary[] {
    return this.userTokens.listByUser(userId).map(toUserTokenSummary);
  }

  /**
   * Revokes a token on behalf of a person. `actor` names who did it in the audit. Scoped to
   * `ownerUserId` unless the caller is an admin, so one person cannot revoke another's token by id.
   */
  revoke(tokenId: string, opts: { actor: string; ownerUserId?: string }): boolean {
    const row = this.userTokens.findById(tokenId);
    if (row === null || (opts.ownerUserId !== undefined && row.userId !== opts.ownerUserId)) {
      return false;
    }
    const at = this.clock.now().toISOString();
    const done = this.userTokens.revoke(tokenId, at);
    if (done) {
      this.audit.record({
        at,
        actor: opts.actor,
        clientId: null,
        action: "token_revoked",
        subject: row.userId,
        detail: `tokenId=${tokenId}`,
      });
    }
    return done;
  }

  // ---- app registration --------------------------------------------------------------------

  /** Registers an app and returns its raw secret ONCE. Admin-only; the route enforces that. */
  registerClient(opts: {
    clientName: string;
    scopes?: string;
    createdBy: string;
  }): RegisteredOAuthClient {
    const clientName = opts.clientName.trim();
    if (clientName.length === 0 || clientName.length > 64) {
      throw new HttpError(400, "invalid_name", "Client name must be 1-64 characters.");
    }
    let scopes: string;
    try {
      scopes = parseUserTokenScope(opts.scopes);
    } catch (err) {
      throw new HttpError(400, "invalid_scope", err instanceof Error ? err.message : String(err));
    }
    const clientId = `${OAUTH_CLIENT_PREFIX}${randomBytes(12).toString("base64url")}`;
    const clientSecret = randomBytes(32).toString("base64url");
    const now = this.clock.now().toISOString();
    const row: OAuthClientRow = {
      clientId,
      clientName,
      secretHash: userTokenHash(clientSecret),
      secretPrefix: clientSecret.slice(0, 16),
      scopes,
      disabled: false,
      createdBy: opts.createdBy,
      createdAt: now,
      lastUsedAt: null,
    };
    this.clients.insert({
      clientId: row.clientId,
      clientName: row.clientName,
      secretHash: row.secretHash,
      secretPrefix: row.secretPrefix,
      scopes: row.scopes,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    });
    this.audit.record({
      at: now,
      actor: opts.createdBy,
      clientId,
      action: "client_registered",
      subject: null,
      detail: `name=${clientName} scopes=${scopes}`,
    });
    return { clientId, clientSecret, row };
  }

  listClients(): OAuthClientSummary[] {
    return this.clients.list().map(toOAuthClientSummary);
  }

  disableClient(clientId: string, actor: string): boolean {
    const done = this.clients.setDisabled(clientId, true);
    if (done) {
      this.audit.record({
        at: this.clock.now().toISOString(),
        actor,
        clientId,
        action: "client_disabled",
        subject: null,
        detail: null,
      });
    }
    return done;
  }

  // ---- the one question --------------------------------------------------------------------

  /**
   * Verifies a client credential, then answers whether a token is live and who it belongs to.
   *
   * A wrong client credential is a 401 — the endpoint must not answer anyone. Everything about
   * the TOKEN (unknown, expired, revoked, account gone, scope outside the client's) is the same
   * `{active:false}`, so the endpoint cannot be used to probe which tokens exist. Failures are
   * still written to the audit, where the reason is safe to record.
   */
  introspect(opts: { clientId: string; clientSecret: string; token: string }): OAuthIntrospection {
    const nowMs = this.clock.now().getTime();
    const at = new Date(nowMs).toISOString();
    const client = this.verifyClient(opts.clientId, opts.clientSecret, at, nowMs);
    if (!this.withinWindow(client.clientId, nowMs)) {
      this.audit.record({
        at,
        actor: null,
        clientId: client.clientId,
        action: "introspect_denied",
        subject: null,
        detail: "rate_limited",
      });
      throw new HttpError(429, "too_many_attempts", "Too many introspection requests. Slow down.");
    }
    this.clients.touch(client.clientId, at);

    const denied = (detail: string, subject: string | null): OAuthIntrospection => {
      this.audit.record({
        at,
        actor: null,
        clientId: client.clientId,
        action: "introspect_denied",
        subject,
        detail,
      });
      return { active: false };
    };

    const row = opts.token === "" ? null : this.userTokens.findByHash(userTokenHash(opts.token));
    if (row === null) return denied("unknown_token", null);
    if (row.revokedAt !== null) return denied("revoked", row.userId);
    if (row.expiresAt !== null && Date.parse(row.expiresAt) <= nowMs) {
      return denied("expired", row.userId);
    }
    // The token's scopes must be within what THIS app registered for; otherwise the app would be
    // reading an identity it was never approved for.
    if (!scopeWithin(row.scope, client.scopes)) return denied("scope_not_allowed", row.userId);
    const user = this.users.findById(row.userId);
    if (user === null) return denied("account_gone", row.userId);

    this.userTokens.touch(row.tokenId, at);
    this.audit.record({
      at,
      actor: null,
      clientId: client.clientId,
      action: "introspect",
      subject: row.userId,
      detail: null,
    });
    return {
      active: true,
      sub: user.userId,
      username: user.userId,
      name: user.displayName ?? user.userId,
      avatar: user.avatar,
      scope: row.scope,
      client_id: client.clientId,
      exp: row.expiresAt,
    };
  }

  /**
   * `GET /oauth/userinfo`: the direct route when a caller already holds the token and only wants
   * a name and avatar. No client credential — the token IS the credential here.
   */
  userinfo(token: string): OAuthUserInfo | null {
    const nowMs = this.clock.now().getTime();
    const at = new Date(nowMs).toISOString();
    const row = token === "" ? null : this.userTokens.findByHash(userTokenHash(token));
    const live =
      row !== null &&
      row.revokedAt === null &&
      (row.expiresAt === null || Date.parse(row.expiresAt) > nowMs);
    const user = live && row !== null ? this.users.findById(row.userId) : null;
    if (!live || row === null || user === null) {
      this.audit.record({
        at,
        actor: null,
        clientId: null,
        action: "userinfo_denied",
        subject: row?.userId ?? null,
        detail: "not_active",
      });
      return null;
    }
    this.userTokens.touch(row.tokenId, at);
    this.audit.record({
      at,
      actor: null,
      clientId: null,
      action: "userinfo",
      subject: row.userId,
      detail: null,
    });
    return {
      sub: user.userId,
      username: user.userId,
      name: user.displayName ?? user.userId,
      avatar: user.avatar ?? null,
    };
  }

  /**
   * An app ending the token it was handed. Requires the app's own credentials — a naked revoke
   * would let anyone who saw a token value cancel it. Spec-shaped: an unknown app or an unknown
   * token still succeeds, so a caller learns nothing from the answer. Only a real refusal (the app
   * credential is wrong) is 401.
   */
  revokeByToken(opts: { clientId: string; clientSecret: string; token: string }): void {
    const nowMs = this.clock.now().getTime();
    const at = new Date(nowMs).toISOString();
    const client = this.verifyClient(opts.clientId, opts.clientSecret, at, nowMs);
    const row = opts.token === "" ? null : this.userTokens.findByHash(userTokenHash(opts.token));
    if (row === null) return;
    if (row.revokedAt === null) {
      this.userTokens.revoke(row.tokenId, at);
    }
    this.audit.record({
      at,
      actor: null,
      clientId: client.clientId,
      action: "token_revoked",
      subject: row.userId,
      detail: `tokenId=${row.tokenId} by=client`,
    });
  }

  // ---- helpers -----------------------------------------------------------------------------

  /**
   * Checks an app's credentials and the wait after repeated failures. Throws 401 for a wrong or
   * missing credential (recording the failure) and 429 while a failure delay is in force.
   */
  private verifyClient(
    clientId: string,
    clientSecret: string,
    at: string,
    nowMs: number,
  ): OAuthClientRow {
    const wait = this.authBackoffRemainingMs(clientId, nowMs);
    if (wait > 0) {
      this.audit.record({
        at,
        actor: null,
        clientId: clientId === "" ? null : clientId,
        action: "introspect_denied",
        subject: null,
        detail: "client_backoff",
      });
      throw new HttpError(
        429,
        "too_many_attempts",
        `Too many failed client authentications. Try again in ${Math.ceil(wait / 1000)}s.`,
      );
    }
    const client = this.clients.findById(clientId);
    const ok =
      client !== null &&
      !client.disabled &&
      clientSecret.length > 0 &&
      tokensEqual(userTokenHash(clientSecret), client.secretHash);
    if (!ok) {
      const key = clientId === "" ? "(none)" : clientId;
      this.recordAuthFailure(key, nowMs);
      this.audit.record({
        at,
        actor: null,
        clientId: clientId === "" ? null : clientId,
        action: "introspect_denied",
        subject: null,
        detail:
          client === null ? "unknown_client" : client.disabled ? "client_disabled" : "bad_secret",
      });
      throw new HttpError(401, "invalid_client", "Invalid client credentials.");
    }
    return client;
  }

  /** Bumps this client's count in the current minute window; false once past the free attempts. */
  private withinWindow(clientId: string, nowMs: number): boolean {
    const w = this.windows.get(clientId);
    if (w === undefined || nowMs - w.startAt >= INTROSPECT_WINDOW_MS) {
      this.windows.set(clientId, { startAt: nowMs, count: 1 });
      return true;
    }
    w.count += 1;
    return w.count <= INTROSPECT_FREE_ATTEMPTS;
  }

  /** How much longer a client must wait after consecutive auth failures; 0 while within the free count. */
  private authBackoffRemainingMs(clientId: string, nowMs: number): number {
    const entry = this.authFailures.get(clientId);
    if (entry === undefined) return 0;
    return Math.max(0, entry.lastAt - nowMs);
  }

  /** Records a failed client auth and stamps the wait that the NEXT attempt must observe. */
  private recordAuthFailure(clientId: string, nowMs: number): void {
    for (const [key, entry] of this.authFailures) {
      if (nowMs - entry.lastAt > CLIENT_AUTH_IDLE_MS) this.authFailures.delete(key);
    }
    const prev = this.authFailures.get(clientId);
    const failures = (prev?.failures ?? 0) + 1;
    const excess = failures - CLIENT_AUTH_FREE_FAILURES;
    const wait =
      excess > 0
        ? Math.min(CLIENT_AUTH_BACKOFF_START_MS * 2 ** (excess - 1), CLIENT_AUTH_BACKOFF_CAP_MS)
        : 0;
    // This attempt already answers 401; the wait is stamped onto a LATER lastAt, and the next
    // attempt reads it through authBackoffRemainingMs — a caller that waits it out passes.
    this.authFailures.set(clientId, { failures, lastAt: nowMs + wait });
  }
}

export { USER_TOKEN_DEFAULT_TTL_DAYS, USER_TOKEN_MAX_TTL_DAYS };
