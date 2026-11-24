/**
 * oauth_audit table repo: one row per introspection / revoke / mint, refusals included — the
 * refusals are the ones worth reading. Append-only and deliberately FK-free, so a row outlives
 * the account or client it names.
 */
import { Component, Use } from "@adelie/core/kernel";
import type { Db } from "../../hmr/capabilities.js";
import type { OAuthAudit } from "../../mechanisms/oauth.js";

/** The actions worth recording. A new one is a deliberate edit here, so the table stays readable. */
export type OAuthAuditAction =
  | "token_mint"
  | "token_revoked"
  | "client_registered"
  | "client_disabled"
  | "introspect"
  | "introspect_denied"
  | "userinfo"
  | "userinfo_denied"
  | "revoke_denied";

export interface OAuthAuditEntry {
  at: string;
  /** The user id or client_id that started it; null when neither is known. */
  actor: string | null;
  clientId: string | null;
  action: OAuthAuditAction;
  /** Whose token was asked about (a user id), when that is known. */
  subject: string | null;
  detail: string | null;
}

function entryOf(r: Record<string, unknown>): OAuthAuditEntry {
  return {
    at: r.at as string,
    actor: (r.actor as string | null) ?? null,
    clientId: (r.client_id as string | null) ?? null,
    action: r.action as OAuthAuditAction,
    subject: (r.subject as string | null) ?? null,
    detail: (r.detail as string | null) ?? null,
  };
}

@Component()
export class OAuthAuditRepo implements OAuthAudit {
  @Use() private readonly db!: Db;

  record(entry: OAuthAuditEntry): void {
    this.db
      .prepare(
        "INSERT INTO oauth_audit (at, actor, client_id, action, subject, detail) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(entry.at, entry.actor, entry.clientId, entry.action, entry.subject, entry.detail);
  }

  /** Most recent first — what an operator reads when something looks wrong. */
  list(limit = 100): OAuthAuditEntry[] {
    const rows = this.db
      .prepare("SELECT * FROM oauth_audit ORDER BY at DESC, rowid DESC LIMIT ?")
      .all(limit) as Record<string, unknown>[];
    return rows.map(entryOf);
  }
}
