/**
 * user_tokens table repo: a person's program credential (personal access token). Stores only
 * sha256(token); the raw token is shown once, at mint. Minting lives in
 * `auth/user-token.ts` (which shares this table's shape), while this repo is the plain SQL
 * wrapper — read, list, stamp, revoke.
 *
 * It is NOT auth_sessions: a session is the browser cookie's row and is cleared whole on a
 * password reset (AuthSessionsRepo.deleteByUser), which must not reach a token a person handed
 * to an external app. The two differ in lifetime and in who revokes them, so they differ in table.
 */
import { Component, Use } from "@adelie/core/kernel";
import type { Db } from "../../hmr/capabilities.js";
import type { UserTokens } from "../../mechanisms/oauth.js";

export interface UserTokenRow {
  tokenId: string;
  userId: string;
  name: string;
  tokenHash: string;
  prefix: string;
  scope: string;
  createdBy: string;
  createdAt: string;
  /** ISO, or null for a token minted with no expiry. */
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** What a mint writes; the hash and prefix are derived by the caller (auth/user-token.ts). */
export type NewUserTokenRow = Omit<UserTokenRow, "lastUsedAt" | "revokedAt">;

function tokenOf(r: Record<string, unknown>): UserTokenRow {
  return {
    tokenId: r.token_id as string,
    userId: r.user_id as string,
    name: r.name as string,
    tokenHash: r.token_hash as string,
    prefix: r.prefix as string,
    scope: r.scope as string,
    createdBy: r.created_by as string,
    createdAt: r.created_at as string,
    expiresAt: (r.expires_at as string | null) ?? null,
    lastUsedAt: (r.last_used_at as string | null) ?? null,
    revokedAt: (r.revoked_at as string | null) ?? null,
  };
}

@Component()
export class UserTokensRepo implements UserTokens {
  @Use() private readonly db!: Db;

  insert(row: NewUserTokenRow): void {
    this.db
      .prepare(
        `INSERT INTO user_tokens
           (token_id, user_id, name, token_hash, prefix, scope, created_by, created_at, expires_at, last_used_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      )
      .run(
        row.tokenId,
        row.userId,
        row.name,
        row.tokenHash,
        row.prefix,
        row.scope,
        row.createdBy,
        row.createdAt,
        row.expiresAt,
      );
  }

  findByHash(tokenHash: string): UserTokenRow | null {
    const r = this.db.prepare("SELECT * FROM user_tokens WHERE token_hash = ?").get(tokenHash);
    return r ? tokenOf(r as Record<string, unknown>) : null;
  }

  findById(tokenId: string): UserTokenRow | null {
    const r = this.db.prepare("SELECT * FROM user_tokens WHERE token_id = ?").get(tokenId);
    return r ? tokenOf(r as Record<string, unknown>) : null;
  }

  listByUser(userId: string): UserTokenRow[] {
    const rows = this.db
      .prepare("SELECT * FROM user_tokens WHERE user_id = ? ORDER BY created_at, token_id")
      .all(userId) as Record<string, unknown>[];
    return rows.map(tokenOf);
  }

  /** Stamps a successful use. Write-only: introspection never reads it back into a response. */
  touch(tokenId: string, at: string): void {
    this.db.prepare("UPDATE user_tokens SET last_used_at = ? WHERE token_id = ?").run(at, tokenId);
  }

  /** Returns false when the row was already revoked (or never existed), so a repeat reads as a miss. */
  revoke(tokenId: string, at: string): boolean {
    const result = this.db
      .prepare("UPDATE user_tokens SET revoked_at = ? WHERE token_id = ? AND revoked_at IS NULL")
      .run(at, tokenId);
    return Number(result.changes) > 0;
  }

  deleteByUser(userId: string): void {
    this.db.prepare("DELETE FROM user_tokens WHERE user_id = ?").run(userId);
  }
}
