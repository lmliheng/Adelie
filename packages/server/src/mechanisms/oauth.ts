/**
 * The external-auth mechanisms: what a route or service may require, declared apart from what
 * implements it (the three repos and OAuthService). Only identity is on offer here — `openid`
 * and `profile`; reading Sessions or running an Agent is the Agent API's (AMSP) business and
 * stays out of this surface entirely.
 */
import { Interface } from "@adelie/core/kernel";
import type { NewUserTokenRow, UserTokenRow } from "../db/repos/user-tokens.js";
import type { NewOAuthClientRow, OAuthClientRow } from "../db/repos/oauth-clients.js";
import type { OAuthAuditEntry } from "../db/repos/oauth-audit.js";
import type { OAuthClientSummary, UserTokenSummary } from "../api/types.js";

/** UserTokens: the mechanism UserTokensRepo implements. */
@Interface()
export abstract class UserTokens {
  abstract insert(row: NewUserTokenRow): void;
  abstract findByHash(tokenHash: string): UserTokenRow | null;
  abstract findById(tokenId: string): UserTokenRow | null;
  abstract listByUser(userId: string): UserTokenRow[];
  abstract touch(tokenId: string, at: string): void;
  abstract revoke(tokenId: string, at: string): boolean;
  abstract deleteByUser(userId: string): void;
}

/** OAuthClients: the mechanism OAuthClientsRepo implements. */
@Interface()
export abstract class OAuthClients {
  abstract insert(row: NewOAuthClientRow): void;
  abstract findById(clientId: string): OAuthClientRow | null;
  abstract list(): OAuthClientRow[];
  abstract setDisabled(clientId: string, disabled: boolean): boolean;
  abstract touch(clientId: string, at: string): void;
  abstract delete(clientId: string): boolean;
}

/** OAuthAudit: the mechanism OAuthAuditRepo implements. */
@Interface()
export abstract class OAuthAudit {
  abstract record(entry: OAuthAuditEntry): void;
  abstract list(limit?: number): OAuthAuditEntry[];
}

/** What `POST /oauth/introspect` answers. The fields a caller with a live identity gets. */
export interface OAuthIntrospection {
  active: boolean;
  sub?: string;
  username?: string;
  name?: string;
  avatar?: string | null;
  scope?: string;
  client_id?: string;
  exp?: string | null;
}

/** What `GET /oauth/userinfo` answers — the direct route when only a name and avatar are wanted. */
export interface OAuthUserInfo {
  sub: string;
  username: string;
  name: string;
  avatar: string | null;
}

/** What a minted program token and its stored row look like on the way out (the raw token once). */
export interface MintedUserToken {
  token: string;
  row: UserTokenRow;
}

/** A freshly registered app: the raw secret appears here and never again. */
export interface RegisteredOAuthClient {
  clientId: string;
  clientSecret: string;
  row: OAuthClientRow;
}

/**
 * The policy the routes speak to (implemented by OAuthService). Kept as a mechanism so the route
 * modules depend on the decision rather than on the class that carries it out — the same shape
 * every other route group here uses.
 */
@Interface()
export abstract class ExternalAuth {
  abstract mint(opts: {
    userId: string;
    name: string;
    scope?: string;
    ttlDays?: number;
    createdBy: string;
  }): MintedUserToken;
  abstract listForUser(userId: string): UserTokenSummary[];
  /** Revokes by id, scoped to `ownerUserId` unless the caller is an admin. */
  abstract revoke(tokenId: string, opts: { actor: string; ownerUserId?: string }): boolean;
  abstract registerClient(opts: {
    clientName: string;
    scopes?: string;
    createdBy: string;
  }): RegisteredOAuthClient;
  abstract listClients(): OAuthClientSummary[];
  abstract disableClient(clientId: string, actor: string): boolean;
  abstract introspect(opts: {
    clientId: string;
    clientSecret: string;
    token: string;
  }): OAuthIntrospection;
  abstract userinfo(token: string): OAuthUserInfo | null;
  /** An app revoking the presented token. Requires the app's own credentials. */
  abstract revokeByToken(opts: { clientId: string; clientSecret: string; token: string }): void;
}
